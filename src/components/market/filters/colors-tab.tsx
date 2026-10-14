import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ManaSymbol } from '@/components/mana-symbol';
import { SectionLabel, Segmented, ToggleRow } from '@/components/controls';
import { Colors, Fonts } from '@/constants/theme';
import type { ColorMatch, MarketFilters } from '@/utils/market-filters';

const COLORS = [
  { key: 'W', name: 'White' },
  { key: 'U', name: 'Blue' },
  { key: 'B', name: 'Black' },
  { key: 'R', name: 'Red' },
  { key: 'G', name: 'Green' },
  { key: 'C', name: 'Colorless' },
]

const MATCHES: { value: ColorMatch; label: string }[] = [
  { value: 'exact', label: 'Exactly' },
  { value: 'atmost', label: 'At most' },
  { value: 'including', label: 'Including' },
]

const COUNTS = [0, 1, 2, 3, 4, 5]

// "white, blue and red"
function joinNames(names: string[]) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function ColorsTab({ filters, onChange }: { filters: MarketFilters; onChange: (patch: Partial<MarketFilters>) => void }) {
  const [min, max] = filters.colorCount
  const list = joinNames(COLORS.filter((c) => filters.colors.includes(c.key)).map((c) => c.name.toLowerCase()))
  let helper =
    !list ? 'Pick one or more colors to filter by.'
    : filters.colorMatch === 'exact' ? `Cards that are exactly ${list} — nothing more, nothing less.`
    : filters.colorMatch === 'atmost' ? `Cards that use only ${list}, or fewer of them — including colorless.`
    : `Cards that include ${list}, and may have other colors too.`
  if (list && filters.colorIdentity) helper += ' Mana symbols in rules text count too.'
  const rangeLabel = min === max ? `${min} ${min === 1 ? 'color' : 'colors'}` : `${min} – ${max} colors`

  // Tapping a number moves whichever end of the range is closer to it.
  const pickCount = (n: number) => {
    if (n <= min) onChange({ colorCount: [n, max] })
    else if (n >= max) onChange({ colorCount: [min, n] })
    else if (n - min < max - n) onChange({ colorCount: [n, max] })
    else onChange({ colorCount: [min, n] })
  }

  return (
    <View>
      <SectionLabel style={styles.label}>Match</SectionLabel>
      <Segmented
        label="Color match"
        options={MATCHES}
        value={filters.colorMatch}
        onChange={(colorMatch) => onChange({ colorMatch })}
      />

      <View style={styles.colors} accessibilityLabel="Colors">
        {COLORS.map((color) => {
          const selected = filters.colors.includes(color.key)
          return (
            <Pressable
              key={color.key}
              style={[styles.color, selected && styles.colorSelected]}
              onPress={() =>
                onChange({
                  colors: selected ? filters.colors.filter((c) => c !== color.key) : [...filters.colors, color.key],
                })
              }
              accessibilityRole="button"
              accessibilityLabel={color.name}
              accessibilityState={{ selected }}
            >
              <View style={[styles.ring, selected && styles.ringSelected]}>
                <View style={{ opacity: selected ? 1 : 0.45 }}>
                  <ManaSymbol symbol={color.key} size={42} />
                </View>
              </View>
              <Text style={[styles.colorName, selected && styles.colorNameSelected]} numberOfLines={1}>{color.name}</Text>
            </Pressable>
          )
        })}
      </View>

      <Text style={styles.helper}>{helper}</Text>

      <ToggleRow
        style={styles.identity}
        title="Use color identity"
        subtitle="Count mana symbols in rules text too, like Commander"
        value={filters.colorIdentity}
        onChange={(colorIdentity) => onChange({ colorIdentity })}
      />

      <View style={styles.countHeader}>
        <SectionLabel>Number of colors</SectionLabel>
        <Text style={styles.rangeLabel}>{rangeLabel}</Text>
      </View>
      <View style={styles.range} accessibilityLabel={`Number of colors, from ${min} to ${max}`}>
        <View style={styles.track}>
          <View style={[styles.fill, { left: `${min * 20}%`, width: `${(max - min) * 20}%` }]} />
          {COUNTS.map((n) => {
            const handle = n === min || n === max
            const inside = n >= min && n <= max
            return (
              <Pressable
                key={n}
                style={[styles.stop, { left: `${n * 20}%` }]}
                onPress={() => pickCount(n)}
                accessibilityRole="button"
                accessibilityLabel={`Set range to include ${n} colors`}
              >
                <View style={handle ? styles.handle : [styles.dot, inside && styles.dotInside]} />
              </Pressable>
            )
          })}
        </View>
        <View style={styles.numbers}>
          {COUNTS.map((n) => (
            <Text key={n} style={[styles.number, { left: `${n * 20}%` }, n >= min && n <= max && styles.numberInside]}>{n}</Text>
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    marginBottom: 10,
  },
  colors: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 6,
  },
  color: {
    flex: 1,
    height: 84,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  colorSelected: {
    backgroundColor: 'rgba(212,166,74,0.10)',
  },
  // Gold ring around a picked color, with a dark gap between ring and symbol.
  ring: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSelected: {
    borderColor: Colors.goldLight,
  },
  colorName: {
    marginTop: -4,
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Colors.textMuted,
  },
  colorNameSelected: {
    color: Colors.text,
  },
  helper: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.18)',
    backgroundColor: 'rgba(212,166,74,0.07)',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.regular,
    color: '#DCD4C2',
  },
  identity: {
    marginTop: 14,
  },
  countHeader: {
    marginTop: 22,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rangeLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  range: {
    height: 76,
    marginHorizontal: 22,
  },
  track: {
    marginTop: 24,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.selected,
  },
  fill: {
    position: 'absolute',
    top: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gold,
  },
  // 44pt touch target centered on each number.
  stop: {
    position: 'absolute',
    top: -19,
    width: 44,
    height: 44,
    marginLeft: -22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 4,
    borderColor: Colors.gold,
    backgroundColor: '#F5EEDD',
    boxShadow: '0 6px 14px rgba(0,0,0,0.45)',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4A443A',
  },
  dotInside: {
    backgroundColor: Colors.onGold,
  },
  numbers: {
    marginTop: 20,
  },
  number: {
    position: 'absolute',
    width: 24,
    marginLeft: -12,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textMuted,
  },
  numberInside: {
    color: Colors.text,
  },
})
