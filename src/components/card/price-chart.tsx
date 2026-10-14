import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Colors, Fonts } from '@/constants/theme';

const HEIGHT = 160
const TOP = 12
const BOTTOM = 22 // space under the lowest gridline, for the low price label
// The current-price dot (radius 8 with its halo) stays inside the chart: the line ends this far
// from the right edge.
const END = 10

// Line and area chart of saved prices. With fewer than two days saved there's nothing to draw:
// the empty grid says so instead.
export function PriceChart({ values, label, format }: { values: number[]; label: string; format: (v: number) => string }) {
  const [width, setWidth] = useState(0)
  const enough = values.length >= 2
  const lo = enough ? Math.min(...values) : 0
  const hi = enough ? Math.max(...values) : 0
  const plot = HEIGHT - TOP - BOTTOM
  const right = Math.max(width - END, 0)
  // A price that never moved runs through the middle instead of along the top.
  const y = (v: number) => (hi === lo ? TOP + plot / 2 : TOP + ((hi - v) / (hi - lo)) * plot)
  const points = values.map((v, i) => [(i * right) / Math.max(values.length - 1, 1), y(v)])
  const line = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
  const last = points[points.length - 1]

  return (
    <View style={styles.chart} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={label}>
      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          <Path d={`M0 ${TOP}H${width}M0 ${TOP + plot / 2}H${width}M0 ${TOP + plot}H${width}`} stroke="rgba(237,230,214,0.07)" strokeWidth={1} />
          {enough && (
            <>
              <Path d={`${line} L${right} ${TOP + plot} L0 ${TOP + plot} Z`} fill="rgba(212,166,74,0.12)" />
              <Path d={line} stroke={Colors.goldLight} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <Circle cx={last[0]} cy={last[1]} r={8} fill="rgba(232,192,106,0.20)" />
              <Circle cx={last[0]} cy={last[1]} r={3.75} fill={Colors.goldLight} />
            </>
          )}
        </Svg>
      )}
      {enough ? (
        hi !== lo && (
          <>
            <Text style={[styles.axis, { top: -2 }]}>{format(hi)}</Text>
            <Text style={[styles.axis, { top: TOP + plot + 3 }]}>{format(lo)}</Text>
          </>
        )
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No data yet</Text>
          <Text style={styles.emptyText}>The app saves this card&apos;s price each day you open it or own it, and draws the history from there.</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  chart: {
    height: HEIGHT,
  },
  axis: {
    position: 'absolute',
    left: 0,
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  empty: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  emptyText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
})
