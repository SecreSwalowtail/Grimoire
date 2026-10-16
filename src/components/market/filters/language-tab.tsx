import { Pressable, StyleSheet, Text, View } from 'react-native'

import { SectionLabel } from '@/components/controls'
import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import type { MarketFilters } from '@/utils/market-filters'

// Scryfall language codes, with each language's own name.
const LANGUAGES = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'pt', native: 'Português', english: 'Portuguese' },
  { code: 'de', native: 'Deutsch', english: 'German' },
  { code: 'it', native: 'Italiano', english: 'Italian' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'ja', native: '日本語', english: 'Japanese' },
  { code: 'ru', native: 'Русский', english: 'Russian' },
]

export function LanguageTab({ filters, onChange }: { filters: MarketFilters; onChange: (patch: Partial<MarketFilters>) => void }) {
  const picked = filters.languages
  const any = picked.length === 0

  return (
    <View>
      <SectionLabel>Card language</SectionLabel>
      <Text style={styles.intro}>Search and price printings in these languages</Text>

      <Pressable
        style={[styles.any, any && styles.selected]}
        onPress={() => onChange({ languages: [] })}
        accessibilityRole="button"
        accessibilityState={{ selected: any }}
      >
        <Text style={styles.anyLabel}>Any language</Text>
        <Text style={styles.anyCount}>{any ? `All ${LANGUAGES.length}` : `${picked.length} selected`}</Text>
      </Pressable>

      <View style={styles.grid}>
        {LANGUAGES.map((language) => {
          const selected = picked.includes(language.code)
          return (
            <Pressable
              key={language.code}
              style={[styles.language, selected && styles.selected]}
              onPress={() =>
                onChange({ languages: selected ? picked.filter((c) => c !== language.code) : [...picked, language.code] })
              }
              accessibilityRole="checkbox"
              accessibilityLabel={language.english}
              accessibilityState={{ checked: selected }}
            >
              <View style={styles.languageText}>
                <Text style={styles.native}>{language.native}</Text>
                <Text style={styles.english}>{language.english} · {language.code.toUpperCase()}</Text>
              </View>
              <View style={[styles.box, selected && styles.boxChecked]}>
                {selected && <Icon name={{ ios: 'checkmark', android: 'check' }} size={14} tintColor={Colors.onGold} />}
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  intro: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  any: {
    height: 54,
    paddingLeft: 16,
    paddingRight: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selected: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.10)',
  },
  anyLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  anyCount: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  grid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  language: {
    // Two per row: half the width minus half the gap.
    width: '48.5%',
    flexGrow: 1,
    height: 64,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  languageText: {
    flex: 1,
    minWidth: 0,
  },
  native: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  english: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(237,230,214,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    borderWidth: 0,
    backgroundColor: Colors.gold,
  },
})
