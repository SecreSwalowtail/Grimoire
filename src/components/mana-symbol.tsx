import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'

import { MANA_SVGS } from '@/constants/mana-svgs'
import { Fonts, MANA_NEUTRAL, MANA_NEUTRAL_BORDER } from '@/constants/theme'
import { capitalize } from '@/utils/format'

const COLOR_NAMES: Record<string, string> = {
  W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colorless',
}

// "{2}{G}{W}" -> ['2', 'G', 'W']. Split cards list both halves ("{R} // {U}"): only the first is kept.
export function parseManaCost(cost: string) {
  return [...cost.split(' // ')[0].matchAll(/\{([^}]+)\}/g)].map((m) => m[1])
}

// Mana value of one symbol: X counts 0, "2/W" counts 2, every other colored or hybrid symbol 1.
export function symbolValue(symbol: string) {
  if (/^\d+$/.test(symbol)) return Number(symbol)
  if (symbol === 'X') return 0
  if (symbol.startsWith('2/')) return 2
  return 1
}

// What screen readers say for a symbol, e.g. "Phyrexian red mana".
export function symbolName(symbol: string) {
  if (/^(\d+|X)$/.test(symbol)) return `${symbol} generic mana`
  if (symbol === 'S') return 'Snow mana'
  if (symbol === 'T') return 'Tap'
  if (symbol === 'Q') return 'Untap'
  if (COLOR_NAMES[symbol]) return `${capitalize(COLOR_NAMES[symbol])} mana`
  const [a, b, c] = symbol.split('/')
  if (b === 'P') return `Phyrexian ${COLOR_NAMES[a]} mana`
  if (c === 'P') return `Phyrexian ${COLOR_NAMES[a]} or ${COLOR_NAMES[b]} mana`
  if (a === '2') return `Two generic or ${COLOR_NAMES[b]} hybrid mana`
  if (COLOR_NAMES[a] && COLOR_NAMES[b]) return `${capitalize(COLOR_NAMES[a])} or ${COLOR_NAMES[b]} hybrid mana`
  return `${symbol} symbol`
}

// One mana symbol, drawn with Scryfall's official card symbol. Symbols Scryfall has no drawing for
// fall back to their text on a neutral round tile.
export function ManaSymbol({ symbol, size = 17 }: { symbol: string; size?: number }) {
  const source = MANA_SVGS[symbol]
  if (source != null) return <Image source={source} style={{ width: size, height: size }} contentFit="contain" />

  const r = Math.round
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.text, { fontSize: r(0.46 * size), lineHeight: r(0.46 * size) }]} allowFontScaling={false}>
        {symbol}
      </Text>
    </View>
  )
}

// A mana cost as a row of symbols, read out as words. Split cards show their first half.
export function CostRow({ cost, size = 17, gap = 2 }: { cost: string; size?: number; gap?: number }) {
  const symbols = parseManaCost(cost)
  if (!symbols.length) return null
  return (
    <View style={[styles.cost, { gap }]} accessible accessibilityLabel={`Mana cost: ${symbols.map(symbolName).join(', ')}`}>
      {symbols.map((symbol, i) => (
        <ManaSymbol key={i} symbol={symbol} size={size} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  cost: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tile: {
    backgroundColor: MANA_NEUTRAL,
    borderWidth: 1,
    borderColor: MANA_NEUTRAL_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#273951',
    fontFamily: Fonts.medium,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    includeFontPadding: false,
  },
})
