import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Circle, Line, Path } from 'react-native-svg'

import { Colors, Fonts } from '@/constants/theme'
import { tick } from '@/utils/motion'

const HEIGHT = 160
const TOP = 12
const BOTTOM = 22 // space under the lowest gridline, for the low price label
// The current-price dot (radius 8 with its halo) stays inside the chart: the line ends this far
// from the right edge.
const END = 10

// Line and area chart of saved prices. With fewer than two days saved there's nothing to draw:
// the empty grid says so instead. Drag sideways across it to read the price of any day: a line and
// a dot follow the finger, `onScrub` gets that day's index (null on letting go), and the phone
// ticks at each new day. A vertical drag still scrolls the screen.
export function PriceChart({
  values,
  label,
  format,
  onScrub,
}: {
  values: number[]
  label: string
  format: (v: number) => string
  onScrub?: (index: number | null) => void
}) {
  const [width, setWidth] = useState(0)
  const [scrub, setScrub] = useState<number | null>(null)
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
  const held = scrub != null && scrub < points.length ? points[scrub] : null

  // The day under the finger.
  const pick = (x: number) => {
    const index = Math.min(Math.max(Math.round((x / Math.max(right, 1)) * (values.length - 1)), 0), values.length - 1)
    if (index === scrub) return
    setScrub(index)
    onScrub?.(index)
    tick()
  }
  const release = () => {
    setScrub(null)
    onScrub?.(null)
  }
  const drag = Gesture.Pan()
    .runOnJS(true)
    .enabled(enough)
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onStart((e) => pick(e.x))
    .onUpdate((e) => pick(e.x))
    .onFinalize(release)

  return (
    <GestureDetector gesture={drag}>
      <View style={styles.chart} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={label}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            <Path d={`M0 ${TOP}H${width}M0 ${TOP + plot / 2}H${width}M0 ${TOP + plot}H${width}`} stroke="rgba(237,230,214,0.07)" strokeWidth={1} />
            {enough && (
              <>
                <Path d={`${line} L${right} ${TOP + plot} L0 ${TOP + plot} Z`} fill="rgba(212,166,74,0.12)" />
                <Path d={line} stroke={Colors.goldLight} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                {held ? (
                  <>
                    <Line x1={held[0]} y1={TOP - 6} x2={held[0]} y2={TOP + plot} stroke="rgba(237,230,214,0.35)" strokeWidth={1} />
                    <Circle cx={held[0]} cy={held[1]} r={8} fill="rgba(232,192,106,0.20)" />
                    <Circle cx={held[0]} cy={held[1]} r={3.75} fill={Colors.goldLight} />
                  </>
                ) : (
                  <>
                    <Circle cx={last[0]} cy={last[1]} r={8} fill="rgba(232,192,106,0.20)" />
                    <Circle cx={last[0]} cy={last[1]} r={3.75} fill={Colors.goldLight} />
                  </>
                )}
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
    </GestureDetector>
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
