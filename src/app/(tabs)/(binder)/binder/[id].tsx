import { Link, router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardGrid, searchAndSort } from '@/components/binder/card-grid';
import { SearchField, SortButton, ValueSummary } from '@/components/binder/parts';
import { summarize, useCollection } from '@/components/binder/use-collection';
import { CARD_SORTS, SortMenu, type CardSort } from '@/components/sort-menu';
import { Colors, Fonts } from '@/constants/theme';
import { binderSpine } from '@/db/binders';

// One binder opened: its value, a search, and its cards in a 3-column grid.
export default function BinderScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { binders, entries, weekAgo, loaded } = useCollection()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<CardSort>('recent')
  const [sortOpen, setSortOpen] = useState(false)

  const binder = binders.find((b) => b.id === id)
  // No useMemo needed: the React Compiler (enabled in app.json) memoizes these.
  const inside = entries.filter((e) => e.binder_id === id)
  const { value, cards, change } = summarize(inside, weekAgo)
  const visible = searchAndSort(inside, query, sort)

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.glow} />
      {/* Header stays fixed; only the card grid below scrolls. */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityRole="button">
            <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left' }} size={22} tintColor={Colors.text} />
            <Text style={styles.backLabel}>Binders</Text>
          </TouchableOpacity>
          <SortButton label="Sort cards" onPress={() => setSortOpen(true)} />
        </View>

        {binder && (
          <View style={styles.titleRow}>
            <View style={[styles.spine, { experimental_backgroundImage: binderSpine(binder.color) }]} />
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{binder.name}</Text>
          </View>
        )}

        <ValueSummary label="Binder value" value={value} cards={cards} change={change} />

        <SearchField value={query} onChange={setQuery} placeholder="Search this binder" />
      </View>

      <CardGrid
        entries={visible}
        empty={
          !loaded ? null : inside.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>This binder is empty</Text>
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
      />

      <SortMenu
        visible={sortOpen}
        top={insets.top + 56}
        options={CARD_SORTS}
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
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(212,166,74,0.17), rgba(212,166,74,0))',
  },
  header: {
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    height: 44,
    marginLeft: -6,
    paddingLeft: 4,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backLabel: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // The binder's spine, in its cover color.
  spine: {
    width: 14,
    height: 40,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,240,215,0.14)',
  },
  title: {
    flex: 1,
    fontSize: 38,
    lineHeight: 44,
    fontFamily: Fonts.serif,
    color: Colors.text,
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
