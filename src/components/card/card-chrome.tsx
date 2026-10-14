import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';

// The parts of Card detail shared by all four tabs: the floating back button and the tab row.

export type CardTab = 'overview' | 'prices' | 'printings' | 'rules'

const TABS: { key: CardTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'prices', label: 'Prices' },
  { key: 'printings', label: 'Printings' },
  { key: 'rules', label: 'Rules' },
]

// Height of the floating top bar, under the status bar.
export const TOP_BAR = 60

export function TopBar() {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
      <TouchableOpacity style={styles.round} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
        <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left' }} size={20} tintColor={Colors.text} style={styles.backArrow} />
      </TouchableOpacity>
    </View>
  )
}

export function CardTabs({ tab, onChange }: { tab: CardTab; onChange: (tab: CardTab) => void }) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = t.key === tab
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, on && styles.tabOn]}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{t.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.14)',
    backgroundColor: 'rgba(14,13,11,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A "<" reads as sitting right (its wide, open side faces right, like a ▶ reads left), so it's
  // nudged a little left of the exact middle to look centered in the circle.
  backArrow: {
    transform: [{ translateX: -1 }],
  },
  tabs: {
    marginHorizontal: -20,
    paddingHorizontal: 12,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(237,230,214,0.10)',
  },
  tab: {
    flex: 1,
    height: 46,
    marginBottom: -1,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabOn: {
    borderBottomColor: Colors.gold,
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  tabLabelOn: {
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
})
