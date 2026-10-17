import { useIsFocused } from 'expo-router'
import { useCallback, useState, useSyncExternalStore, type ComponentProps, type ReactElement } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewToken } from 'react-native'
import { FlatList, type GestureType } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'

import { TiltContext, TiltSensor } from '@/components/card-effects/tilt'
import { CardTile } from '@/components/card-tile'
import { EDIT_BAR } from '@/components/deck/card-drag'
import { GroupIcon } from '@/components/deck/parts'
import { Icon } from '@/components/icon'
import type { CardSort } from '@/components/sort-menu'
import { Colors, Fonts } from '@/constants/theme'
import { entryPrice, type CollectionEntry } from '@/db/collection'
import { groupLines, parseColors, primaryType, type Group, type Groupable, type GroupBy } from '@/rules/deck-stats'
import { createListeners } from '@/utils/listeners'
import { useMoney } from '@/utils/money'
import { useAnimationsOff } from '@/utils/motion'

// Cards per row, like a 9-pocket binder page.
const COLUMNS = 3

// A card counts as visible as soon as any part of it is on screen.
const VIEWABILITY = { itemVisiblePercentThreshold: 1 }

// A binder's edit mode, for the grid: which cards are selected, what a tap and a hold do, each
// card's drag gesture, and whether cards are being dragged (the grid doesn't scroll meanwhile).
type GridEdit = {
  editing: boolean
  selected: number[]
  dragging: boolean
  onToggle: (entry: CollectionEntry) => void
  onHold: (entry: CollectionEntry) => void
  gestureFor: (entry: CollectionEntry) => GestureType
}

// A binder card, as grouping reads it (the same groups as a deck's cards).
type EntryLine = Groupable & { entry: CollectionEntry }

const lineOf = (entry: CollectionEntry): EntryLine => ({
  entry,
  commander: false,
  type: primaryType(entry.type_line ?? ''),
  cmc: entry.cmc ?? 0,
  colors: parseColors(entry.colors),
  rarity: entry.rarity,
  set: entry.set_code,
  setName: entry.set_name,
  quantity: entry.quantity,
  price: entryPrice(entry),
})

// What the list shows: a group's header, or a row of up to three cards.
type Item =
  | { kind: 'head'; key: string; group: Group<EntryLine>; open: boolean }
  | { kind: 'row'; key: string; cards: CollectionEntry[] }

const rowsOf = (cards: CollectionEntry[], prefix: string): Item[] =>
  Array.from({ length: Math.ceil(cards.length / COLUMNS) }, (_, i) => {
    const row = cards.slice(i * COLUMNS, (i + 1) * COLUMNS)
    return { kind: 'row', key: `${prefix}${row[0].id}`, cards: row }
  })

// Owned cards in a scrolling 3-column grid, in groups when `groupBy` says so (each group's header
// opens and closes it, like a deck's). The cards tilt with the phone while the screen is shown,
// except in edit mode (`edit`), where they lie still and the bottom leaves room for the edit bar.
// `onOpen` gets a tapped card and the ids of the cards on show, in the grid's order (open groups
// only).
export function CardGrid({
  entries,
  empty,
  edit,
  groupBy = 'none',
  onOpen,
}: {
  entries: CollectionEntry[]
  empty: ReactElement | null
  edit?: GridEdit
  groupBy?: GroupBy
  onOpen?: (entry: CollectionEntry, shown: number[]) => void
}) {
  const money = useMoney()
  const isFocused = useIsFocused()
  const reducedMotion = useAnimationsOff()
  const editing = edit?.editing ?? false
  const tiltX = useSharedValue(0)
  const tiltY = useSharedValue(0)
  // One stable object: a new one each render would re-render every card through the context.
  const [tilt] = useState(() => ({ x: tiltX, y: tiltY }))
  const [visibility] = useState(createVisibility)
  // Groups closed by the user (all open to start).
  const [closed, setClosed] = useState<string[]>([])

  // Fires only when the set of visible cards changes, not on every scroll frame.
  // Must keep the same identity: FlatList doesn't allow changing it on the fly.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<Item>[] }) => {
      visibility.set(new Set(viewableItems.flatMap((v) => (v.item.kind === 'row' ? v.item.cards.map((c) => c.id) : []))))
    },
    [visibility],
  )

  // No useMemo needed: the React Compiler (enabled in app.json) memoizes this.
  const items: Item[] =
    groupBy === 'none'
      ? rowsOf(entries, '')
      : groupLines(entries.map(lineOf), groupBy).flatMap((group) => {
          const open = !closed.includes(group.key)
          const head: Item = { kind: 'head', key: `head-${group.key}`, group, open }
          return open ? [head, ...rowsOf(group.lines.map((l) => l.entry), `${group.key}-`)] : [head]
        })

  const shown = () => items.flatMap((item) => (item.kind === 'row' ? item.cards.map((c) => c.id) : []))

  const tile = (entry: CollectionEntry) => (
    <GridTile
      key={entry.id}
      visibility={visibility}
      entry={entry}
      onOpen={onOpen && (() => onOpen(entry, shown()))}
      edit={
        edit && {
          editing,
          selected: edit.selected.includes(entry.id),
          onToggle: () => edit.onToggle(entry),
          onHold: () => edit.onHold(entry),
          gesture: edit.gestureFor(entry),
        }
      }
    />
  )

  return (
    <>
      {/* One gravity sensor for all cards, only while this screen is visible (battery). */}
      {isFocused && !reducedMotion && !editing && <TiltSensor tilt={tilt} />}
      <TiltContext value={tilt}>
        {/* Gesture handler's list: a card picked up to drag takes the touch from it. */}
        <FlatList<Item>
          showsVerticalScrollIndicator={false}
          style={styles.grid}
          data={items}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => {
            if (item.kind === 'head') {
              const { group, open } = item
              return (
                <Pressable
                  style={styles.head}
                  onPress={() => setClosed(open ? [...closed, group.key] : closed.filter((k) => k !== group.key))}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${group.name}, ${group.count} cards, ${money.eur(group.value)}`}
                >
                  <GroupIcon head={group.head} />
                  <View style={styles.headTitle}>
                    <Text style={styles.headName} numberOfLines={1}>{group.name}</Text>
                    <Text style={styles.headCount}>{group.count}</Text>
                  </View>
                  <Text style={styles.headValue}>{money.eur(group.value)}</Text>
                  <Icon
                    name={open ? { ios: 'chevron.up', android: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more' }}
                    size={16}
                    tintColor={Colors.textMuted}
                  />
                </Pressable>
              )
            }
            return (
              <View style={styles.row}>
                {item.cards.map(tile)}
                {/* Empty slots fill a short row, so its cards keep their width instead of stretching. */}
                {Array.from({ length: COLUMNS - item.cards.length }, (_, i) => (
                  <View key={`spacer-${i}`} style={styles.spacer} />
                ))}
              </View>
            )
          }}
          extraData={edit}
          scrollEnabled={!edit?.dragging}
          // Only on-screen cards follow the tilt (see CardTile's `active`).
          viewabilityConfig={VIEWABILITY}
          onViewableItemsChanged={onViewableItemsChanged}
          // Keep fewer off-screen rows mounted (default is 10 screens each way).
          windowSize={5}
          ListEmptyComponent={empty}
          contentContainerStyle={[styles.content, editing && styles.contentEditing]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      </TiltContext>
    </>
  )
}

// Which cards are on screen, kept outside React state: each tile reads its own part, so when the
// set changes only the tiles that came into or went out of view redraw. (As the list's extraData
// it redrew every row of cards on each change.)
type Visibility = ReturnType<typeof createVisibility>

function createVisibility() {
  let ids = new Set<number>()
  const changes = createListeners()
  return {
    set(next: Set<number>) {
      ids = next
      changes.notify()
    },
    has: (id: number) => ids.has(id),
    subscribe: changes.subscribe,
  }
}

// A card in the grid, tilting with the phone only while it's on screen (see CardTile's `active`).
function GridTile({ visibility, entry, ...props }: { visibility: Visibility } & Omit<ComponentProps<typeof CardTile>, 'active'>) {
  const active = useSyncExternalStore(visibility.subscribe, () => visibility.has(entry.id))
  return <CardTile entry={entry} active={active} {...props} />
}

const styles = StyleSheet.create({
  grid: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 32,
  },
  contentEditing: {
    paddingBottom: EDIT_BAR + 40,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  spacer: {
    flex: 1,
  },
  // A group's header: like a deck's, across the grid.
  head: {
    minHeight: 50,
    marginBottom: 12,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  headName: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  headCount: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  headValue: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
})

// Cards whose name contains the search, in the picked order. The collection comes most recently
// added first, so 'recent' keeps it as it is.
export function searchAndSort(entries: CollectionEntry[], query: string, sort: CardSort) {
  const q = query.trim().toLowerCase()
  const found = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries
  if (sort === 'price') return [...found].sort((a, b) => (entryPrice(b) ?? 0) - (entryPrice(a) ?? 0))
  // Cards without a price go last rather than leading as the cheapest.
  if (sort === 'priceAsc') return [...found].sort((a, b) => (entryPrice(a) ?? Infinity) - (entryPrice(b) ?? Infinity))
  if (sort === 'name') return [...found].sort((a, b) => a.name.localeCompare(b.name))
  return found
}
