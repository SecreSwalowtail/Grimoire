import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';

// Frame-rate meter for the performance pass (Settings → Developer tools). Counts frames on the UI
// thread (scrolling, animations, tilt) and the JS thread (React work), and the slowest frame of
// each second on both. Refreshes once a second. Works in release builds.
export function FpsMeter() {
  const insets = useSafeAreaInsets()
  const uiFrames = useSharedValue(0)
  const uiWorst = useSharedValue(0)
  const [stats, setStats] = useState({ ui: 0, uiWorst: 0, js: 0, jsWorst: 0 })

  useFrameCallback((frame) => {
    uiFrames.set(uiFrames.get() + 1)
    const gap = frame.timeSincePreviousFrame ?? 0
    if (gap > uiWorst.get()) uiWorst.set(gap)
  })

  useEffect(() => {
    let frames = 0
    let worst = 0
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      frames += 1
      worst = Math.max(worst, now - last)
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const every = setInterval(() => {
      setStats({ ui: uiFrames.get(), uiWorst: Math.round(uiWorst.get()), js: frames, jsWorst: Math.round(worst) })
      frames = 0
      worst = 0
      uiFrames.set(0)
      uiWorst.set(0)
    }, 1000)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(every)
    }
  }, [uiFrames, uiWorst])

  const tone = (fps: number) => (fps >= 55 ? Colors.positive : fps >= 40 ? Colors.goldLight : Colors.negative)

  return (
    <View pointerEvents="none" style={[styles.meter, { top: insets.top + 4 }]}>
      <Text style={styles.line}>
        <Text style={{ color: tone(stats.ui) }}>UI {stats.ui}</Text>
        <Text style={styles.muted}> · worst {stats.uiWorst} ms</Text>
      </Text>
      <Text style={styles.line}>
        <Text style={{ color: tone(stats.js) }}>JS {stats.js}</Text>
        <Text style={styles.muted}> · worst {stats.jsWorst} ms</Text>
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  meter: {
    position: 'absolute',
    right: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  line: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    fontVariant: ['tabular-nums'],
    color: Colors.text,
  },
  muted: {
    color: Colors.textSecondary,
  },
})
