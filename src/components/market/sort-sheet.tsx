import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton, SectionLabel, Sheet, SheetHeader, ToggleRow } from '@/components/controls';
import { SortPicker, type SortOption } from '@/components/sort-picker';
import { Colors } from '@/constants/theme';
import type { SearchOrder } from '@/db/scryfall';

export type MarketSort = {
  by: SearchOrder
  desc: boolean
  groupPrintings: boolean
}

export const DEFAULT_SORT: MarketSort = { by: 'eur', desc: true, groupPrintings: true }

export const SORTS: SortOption<SearchOrder>[] = [
  { value: 'name', label: 'Name', glyph: 'Aa', asc: 'A → Z', desc: 'Z → A' },
  { value: 'cmc', label: 'Mana value', glyph: 'MV', asc: 'Low → High', desc: 'High → Low' },
  { value: 'power', label: 'Power', glyph: 'P', asc: 'Low → High', desc: 'High → Low' },
  { value: 'toughness', label: 'Toughness', glyph: 'T', asc: 'Low → High', desc: 'High → Low' },
  { value: 'eur', label: 'Price', glyph: '€', asc: 'Cheapest first', desc: 'Priciest first' },
  { value: 'released', label: 'Release date', glyph: 'Yr', asc: 'Oldest first', desc: 'Newest first' },
]

// "Price · priciest first", for the Sort button on the Market screen.
export function sortSummary(sort: MarketSort) {
  const def = SORTS.find((s) => s.value === sort.by)!
  const order = sort.desc ? def.desc : def.asc
  return `${def.label} · ${order.charAt(0).toLowerCase()}${order.slice(1)}`
}

// "Sort & display" sheet. Changes are a draft until Apply; closing the sheet drops them.
export function SortSheet({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean
  value: MarketSort
  onApply: (value: MarketSort) => void
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
        <SheetHeader title="Sort & display" onClose={onClose} />

        <SortPicker
          options={SORTS}
          by={draft.by}
          desc={draft.desc}
          onBy={(by) => setDraft({ ...draft, by })}
          onDesc={(desc) => setDraft({ ...draft, desc })}
        />

        <SectionLabel style={styles.label}>Display</SectionLabel>
        <View style={styles.display}>
          <ToggleRow
            bare
            title="Group printings"
            subtitle="One row per card, cheapest printing shown"
            value={draft.groupPrintings}
            onChange={(groupPrintings) => setDraft({ ...draft, groupPrintings })}
          />
        </View>

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
  label: {
    marginTop: 22,
    marginBottom: 10,
  },
  display: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
  },
  apply: {
    marginTop: 28,
  },
})
