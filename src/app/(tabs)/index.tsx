import { Link, useFocusEffect, useIsFocused } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewToken,
} from 'react-native';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TiltContext, TiltSensor } from '@/components/card-effects/tilt';
import { CardTile } from '@/components/card-tile';
import { ManaSymbol } from '@/components/mana-symbol';
import { SortMenu, type SortOption } from '@/components/sort-menu';
import { Colors, Fonts } from '@/constants/theme';
import { entryPrice, getCollection, getOwnedPricesDaysAgo, type CollectionEntry } from '@/db/collection';
import { formatEur } from '@/utils/format';

// Cards per row, like a 9-pocket binder page.
const COLUMNS = 3

// A card counts as visible as soon as any part of it is on screen.
const VIEWABILITY = { itemVisiblePercentThreshold: 1 }

// Color filter chips: WUBRG + colorless ('C' = no colors), shown as their mana symbols.
const COLOR_FILTERS = [
  { key: 'W', label: 'White' },
  { key: 'U', label: 'Blue' },
  { key: 'B', label: 'Black' },
  { key: 'R', label: 'Red' },
  { key: 'G', label: 'Green' },
  { key: 'C', label: 'Colorless' },
] as const
type ColorKey = (typeof COLOR_FILTERS)[number]['key']

export default function BinderScreen() {
  const db = useSQLiteContext()
  const isFocused = useIsFocused()
  const reducedMotion = useReducedMotion()
  const tiltX = useSharedValue(0)
  const tiltY = useSharedValue(0)
  // One stable object: a new one each render would re-render every card through the context.
  const [tilt] = useState(() => ({ x: tiltX, y: tiltY }))
  const insets = useSafeAreaInsets()
  const [entries, setEntries] = useState<CollectionEntry[]>([])
  const [weekChange, setWeekChange] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [color, setColor] = useState<ColorKey | null>(null)
  const [sort, setSort] = useState<SortOption>('recent')
  const [sortOpen, setSortOpen] = useState(false)
  const [visibleIds, setVisibleIds] = useState<Set<number>>(() => new Set())

  // Fires only when the set of visible cards changes, not on every scroll frame.
  // Must keep the same identity: FlatList doesn't allow changing it on the fly.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<CollectionEntry | null>[] }) => {
      setVisibleIds(new Set(viewableItems.flatMap((v) => (v.item ? [v.item.id] : []))))
    },
    [],
  )

  const load = useCallback(async () => {
    const [collection, weekAgo] = await Promise.all([getCollection(db), getOwnedPricesDaysAgo(db, 7)])
    setEntries(collection)
    // Change only counts cards we have a week-old price for; null until a week of history exists.
    const old = new Map(weekAgo.map((p) => [p.card_id, p]))
    let change: number | null = null
    for (const e of collection) {
      const before = old.get(e.card_id)
      if (!before) continue
      const now = entryPrice(e)
      const then = entryPrice({ finish: e.finish, ...before })
      if (now == null || then == null) continue
      change = (change ?? 0) + (now - then) * e.quantity
    }
    setWeekChange(change)
    setLoaded(true)
  }, [db])

  // Reload whenever the tab is shown, so cards scanned on the Scan tab appear.
  useFocusEffect(
    useCallback(() => {
      load().catch((e) => console.warn('Failed to load binder', e))
    }, [load]),
  )

  const totalValue = entries.reduce((sum, e) => sum + (entryPrice(e) ?? 0) * e.quantity, 0)
  const totalCards = entries.reduce((sum, e) => sum + e.quantity, 0)

  // No useMemo needed: the React Compiler (enabled in app.json) memoizes this.
  const q = query.trim().toLowerCase()
  const filtered = entries.filter((e) => {
    if (q && !e.name.toLowerCase().includes(q)) return false
    if (!color) return true
    const colors: string[] = JSON.parse(e.colors)
    return color === 'C' ? colors.length === 0 : colors.includes(color)
  })
  const visible =
    sort === 'price' ? [...filtered].sort((a, b) => (entryPrice(b) ?? 0) - (entryPrice(a) ?? 0))
    : sort === 'name' ? [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    : filtered // getCollection already returns most recently added first

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Binder</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setSortOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Sort and view options"
        >
          <SymbolView name={{ ios: 'slider.horizontal.3', android: 'tune' }} size={22} tintColor={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.valueRow} accessibilityLabel={`Collection value ${formatEur(totalValue)}, ${totalCards} cards`}>
        <View>
          <Text style={styles.sectionLabel}>Collection value</Text>
          <Text style={styles.value}>{formatEur(totalValue)}</Text>
        </View>
        <View style={styles.changeBox}>
          {weekChange != null && (
            <Text style={[styles.change, { color: weekChange >= 0 ? Colors.positive : Colors.negative }]}>
              {weekChange >= 0 ? '▲' : '▼'} {formatEur(Math.abs(weekChange))}
            </Text>
          )}
          <Text style={styles.changeLabel}>
            {weekChange != null ? 'this week · ' : ''}{totalCards} {totalCards === 1 ? 'card' : 'cards'}
          </Text>
        </View>
      </View>

      <View style={styles.search}>
        <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={20} tintColor={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search your binder"
          placeholderTextColor={Colors.textMuted}
          accessibilityLabel="Search your binder"
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.filters}>
        <Pressable
          style={[styles.allChip, color == null && styles.chipActive]}
          onPress={() => setColor(null)}
          accessibilityRole="button"
          accessibilityState={{ selected: color == null }}
        >
          <Text style={[styles.allLabel, color == null && styles.allLabelActive]}>All</Text>
        </Pressable>
        {COLOR_FILTERS.map((f) => {
          const selected = color === f.key
          return (
            <Pressable
              key={f.key}
              style={styles.colorChip}
              onPress={() => setColor(selected ? null : f.key)}
              accessibilityRole="button"
              accessibilityLabel={f.label}
              accessibilityState={{ selected }}
            >
              {/* The mana tile is the whole chip; a gold outline marks the picked color. */}
              <ManaSymbol symbol={f.key} size={36} />
              {selected && <View pointerEvents="none" style={styles.colorChipActive} />}
            </Pressable>
          )
        })}
      </View>
    </View>
  )

  return (
    <View style={styles.root}>
      {/* One gravity sensor for all cards, only while this tab is visible (battery). */}
      {isFocused && !reducedMotion && <TiltSensor tilt={tilt} />}
      <View pointerEvents="none" style={styles.glow} />
      {/* Header stays fixed; only the card grid below scrolls. */}
      <View style={{ paddingTop: insets.top + 8 }}>{header}</View>
      <TiltContext value={tilt}>
      <FlatList<CollectionEntry | null>
        style={styles.grid}
        // Empty slots fill the last row, so its cards keep the same width instead of stretching.
        data={[...visible, ...Array<null>((COLUMNS - (visible.length % COLUMNS)) % COLUMNS).fill(null)]}
        keyExtractor={(e, i) => (e ? String(e.id) : `spacer-${i}`)}
        numColumns={COLUMNS}
        renderItem={({ item }) =>
          item ? <CardTile entry={item} active={visibleIds.has(item.id)} /> : <View style={{ flex: 1 }} />
        }
        extraData={visibleIds}
        // Only on-screen cards follow the tilt (see CardTile's `active`).
        viewabilityConfig={VIEWABILITY}
        onViewableItemsChanged={onViewableItemsChanged}
        // Keep fewer off-screen rows mounted (default is 10 screens each way).
        windowSize={5}
        ListEmptyComponent={
          !loaded ? null : entries.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Your binder is empty</Text>
              <Text style={styles.emptyText}>Scan your cards or import a collection to start.</Text>
              <Link href="/scan" asChild>
                <Pressable style={styles.primaryBtn} accessibilityRole="button">
                  <Text style={styles.primaryBtnLabel}>Scan cards</Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No cards match your search.</Text>
            </View>
          )
        }
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
      </TiltContext>
      <SortMenu
        visible={sortOpen}
        top={insets.top + 64}
        value={sort}
        onSelect={setSort}
        onClose={() => setSortOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  glow: {
    position: 'absolute',
    left: -120,
    top: -200,
    width: 630,
    height: 460,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(212,166,74,0.15), rgba(212,166,74,0))',
  },
  grid: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 32,
  },
  header: {
    gap: 18,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 42,
    lineHeight: 46,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  value: {
    marginTop: 6,
    fontSize: 34,
    fontFamily: Fonts.extraBold,
    letterSpacing: -0.5,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  changeBox: {
    alignItems: 'flex-end',
    paddingBottom: 5,
  },
  change: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
  },
  changeLabel: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  search: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  allChip: {
    height: 36,
    paddingHorizontal: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: Colors.surface,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.14)',
  },
  allLabel: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Colors.textSecondary,
  },
  allLabelActive: {
    color: Colors.goldLight,
  },
  colorChip: {
    width: 36,
    height: 36,
  },
  // Round, like the mana symbol under it.
  colorChipActive: {
    ...StyleSheet.absoluteFill,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.goldLight,
  },
  gridRow: {
    gap: 10,
    marginBottom: 18,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    fontSize: 28,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 20,
    height: 52,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
  },
  primaryBtnLabel: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
})
