import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Tilt } from '@/components/card-effects/tilt';
import { CardThumb } from '@/components/card/card-thumb';
import { Colors, Fonts } from '@/constants/theme';
import { cardThumb, type ScryfallCard } from '@/db/scryfall';

// The parts of Card detail shared by all four tabs: the floating back button, the tab
// row, and the small header the Prices, Printings and Rules tabs use.

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

// Thumbnail, card name and one line about it. `foil`: a foil finish is picked (Prices tab), so the
// thumbnail gets the holographic layer.
export function CompactHeader({ card, subtitle, foil, tilt }: { card: ScryfallCard; subtitle: string; foil?: boolean; tilt: Tilt }) {
  return (
    <View style={styles.compact}>
      <CardThumb uri={cardThumb(card)} foil={foil} tilt={tilt} style={styles.thumb} />
      <View style={styles.compactText}>
        <Text style={styles.compactName} numberOfLines={2} accessibilityRole="header">{card.name}</Text>
        <Text style={styles.compactSub} numberOfLines={2}>{subtitle}</Text>
      </View>
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
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  thumb: {
    width: 44,
    height: 62,
    boxShadow: '0 0 0 1px rgba(237,230,214,0.18), 0 10px 22px rgba(0,0,0,0.5)',
  },
  compactText: {
    flex: 1,
    minWidth: 0,
  },
  compactName: {
    fontSize: 26,
    lineHeight: 28,
    fontFamily: Fonts.serif,
    color: '#F5EEDD',
  },
  compactSub: {
    marginTop: 5,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
})
