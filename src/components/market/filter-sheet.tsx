import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, Sheet, SheetHeader } from '@/components/controls';
import { ColorsTab } from '@/components/market/filters/colors-tab';
import { CostTab } from '@/components/market/filters/cost-tab';
import { FormatTab } from '@/components/market/filters/format-tab';
import { LanguageTab } from '@/components/market/filters/language-tab';
import { SetTab } from '@/components/market/filters/set-tab';
import { Colors, Fonts } from '@/constants/theme';
import { activeTabs, resetTab, type FilterTab, type MarketFilters } from '@/utils/market-filters';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'format', label: 'Format' },
  { key: 'colors', label: 'Colors' },
  { key: 'cost', label: 'Cost' },
  { key: 'set', label: 'Set' },
  { key: 'language', label: 'Language' },
]

// Filters sheet: one tab per filter group. Edits apply as you go; the bottom button just closes.
export function FilterSheet({
  visible,
  tab,
  onTabChange,
  filters,
  onChange,
  resultCount,
  onClose,
}: {
  visible: boolean
  tab: FilterTab
  onTabChange: (tab: FilterTab) => void
  filters: MarketFilters
  onChange: (filters: MarketFilters) => void
  resultCount: number | null
  onClose: () => void
}) {
  const active = activeTabs(filters)
  const patch = (changes: Partial<MarketFilters>) => onChange({ ...filters, ...changes })

  return (
    <Sheet visible={visible} onClose={onClose} fullHeight>
      <SheetHeader title="Filters" onReset={() => onChange(resetTab(filters, tab))} onClose={onClose} />

      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => {
          const selected = t.key === tab
          return (
            <Pressable
              key={t.key}
              style={[styles.tab, selected && styles.tabSelected]}
              onPress={() => onTabChange(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityHint={active[t.key] ? 'Has filters set' : undefined}
            >
              <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]} numberOfLines={1}>{t.label}</Text>
              {active[t.key] && <View style={styles.tabDot} />}
            </Pressable>
          )
        })}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {tab === 'format' && <FormatTab filters={filters} onChange={patch} />}
        {tab === 'colors' && <ColorsTab filters={filters} onChange={patch} />}
        {tab === 'cost' && <CostTab filters={filters} onChange={patch} />}
        {tab === 'set' && <SetTab filters={filters} onChange={patch} />}
        {tab === 'language' && <LanguageTab filters={filters} onChange={patch} />}
      </ScrollView>

      <PrimaryButton
        label={resultCount != null ? `Show ${resultCount.toLocaleString('en-US')} cards` : 'Show cards'}
        onPress={onClose}
      />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  tabs: {
    marginTop: 14,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(237,230,214,0.10)',
  },
  tab: {
    flex: 1,
    height: 44,
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSelected: {
    borderBottomColor: Colors.gold,
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  tabLabelSelected: {
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  // Gold dot at the label's top-right corner: this tab has a filter set.
  tabDot: {
    width: 6,
    height: 6,
    marginLeft: 3,
    marginTop: -12,
    borderRadius: 3,
    backgroundColor: Colors.gold,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingTop: 18,
    paddingBottom: 12,
  },
})
