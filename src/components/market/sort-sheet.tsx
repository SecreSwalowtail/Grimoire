import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SectionLabel, Segmented, Sheet, SheetHeader, ToggleRow } from '@/components/controls';
import { Colors, Fonts } from '@/constants/theme';
import type { SearchOrder } from '@/db/scryfall';

export type MarketSort = {
  by: SearchOrder
  desc: boolean
  groupPrintings: boolean
  hideNotLegal: boolean
}

export const DEFAULT_SORT: MarketSort = { by: 'eur', desc: true, groupPrintings: true, hideNotLegal: true }

// Order labels depend on what is sorted, e.g. "Cheapest first" for price.
export const SORTS: { value: SearchOrder; label: string; glyph: string; asc: string; desc: string }[] = [
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
  const current = SORTS.find((s) => s.value === draft.by)!

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView bounces={false}>
        <SheetHeader title="Sort & display" onClose={onClose} />

        <SectionLabel style={styles.label}>Sort by</SectionLabel>
        <View style={styles.sorts} accessibilityRole="radiogroup" accessibilityLabel="Sort by">
          {SORTS.map((sort) => {
            const selected = sort.value === draft.by
            return (
              <Pressable
                key={sort.value}
                style={[styles.sort, selected && styles.sortSelected]}
                onPress={() => setDraft({ ...draft, by: sort.value })}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
              >
                <View style={[styles.glyph, selected && styles.glyphSelected]}>
                  <Text style={[styles.glyphLabel, selected && styles.glyphLabelSelected]}>{sort.glyph}</Text>
                </View>
                <Text style={styles.sortLabel} numberOfLines={1}>{sort.label}</Text>
                {selected && <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={16} tintColor={Colors.goldLight} />}
              </Pressable>
            )
          })}
        </View>

        <SectionLabel style={styles.label}>Order</SectionLabel>
        <Segmented
          label="Order"
          options={[
            { value: 'asc', label: current.asc },
            { value: 'desc', label: current.desc },
          ]}
          value={draft.desc ? 'desc' : 'asc'}
          onChange={(order) => setDraft({ ...draft, desc: order === 'desc' })}
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
          <ToggleRow
            bare
            style={styles.divider}
            title="Ignore not-legal cards"
            subtitle="Hide cards banned or not legal in your format filters"
            value={draft.hideNotLegal}
            onChange={(hideNotLegal) => setDraft({ ...draft, hideNotLegal })}
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
  sorts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sort: {
    // Two per row: half the width minus half the gap.
    width: '48.5%',
    flexGrow: 1,
    height: 54,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sortSelected: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.10)',
  },
  glyph: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphSelected: {
    backgroundColor: Colors.gold,
  },
  glyphLabel: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: '#CFC7B4',
  },
  glyphLabelSelected: {
    color: Colors.onGold,
  },
  sortLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  display: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.07)',
  },
  apply: {
    marginTop: 28,
  },
})
