import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ManaGlyph, type GlyphKind } from '@/components/mana-glyph';
import { Fonts, MANA_NEUTRAL, MANA_NEUTRAL_BORDER, ManaTokens, type ManaKind } from '@/constants/theme';
import { capitalize } from '@/utils/format';

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

const ELEMENTS: Record<string, GlyphKind> = { W: 'light', U: 'water', B: 'dark', R: 'fire', G: 'green' }

// The design's "token" for a Scryfall symbol: a tile kind, a second kind for hybrids, whether it
// can be paid with life (Phyrexian), and the text shown on number tiles.
type Token = { primary: ManaKind; secondary: GlyphKind | null; life: boolean; text: string }

function tokenFor(symbol: string): Token {
  const token: Token = { primary: 'num', secondary: null, life: false, text: '' }
  if (ELEMENTS[symbol]) return { ...token, primary: ELEMENTS[symbol] }
  if (symbol === 'C') return { ...token, primary: 'none' }
  if (symbol === 'S') return { ...token, primary: 'snow' }
  if (symbol === 'T') return { ...token, primary: 'tap' }
  if (symbol === 'Q') return { ...token, primary: 'untap' }
  const [a, b, c] = symbol.split('/')
  if (ELEMENTS[a] && b === 'P') return { ...token, primary: ELEMENTS[a], life: true }
  if (ELEMENTS[a] && ELEMENTS[b]) return { ...token, primary: ELEMENTS[a], secondary: ELEMENTS[b], life: c === 'P' }
  if (a === '2' && ELEMENTS[b]) return { ...token, primary: 'two', secondary: ELEMENTS[b] }
  // Numbers, X, and anything rarer (energy, chaos…) as text on a neutral tile.
  return { ...token, text: symbol }
}

const HEART = 'M24 40 C14 33 7 27 7 19.5 C7 14 11 10 16 10 C19.8 10 22.4 12.2 24 15 C25.6 12.2 28.2 10 32 10 C37 10 41 14 41 19.5 C41 27 34 33 24 40 Z'

// One mana symbol, following the canvas's Token component (colors, glyphs, hybrids, life badge)
// but round like the symbols printed on cards. Sizes and positions are fractions of `size`.
// Symbols of 24px and less use the simplified glyphs.
export function ManaSymbol({ symbol, size = 17 }: { symbol: string; size?: number }) {
  const { primary, secondary, life, text } = tokenFor(symbol)
  const r = Math.round
  const a = ManaTokens[primary]
  const b = secondary ? ManaTokens[secondary] : a
  const split = secondary != null
  const neutral = a.bg === MANA_NEUTRAL || b.bg === MANA_NEUTRAL
  const simple = size <= 24

  // Glyph size and offsets: hybrids put one glyph top-left and one bottom-right; a life badge
  // pushes a single glyph up to the top-left. Insets are larger than the design's square tiles
  // so nothing reaches into the circle's cut-off corners.
  let glyph: number
  let aPos = 0
  let bPos = 0
  if (split) {
    const g = life ? 0.3 : 0.34
    const inset = life ? 0.14 : 0.15
    glyph = r(g * size)
    aPos = r(inset * size)
    bPos = r(size - inset * size - g * size)
  } else if (life) {
    glyph = r(0.48 * size)
    aPos = r(0.16 * size)
  } else {
    glyph = r(0.52 * size)
  }
  const badge = r((split ? 0.3 : 0.34) * size)
  const badgePos = split ? r((size - badge) / 2) : r(size - 0.12 * size - badge)

  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: a.bg,
          borderColor: neutral ? MANA_NEUTRAL_BORDER : 'transparent',
        },
        split && { experimental_backgroundImage: `linear-gradient(135deg, ${a.bg} 50%, ${b.bg} 50%)` },
      ]}
    >
      {primary === 'num' ? (
        <Text style={[styles.text, { color: a.fg, fontSize: r(0.46 * size), lineHeight: r(0.46 * size) }]} allowFontScaling={false}>
          {text}
        </Text>
      ) : primary === 'two' ? (
        <View style={[styles.at, styles.center, { left: aPos, top: aPos, width: glyph, height: glyph }]}>
          <Text style={[styles.text, { color: a.fg, fontSize: r(0.3 * size), lineHeight: r(0.3 * size) }]} allowFontScaling={false}>
            2
          </Text>
        </View>
      ) : split || life ? (
        <View style={[styles.at, { left: aPos, top: aPos }]}>
          <ManaGlyph kind={primary} color={a.fg} size={glyph} simple={simple} />
        </View>
      ) : (
        <ManaGlyph kind={primary} color={a.fg} size={glyph} simple={simple} />
      )}
      {secondary && (
        <View style={[styles.at, { left: bPos, top: bPos }]}>
          <ManaGlyph kind={secondary} color={b.fg} size={glyph} simple={simple} />
        </View>
      )}
      {life && (
        <View
          style={[
            styles.at,
            styles.center,
            styles.badge,
            {
              left: badgePos,
              top: badgePos,
              width: badge,
              height: badge,
              backgroundColor: split ? '#ffffff' : a.fg,
              borderColor: split || a.fg === '#ffffff' ? MANA_NEUTRAL_BORDER : 'transparent',
            },
          ]}
        >
          <Svg width={r(badge * 0.6)} height={r(badge * 0.6)} viewBox="0 0 48 48">
            <Path d={HEART} fill={split ? '#0d253d' : a.bg === MANA_NEUTRAL ? '#ffffff' : a.bg} />
          </Svg>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // The design gives every tile a 1px border, transparent unless the tile is neutral.
  tile: {
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  at: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    borderRadius: 9999,
    borderWidth: 1,
  },
  text: {
    fontFamily: Fonts.medium,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    includeFontPadding: false,
  },
})
