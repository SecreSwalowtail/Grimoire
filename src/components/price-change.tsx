import { useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle } from 'react-native'

import { Colors, Fonts } from '@/constants/theme'
import { useMoney } from '@/utils/money'

// Changes smaller than this (in euros) show nothing: the price didn't move.
const STILL = 0.005

// A price's change over the period chosen in Settings, as the Binder shows it: a green ▲ up, a red
// ▼ down, and the amount. Nothing when there's no change to show.
export function PriceChange({ change, style }: { change: number | null; style?: StyleProp<TextStyle> }) {
  const money = useMoney()
  if (change == null || Math.abs(change) < STILL) return null
  return (
    <Text style={[styles.change, { color: change > 0 ? Colors.positive : Colors.negative }, style]} numberOfLines={1}>
      {change > 0 ? '▲' : '▼'} {money.eur(Math.abs(change))}
    </Text>
  )
}

// About how wide a 12 px bold character is, to tell whether the amount fits.
const CHAR_WIDTH = 7

// The same in the room left on a line: it takes what's free there (flex), and shows the amount when
// it fits, else just the arrow.
export function PriceChangeFit({ change }: { change: number | null }) {
  const money = useMoney()
  const [room, setRoom] = useState(0)
  if (change == null || Math.abs(change) < STILL) return <View style={styles.fit} />
  const full = `${change > 0 ? '▲' : '▼'} ${money.eur(Math.abs(change))}`
  const fits = full.length * CHAR_WIDTH <= room
  return (
    <View style={styles.fit} onLayout={(e: LayoutChangeEvent) => setRoom(e.nativeEvent.layout.width)}>
      <Text
        style={[styles.change, { color: change > 0 ? Colors.positive : Colors.negative }]}
        numberOfLines={1}
        accessibilityLabel={`${change > 0 ? 'Up' : 'Down'} ${money.eur(Math.abs(change))}`}
      >
        {fits ? full : change > 0 ? '▲' : '▼'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  change: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    fontVariant: ['tabular-nums'],
  },
  fit: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
})
