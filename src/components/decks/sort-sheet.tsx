import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton, Sheet, SheetHeader } from '@/components/controls';
import { SortPicker, type SortOption } from '@/components/sort-picker';
import { deckManaValue, deckValue, type Deck, type DeckData, type Folder } from '@/utils/deck-store';

export type DeckSortBy = 'name' | 'format' | 'value' | 'mana'
// `by` null: no sort, decks and folders in your own order (as arranged in Manage decks).
export type DeckSort = { by: DeckSortBy | null; desc: boolean }

export const DEFAULT_DECK_SORT: DeckSort = { by: null, desc: false }

const DECK_SORTS: SortOption<DeckSortBy>[] = [
  { value: 'name', label: 'Name', glyph: 'Aa', asc: 'Ascending', desc: 'Descending' },
  { value: 'format', label: 'Format', glyph: 'Fmt', asc: 'Ascending', desc: 'Descending' },
  { value: 'value', label: 'Value', glyph: '€', asc: 'Ascending', desc: 'Descending' },
  { value: 'mana', label: 'Avg. mana', glyph: 'MV', asc: 'Ascending', desc: 'Descending' },
]

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

// Descending flips the comparison rather than the list, so ties keep your order either way.
// Decks without an average mana value (no cards) go last in both directions.
export function sortDecks(decks: Deck[], sort: DeckSort, data: DeckData) {
  const dir = sort.desc ? -1 : 1
  switch (sort.by) {
    case 'name':
      return [...decks].sort((a, b) => dir * byName(a, b))
    case 'format':
      return [...decks].sort((a, b) => dir * (a.format.localeCompare(b.format) || byName(a, b)))
    case 'value':
      return [...decks].sort((a, b) => dir * (deckValue(a, data) - deckValue(b, data)))
    case 'mana':
      return [...decks].sort((a, b) => {
        const x = deckManaValue(a, data)
        const y = deckManaValue(b, data)
        if (x == null || y == null) return Number(x == null) - Number(y == null)
        return dir * (x - y)
      })
    default:
      return decks
  }
}

// Folders sort by name, or by value (their decks added up); format and mana keep your order.
// Pinned folders always come first.
export function sortFolders(folders: Folder[], decks: Deck[], sort: DeckSort, data: DeckData) {
  const dir = sort.desc ? -1 : 1
  const value = (folder: Folder) => decks.reduce((sum, d) => sum + (d.folderId === folder.id ? deckValue(d, data) : 0), 0)
  const list = [...folders]
  if (sort.by === 'name') list.sort((a, b) => dir * byName(a, b))
  if (sort.by === 'value') list.sort((a, b) => dir * (value(a) - value(b)))
  return list.sort((a, b) => Number(b.pinned) - Number(a.pinned))
}

// "Sort decks" sheet: like Market's Sort & display, without the display options.
// Changes are a draft until Apply; closing the sheet drops them. Reset goes back to your order.
export function DeckSortSheet({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean
  value: DeckSort
  onApply: (value: DeckSort) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(value)
  // Start every opening from the applied sort (state adjusted during render, no effect needed).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) setDraft(value)
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView bounces={false}>
        <SheetHeader title="Sort decks" onClose={onClose} onReset={() => setDraft(DEFAULT_DECK_SORT)} />
        <SortPicker
          options={DECK_SORTS}
          by={draft.by}
          desc={draft.desc}
          onBy={(by) => setDraft({ ...draft, by })}
          onDesc={(desc) => setDraft({ ...draft, desc })}
        />
        <View style={styles.apply}>
          <PrimaryButton
            label="Apply"
            onPress={() => {
              onApply(draft)
              onClose()
            }}
          />
        </View>
      </ScrollView>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  apply: {
    marginTop: 28,
  },
})
