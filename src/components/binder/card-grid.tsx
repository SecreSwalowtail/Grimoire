import { useIsFocused } from 'expo-router';
import { useCallback, useState, type ReactElement } from 'react';
import { FlatList, StyleSheet, View, type ViewToken } from 'react-native';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';

import { TiltContext, TiltSensor } from '@/components/card-effects/tilt';
import { CardTile } from '@/components/card-tile';
import type { CardSort } from '@/components/sort-menu';
import { entryPrice, type CollectionEntry } from '@/db/collection';

// Cards per row, like a 9-pocket binder page.
const COLUMNS = 3

// A card counts as visible as soon as any part of it is on screen.
const VIEWABILITY = { itemVisiblePercentThreshold: 1 }

// Owned cards in a scrolling 3-column grid. The cards tilt with the phone while the screen is shown.
export function CardGrid({ entries, empty }: { entries: CollectionEntry[]; empty: ReactElement | null }) {
  const isFocused = useIsFocused()
  const reducedMotion = useReducedMotion()
  const tiltX = useSharedValue(0)
  const tiltY = useSharedValue(0)
  // One stable object: a new one each render would re-render every card through the context.
  const [tilt] = useState(() => ({ x: tiltX, y: tiltY }))
  const [visibleIds, setVisibleIds] = useState<Set<number>>(() => new Set())

  // Fires only when the set of visible cards changes, not on every scroll frame.
  // Must keep the same identity: FlatList doesn't allow changing it on the fly.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<CollectionEntry | null>[] }) => {
      setVisibleIds(new Set(viewableItems.flatMap((v) => (v.item ? [v.item.id] : []))))
    },
    [],
  )

  return (
    <>
      {/* One gravity sensor for all cards, only while this screen is visible (battery). */}
      {isFocused && !reducedMotion && <TiltSensor tilt={tilt} />}
      <TiltContext value={tilt}>
        <FlatList<CollectionEntry | null>
          style={styles.grid}
          // Empty slots fill the last row, so its cards keep the same width instead of stretching.
          data={[...entries, ...Array<null>((COLUMNS - (entries.length % COLUMNS)) % COLUMNS).fill(null)]}
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
          ListEmptyComponent={empty}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      </TiltContext>
    </>
  )
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
  row: {
    gap: 10,
    marginBottom: 18,
  },
})

// Cards whose name contains the search, in the picked order. The collection comes most recently
// added first, so 'recent' keeps it as it is.
export function searchAndSort(entries: CollectionEntry[], query: string, sort: CardSort) {
  const q = query.trim().toLowerCase()
  const found = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries
  if (sort === 'price') return [...found].sort((a, b) => (entryPrice(b) ?? 0) - (entryPrice(a) ?? 0))
  if (sort === 'name') return [...found].sort((a, b) => a.name.localeCompare(b.name))
  return found
}
