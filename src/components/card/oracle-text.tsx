import { Platform, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type TextStyle } from 'react-native'

import { ManaSymbol, symbolName } from '@/components/mana-symbol'
import { Colors, Fonts } from '@/constants/theme'

// Card rules text as printed: {symbols} drawn as our mana symbols in the line, reminder text
// (in parentheses) in muted italics, and a keyword that starts a line ("Deathtouch") in bold.

// How far below its default spot an inline symbol is moved, as a share of its size.
const DROP = Platform.OS === 'android' ? 0.34 : 0.14

// "{2}{B}: Draw a card." -> ['', '2', '', 'B', ': Draw a card.'] (odd entries are symbols).
const splitSymbols = (text: string) => text.split(/\{([^}]+)\}/g)

// Text with its {symbols} drawn inline. Screen readers hear "2 generic mana" instead of "{2}".
export function SymbolText({ text, style, size = 15 }: { text: string; style?: StyleProp<TextStyle>; size?: number }) {
  const parts = splitSymbols(text)
  // Symbols grow with the system font size like the text around them, and are pulled down from where
  // the platform places inline views so they sit centered on the capital letters.
  const { fontScale } = useWindowDimensions()
  const scaled = Math.round(size * fontScale)
  const drop = scaled * DROP
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        i % 2 === 0 ? (
          part
        ) : (
          <View key={i} style={{ width: scaled, height: scaled, transform: [{ translateY: drop }] }} accessible accessibilityLabel={symbolName(part)}>
            <ManaSymbol symbol={part} size={scaled} />
          </View>
        ),
      )}
    </Text>
  )
}

function Line({ line, keywords }: { line: string; keywords: string[] }) {
  // Reminder text in parentheses, possibly several per line.
  const pieces = line.split(/(\([^)]*\))/g).filter(Boolean)
  // "Deathtouch" or "Flying, vigilance" at the start of the line.
  const lead = keywords.find((k) => line.toLowerCase().startsWith(k.toLowerCase()))
  return (
    <Text style={styles.line}>
      {pieces.map((piece, i) => {
        if (piece.startsWith('(')) {
          return <SymbolText key={i} text={piece} style={styles.reminder} size={13} />
        }
        if (i === 0 && lead) {
          return (
            <Text key={i}>
              <Text style={styles.keyword}>{piece.slice(0, lead.length)}</Text>
              <SymbolText text={piece.slice(lead.length)} />
            </Text>
          )
        }
        return <SymbolText key={i} text={piece} />
      })}
    </Text>
  )
}

export function OracleText({ text, keywords = [] }: { text: string; keywords?: string[] }) {
  const lines = text.split('\n').filter((l) => l.trim())
  return (
    <View style={styles.lines}>
      {lines.map((line, i) => (
        <Line key={i} line={line} keywords={keywords} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  lines: {
    gap: 8,
  },
  line: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: Fonts.regular,
    color: Colors.text,
  },
  keyword: {
    fontFamily: Fonts.extraBold,
  },
  reminder: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    fontStyle: 'italic',
    color: Colors.textSecondary,
  },
})
