import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Chip, SectionLabel, Segmented, ToggleRow } from '@/components/controls';
import { Colors, Fonts, RarityColors } from '@/constants/theme';
import type { MarketFilters } from '@/utils/market-filters';

// Scryfall's rarities. Special and Bonus have no dot elsewhere in the app yet.
const RARITIES = [
  { key: 'common', label: 'Common' },
  { key: 'uncommon', label: 'Uncommon' },
  { key: 'rare', label: 'Rare' },
  { key: 'mythic', label: 'Mythic' },
  { key: 'special', label: 'Special', dot: '#A592AE' },
  { key: 'bonus', label: 'Bonus', dot: Colors.positive },
]

// The set search field doesn't look sets up yet, so nothing adds to `filters.sets` for now.
export function SetTab({ filters, onChange }: { filters: MarketFilters; onChange: (patch: Partial<MarketFilters>) => void }) {
  const codes = filters.sets.map((s) => s.code).join(' and ') || 'the chosen sets'
  const printHelp = filters.exactPrint
    ? `Only the printings from ${codes}, priced as those exact versions.`
    : `Cards from ${codes} that were printed again elsewhere — every reprint is shown.`

  return (
    <View>
      <SectionLabel style={styles.label}>Sets</SectionLabel>
      <View style={styles.search}>
        <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={18} tintColor={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Set name or code, e.g. LTR"
          placeholderTextColor={Colors.textMuted}
          accessibilityLabel="Search sets by name or code"
          autoCorrect={false}
          autoCapitalize="characters"
          returnKeyType="search"
        />
      </View>

      {filters.sets.map((set) => (
        <View key={set.code} style={styles.set}>
          <View style={styles.code}>
            <Text style={styles.codeLabel}>{set.code}</Text>
          </View>
          <View style={styles.setText}>
            <Text style={styles.setName} numberOfLines={1}>{set.name}</Text>
            <Text style={styles.setMeta}>{set.year} · {set.size} cards</Text>
          </View>
          <TouchableOpacity
            style={styles.remove}
            onPress={() => onChange({ sets: filters.sets.filter((s) => s.code !== set.code) })}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${set.name}`}
          >
            <SymbolView name={{ ios: 'xmark', android: 'close' }} size={16} tintColor={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ))}

      <SectionLabel style={styles.sectionGap}>Printing</SectionLabel>
      <Segmented
        label="Printing"
        options={[
          { value: 'exact', label: 'Exact print' },
          { value: 'reprint', label: 'Reprint' },
        ]}
        value={filters.exactPrint ? 'exact' : 'reprint'}
        onChange={(printing) => onChange({ exactPrint: printing === 'exact' })}
      />
      <Text style={styles.help}>{printHelp}</Text>

      <SectionLabel style={styles.sectionGap}>Rarity</SectionLabel>
      <View style={styles.rarities}>
        {RARITIES.map((rarity) => {
          const selected = filters.rarities.includes(rarity.key)
          return (
            <Chip
              key={rarity.key}
              style={styles.rarity}
              label={rarity.label}
              dot={rarity.dot ?? RarityColors[rarity.key]}
              selected={selected}
              onPress={() =>
                onChange({
                  rarities: selected ? filters.rarities.filter((r) => r !== rarity.key) : [...filters.rarities, rarity.key],
                })
              }
            />
          )
        })}
      </View>

      <ToggleRow
        style={styles.legendary}
        title="Legendary only"
        subtitle="Combine with any rarity, e.g. legendary commons"
        value={filters.legendaryOnly}
        onChange={(legendaryOnly) => onChange({ legendaryOnly })}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    marginBottom: 10,
  },
  sectionGap: {
    marginTop: 18,
    marginBottom: 10,
  },
  search: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: Colors.background,
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
  set: {
    marginTop: 6,
    height: 56,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.25)',
    backgroundColor: 'rgba(212,166,74,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  code: {
    width: 50,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    letterSpacing: 0.5,
    color: '#F0D8A0',
  },
  setText: {
    flex: 1,
    minWidth: 0,
  },
  setName: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  setMeta: {
    marginTop: 1,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  remove: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  help: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  rarities: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // Three per row.
  rarity: {
    width: '31%',
    flexGrow: 1,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  legendary: {
    marginTop: 12,
  },
})
