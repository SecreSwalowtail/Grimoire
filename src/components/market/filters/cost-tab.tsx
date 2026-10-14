import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ManaSymbol, symbolName, symbolValue } from '@/components/mana-symbol';
import { SectionLabel, Segmented } from '@/components/controls';
import { Colors, Fonts } from '@/constants/theme';
import type { CostMatch, MarketFilters } from '@/utils/market-filters';

// Keypads: a top row of 5 columns and a bottom row of 6, as in the design.
const PADS = [
  {
    key: 'basic',
    label: 'Basic',
    top: ['X', '0', '1', '2', '3', '4', '5', '6', '7', '8'],
    bottom: ['W', 'U', 'B', 'R', 'G', 'C'],
  },
  {
    key: 'hybrid',
    label: 'Hybrid',
    top: ['W/U', 'U/B', 'B/R', 'R/G', 'G/W', 'W/B', 'U/R', 'B/G', 'R/W', 'G/U'],
    bottom: ['2/W', '2/U', '2/B', '2/R', '2/G'],
  },
  {
    key: 'phyrexian',
    label: 'Phyrexian & snow',
    top: ['W/P', 'U/P', 'B/P', 'R/P', 'G/P', '9', '10', '12', '15', '16'],
    bottom: ['S'],
  },
]

export function CostTab({ filters, onChange }: { filters: MarketFilters; onChange: (patch: Partial<MarketFilters>) => void }) {
  const [padKey, setPadKey] = useState('basic')
  const pad = PADS.find((p) => p.key === padKey)!
  const cost = filters.cost
  const text = cost.length > 0 ? cost.map((s) => `{${s}}`).join('') : '—'
  const manaValue = cost.reduce((sum, s) => sum + symbolValue(s), 0)
  const matches: { value: CostMatch; label: string; help: string }[] = [
    { value: 'exact', label: 'Exact cost', help: `Only cards whose cost is exactly ${text}.` },
    { value: 'contains', label: 'Contains', help: `Cards whose cost includes at least ${text}, plus anything else.` },
    { value: 'mv', label: 'Mana value', help: `Any card with a total mana value of ${manaValue}, whatever the symbols.` },
  ]
  const add = (symbol: string) => onChange({ cost: [...cost, symbol] })

  return (
    <View>
      <SectionLabel style={styles.label}>Mana cost</SectionLabel>
      <View style={styles.builder}>
        <View style={styles.tokens} accessibilityLabel={`Mana cost ${text}`}>
          {cost.length === 0 && <Text style={styles.placeholder}>Tap symbols below</Text>}
          {cost.map((symbol, i) => (
            <ManaSymbol key={i} symbol={symbol} size={34} />
          ))}
        </View>
        <TouchableOpacity
          style={styles.backspace}
          onPress={() => onChange({ cost: cost.slice(0, -1) })}
          disabled={cost.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Delete last symbol"
        >
          <SymbolView name={{ ios: 'delete.left', android: 'backspace' }} size={20} tintColor={Colors.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.readout}>
        <Text style={styles.readoutText}>
          As text <Text style={styles.costText}>{text}</Text>
        </Text>
        <Text style={styles.readoutText}>
          Mana value <Text style={styles.manaValue}>{manaValue}</Text>
        </Text>
      </View>

      <SectionLabel style={styles.matchLabel}>Match</SectionLabel>
      <Segmented label="Cost match" options={matches} value={filters.costMatch} onChange={(costMatch) => onChange({ costMatch })} />
      <Text style={styles.help}>{matches.find((m) => m.value === filters.costMatch)!.help}</Text>

      <View style={styles.pads} accessibilityRole="tablist">
        {PADS.map((p) => {
          const selected = p.key === padKey
          return (
            <Pressable
              key={p.key}
              style={[styles.padTab, selected && styles.padTabSelected]}
              onPress={() => setPadKey(p.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.padLabel, selected && styles.padLabelSelected]}>{p.label}</Text>
            </Pressable>
          )
        })}
      </View>

      <KeyRows symbols={pad.top} columns={5} onPress={add} />
      <KeyRows symbols={pad.bottom} columns={6} onPress={add} />
    </View>
  )
}

// Keys in rows of `columns`; a short last row keeps the same key width.
function KeyRows({ symbols, columns, onPress }: { symbols: string[]; columns: number; onPress: (symbol: string) => void }) {
  const rows: string[][] = []
  for (let i = 0; i < symbols.length; i += columns) rows.push(symbols.slice(i, i + columns))
  return rows.map((row, r) => (
    <View key={r} style={styles.keyRow}>
      {row.map((symbol) => (
        <TouchableOpacity
          key={symbol}
          style={styles.key}
          onPress={() => onPress(symbol)}
          accessibilityRole="button"
          accessibilityLabel={`Add ${symbolName(symbol)}`}
        >
          <ManaSymbol symbol={symbol} size={30} />
        </TouchableOpacity>
      ))}
      {Array.from({ length: columns - row.length }, (_, i) => (
        <View key={`empty-${i}`} style={styles.keySpacer} />
      ))}
    </View>
  ))
}

const styles = StyleSheet.create({
  label: {
    marginBottom: 10,
  },
  builder: {
    minHeight: 64,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tokens: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
  },
  placeholder: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  backspace: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readout: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  readoutText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  costText: {
    fontFamily: Fonts.semiBold,
    color: '#DCD4C2',
  },
  manaValue: {
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  matchLabel: {
    marginTop: 20,
    marginBottom: 10,
  },
  help: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  pads: {
    marginTop: 18,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(237,230,214,0.08)',
  },
  padTab: {
    height: 40,
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    justifyContent: 'center',
  },
  padTabSelected: {
    borderBottomColor: Colors.gold,
  },
  padLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.textMuted,
  },
  padLabelSelected: {
    color: Colors.text,
  },
  keyRow: {
    marginBottom: 8,
    flexDirection: 'row',
    gap: 8,
  },
  key: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySpacer: {
    flex: 1,
  },
})
