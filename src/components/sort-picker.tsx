import { Pressable, StyleSheet, Text, View } from 'react-native'

import { SectionLabel, Segmented } from '@/components/controls'
import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'

// One way to sort. Order labels depend on what is sorted, e.g. "Cheapest first" for price.
export type SortOption<T extends string> = { value: T; label: string; glyph: string; asc: string; desc: string }

// "Sort by" tiles (two per row) and the "Order" switch, as used in the Sort sheets.
// `by` null: no tile picked yet.
export function SortPicker<T extends string>({
  options,
  by,
  desc,
  onBy,
  onDesc,
}: {
  options: SortOption<T>[]
  by: T | null
  desc: boolean
  onBy: (by: T) => void
  onDesc: (desc: boolean) => void
}) {
  const current = options.find((o) => o.value === by) ?? options[0]
  return (
    <>
      <SectionLabel style={styles.label}>Sort by</SectionLabel>
      <View style={styles.sorts} accessibilityRole="radiogroup" accessibilityLabel="Sort by">
        {options.map((option) => {
          const selected = option.value === by
          return (
            <Pressable
              key={option.value}
              style={[styles.sort, selected && styles.sortSelected]}
              onPress={() => onBy(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
            >
              <View style={[styles.glyph, selected && styles.glyphSelected]}>
                <Text style={[styles.glyphLabel, selected && styles.glyphLabelSelected]}>{option.glyph}</Text>
              </View>
              <Text style={styles.sortLabel} numberOfLines={1}>{option.label}</Text>
              {selected && <Icon name={{ ios: 'checkmark', android: 'check' }} size={16} tintColor={Colors.goldLight} />}
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
        value={desc ? 'desc' : 'asc'}
        onChange={(order) => onDesc(order === 'desc')}
      />
    </>
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
})
