import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'

import { Chip, SectionLabel, Segmented, ToggleRow } from '@/components/controls'
import { Icon } from '@/components/icon'
import { SetIcon } from '@/components/set-icon'
import { Colors, Fonts, RarityColors } from '@/constants/theme'
import { getSets, type ScryfallSet } from '@/db/scryfall'
import type { MarketFilters } from '@/utils/market-filters'

// Scryfall's rarities. Special and Bonus have no dot elsewhere in the app yet.
const RARITIES = [
  { key: 'common', label: 'Common' },
  { key: 'uncommon', label: 'Uncommon' },
  { key: 'rare', label: 'Rare' },
  { key: 'mythic', label: 'Mythic' },
  { key: 'special', label: 'Special', dot: '#A592AE' },
  { key: 'bonus', label: 'Bonus', dot: Colors.positive },
]

// Token and memorabilia "sets" hold no cards a search returns.
const HIDDEN_SET_TYPES = ['token', 'memorabilia']
const MAX_MATCHES = 6
const SYMBOL = '#F0D8A0'

// Sets for the search field: an exact code first, then codes starting with the text, then names
// containing it, newest first within each (Scryfall lists sets newest first).
function matchSets(all: ScryfallSet[], text: string, picked: string[]) {
  const q = text.trim().toLowerCase()
  if (!q) return []
  const rank = (s: ScryfallSet) =>
    s.code === q ? 0 : s.code.startsWith(q) ? 1 : s.name.toLowerCase().includes(q) ? 2 : -1
  return all
    .filter((s) => !HIDDEN_SET_TYPES.includes(s.set_type) && !picked.includes(s.code.toUpperCase()) && rank(s) >= 0)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_MATCHES)
}

export function SetTab({ filters, onChange }: { filters: MarketFilters; onChange: (patch: Partial<MarketFilters>) => void }) {
  const [text, setText] = useState('')
  const [allSets, setAllSets] = useState<ScryfallSet[] | null>(null)
  const [failed, setFailed] = useState(false)
  const typing = text.trim() !== ''

  // The set list loads once something is typed (and is kept for the session). After a failure,
  // typing again tries again.
  useEffect(() => {
    if (!typing || allSets || failed) return
    let live = true
    getSets()
      .then((list) => {
        if (live) setAllSets(list)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [typing, allSets, failed])

  const matches = matchSets(allSets ?? [], text, filters.sets.map((s) => s.code))
  const pick = (set: ScryfallSet) => {
    setText('')
    onChange({
      sets: [
        ...filters.sets,
        { code: set.code.toUpperCase(), name: set.name, year: set.released_at?.slice(0, 4) ?? '', size: set.card_count, icon: set.icon_svg_uri },
      ],
    })
  }

  const codes = filters.sets.map((s) => s.code).join(' and ') || 'the chosen sets'
  const printHelp = filters.exactPrint
    ? `Only the printings from ${codes}, priced as those exact versions.`
    : `Cards from ${codes} that were printed again elsewhere — every reprint is shown.`

  return (
    <View>
      <SectionLabel style={styles.label}>Sets</SectionLabel>
      <View style={styles.search}>
        <Icon name={{ ios: 'magnifyingglass', android: 'search' }} size={18} tintColor={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={text}
          onChangeText={(value) => {
            setText(value)
            setFailed(false)
          }}
          onSubmitEditing={() => matches[0] && pick(matches[0])}
          placeholder="Set name or code, e.g. LTR"
          placeholderTextColor={Colors.textMuted}
          accessibilityLabel="Search sets by name or code"
          autoCorrect={false}
          autoCapitalize="characters"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {typing && (
        failed ? (
          <Text style={styles.help}>Couldn&apos;t load the sets. Check your connection and try again.</Text>
        ) : !allSets ? (
          <ActivityIndicator style={styles.loading} color={Colors.gold} />
        ) : matches.length === 0 ? (
          <Text style={styles.help}>No set matches “{text.trim()}”.</Text>
        ) : (
          matches.map((set) => (
            <TouchableOpacity
              key={set.code}
              style={[styles.set, styles.match]}
              onPress={() => pick(set)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${set.name}`}
            >
              <View style={styles.code}>
                <SetIcon code={set.code} uri={set.icon_svg_uri} size={22} color={SYMBOL} />
              </View>
              <View style={styles.setText}>
                <Text style={styles.setName} numberOfLines={1}>{set.name}</Text>
                <Text style={styles.setMeta}>{set.code.toUpperCase()} · {set.released_at?.slice(0, 4) ?? '—'} · {set.card_count} cards</Text>
              </View>
              <View style={styles.remove}>
                <Icon name={{ ios: 'plus', android: 'add' }} size={16} tintColor={Colors.goldLight} />
              </View>
            </TouchableOpacity>
          ))
        )
      )}

      {filters.sets.map((set) => (
        <View key={set.code} style={styles.set}>
          <View style={styles.code}>
            <SetIcon code={set.code} uri={set.icon} size={22} color={SYMBOL} />
          </View>
          <View style={styles.setText}>
            <Text style={styles.setName} numberOfLines={1}>{set.name}</Text>
            <Text style={styles.setMeta}>{set.code} · {set.year} · {set.size} cards</Text>
          </View>
          <TouchableOpacity
            style={styles.remove}
            onPress={() => onChange({ sets: filters.sets.filter((s) => s.code !== set.code) })}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${set.name}`}
          >
            <Icon name={{ ios: 'xmark', android: 'close' }} size={16} tintColor={Colors.textSecondary} />
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
  // A set to add: quieter than the picked ones.
  match: {
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
  },
  loading: {
    marginTop: 12,
  },
  code: {
    width: 50,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
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
