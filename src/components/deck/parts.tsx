import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ManaSymbol, symbolName } from '@/components/mana-symbol';
import { Colors, Fonts, RarityColors } from '@/constants/theme';
import { costSymbols, TYPE_INFO, type GroupHead } from '@/rules/deck-stats';
import { withAlpha } from '@/utils/deck-store';

// Drawn icons, centered in their 24 × 24 box (the system icon font sits slightly off center).
export const ICON = {
  // Each dot drawn both ways from its middle, so the row is centered on 12.
  more: 'M5.5 12h0M12 12h0M18.5 12h0',
  plus: 'M12 5v14M5 12h14',
  // Symmetric about the middle (x = 12, y from 4.5 to 19.5).
  filter: 'M4 4.5h16l-6 7.5v7.5l-4-2V12z',
  minus: 'M5 12h14',
}

// The commander's crown.
export const CROWN = 'M4 17.5l1.5-9 4.5 4 2-6.5 2 6.5 4.5-4 1.5 9z'

// A stroke icon from the design's 24 × 24 paths.
export function PathIcon({ d, color, size = 16, weight = 1.9 }: { d: string; color: string; size?: number; weight?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

// The tinted tile at the start of a group's header: the type's icon, the mana value, the colors'
// mana symbols, a rarity dot or the set code.
export function GroupIcon({ head }: { head: GroupHead }) {
  if (head.kind === 'commander') {
    return (
      <View style={[styles.tile, { backgroundColor: 'rgba(212,166,74,0.16)' }]}>
        <PathIcon d={CROWN} color={Colors.goldLight} />
      </View>
    )
  }
  if (head.kind === 'type') {
    const t = TYPE_INFO[head.type]
    return (
      <View style={[styles.tile, { backgroundColor: withAlpha(t.color, 0.16) }]}>
        <PathIcon d={t.icon} color={t.color} />
      </View>
    )
  }
  if (head.kind === 'colors') {
    const symbols = head.colors.length ? head.colors.slice(0, 2) : ['C']
    return (
      <View style={[styles.tile, styles.symbols]}>
        {symbols.map((s, i) => (
          <View key={s} style={i > 0 && styles.overlap}>
            <ManaSymbol symbol={s} size={symbols.length > 1 ? 16 : 20} />
          </View>
        ))}
      </View>
    )
  }
  if (head.kind === 'rarity') {
    const color = RarityColors[head.rarity] ?? Colors.textMuted
    return (
      <View style={[styles.tile, { backgroundColor: withAlpha(color, 0.16) }]}>
        <View style={[styles.rarityDot, { backgroundColor: color }]} />
      </View>
    )
  }
  return (
    <View style={[styles.tile, styles.textTile]}>
      <Text style={styles.tileText} numberOfLines={1} adjustsFontSizeToFit>
        {head.kind === 'mv' ? (head.mv === 7 ? '7+' : String(head.mv)) : head.text || '≡'}
      </Text>
    </View>
  )
}

// A card's mana cost as symbols, read out as words.
export function CostRow({ cost, size = 17 }: { cost: string; size?: number }) {
  const symbols = costSymbols(cost)
  if (!symbols.length) return null
  return (
    <View style={styles.cost} accessible accessibilityLabel={`Mana cost ${symbols.map(symbolName).join(', ')}`}>
      {symbols.map((s, i) => (
        <ManaSymbol key={i} symbol={s} size={size} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbols: {
    flexDirection: 'row',
  },
  overlap: {
    marginLeft: -5,
  },
  textTile: {
    paddingHorizontal: 3,
    backgroundColor: 'rgba(212,166,74,0.14)',
  },
  tileText: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  rarityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cost: {
    flexDirection: 'row',
    gap: 2,
  },
})
