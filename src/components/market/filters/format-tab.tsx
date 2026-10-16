import { StyleSheet, Text, View } from 'react-native'

import { Chip, SectionLabel, Segmented } from '@/components/controls'
import { Colors, Fonts } from '@/constants/theme'
import type { LegalStatus, MarketFilters } from '@/utils/market-filters'

// Keys are Scryfall's legality names: only formats Scryfall tracks can be searched by.
const FORMATS = [
  { key: 'standard', label: 'Standard' },
  { key: 'pioneer', label: 'Pioneer' },
  { key: 'modern', label: 'Modern' },
  { key: 'legacy', label: 'Legacy' },
  { key: 'vintage', label: 'Vintage' },
  { key: 'commander', label: 'Commander' },
  { key: 'oathbreaker', label: 'Oathbreaker' },
  { key: 'brawl', label: 'Brawl' },
  { key: 'timeless', label: 'Timeless' },
  { key: 'historic', label: 'Historic' },
  { key: 'pauper', label: 'Pauper' },
  { key: 'oldschool', label: 'Old School' },
  { key: 'premodern', label: 'Premodern' },
  { key: 'standardbrawl', label: 'Standard Brawl' },
  { key: 'gladiator', label: 'Gladiator' },
  { key: 'paupercommander', label: 'Pauper Cmdr' },
  { key: 'penny', label: 'Penny' },
  { key: 'duel', label: 'Duel Cmdr' },
  { key: 'predh', label: 'PreDH' },
]

const STATUSES: { value: LegalStatus; label: string; dot: string }[] = [
  { value: 'legal', label: 'Legal', dot: Colors.positive },
  { value: 'restricted', label: 'Restricted', dot: Colors.goldLight },
  { value: 'banned', label: 'Banned', dot: Colors.negative },
]

export function FormatTab({ filters, onChange }: { filters: MarketFilters; onChange: (patch: Partial<MarketFilters>) => void }) {
  const picked = FORMATS.filter((f) => filters.formats.includes(f.key)).map((f) => f.label)
  const status = STATUSES.find((s) => s.value === filters.formatStatus)!
  const summary = picked.length === 0
    ? 'No format selected — cards from every format are shown.'
    : `Showing cards that are ${status.label.toLowerCase()} in ${filters.formatsMatchAll ? 'all of' : 'any of'}: ${picked.join(', ')}.`

  return (
    <View>
      <SectionLabel style={styles.label}>Card is</SectionLabel>
      <Segmented
        label="Legality status"
        options={STATUSES}
        value={filters.formatStatus}
        onChange={(formatStatus) => onChange({ formatStatus })}
      />

      <View style={styles.formatsHeader}>
        <SectionLabel>In formats</SectionLabel>
        <Segmented
          small
          label="Match formats"
          options={[
            { value: 'all', label: 'Match all' },
            { value: 'any', label: 'Match any' },
          ]}
          value={filters.formatsMatchAll ? 'all' : 'any'}
          onChange={(match) => onChange({ formatsMatchAll: match === 'all' })}
        />
      </View>

      <View style={styles.chips}>
        {FORMATS.map((format) => {
          const selected = filters.formats.includes(format.key)
          return (
            <Chip
              key={format.key}
              label={format.label}
              selected={selected}
              onPress={() =>
                onChange({
                  formats: selected ? filters.formats.filter((k) => k !== format.key) : [...filters.formats, format.key],
                })
              }
            />
          )
        })}
      </View>

      <Text style={styles.summary}>{summary}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    marginBottom: 10,
  },
  formatsHeader: {
    marginTop: 22,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summary: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
})
