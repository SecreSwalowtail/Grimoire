import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Colors, Fonts } from '@/constants/theme';
import { hexToHsv, hsvToHex, isHex, type Hsv } from '@/utils/color';

const HUES = 'linear-gradient(to right, #FF0000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF, #FF0000)'
const THUMB = 26

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

// Any color: drag in the square for how light and how strong, along the bar for the hue, type a
// hex, or tap one of the `presets`. `onDragging` reports a drag in progress, so a scroll view
// around it can stop scrolling meanwhile.
export function ColorSpectrum({
  value,
  onChange,
  presets,
  onDragging,
}: {
  value: string
  onChange: (hex: string) => void
  presets: { label: string; hex: string }[]
  onDragging?: (dragging: boolean) => void
}) {
  // Kept as HSV so the hue survives greys (a grey's hex has no hue to come back to).
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value))
  const [shown, setShown] = useState(value)
  // A new value from outside (a preset, a reset) moves the thumbs (adjusted during render).
  if (value !== shown) {
    setShown(value)
    if (value !== hsvToHex(hsv)) setHsv(hexToHsv(value))
  }
  const [squareWidth, setSquareWidth] = useState(0)
  const [squareHeight, setSquareHeight] = useState(0)
  const [barWidth, setBarWidth] = useState(0)
  const [draft, setDraft] = useState<string | null>(null)
  // Wide enough for "#RRGGBB" at the system font size.
  const hexWidth = 80 * useWindowDimensions().fontScale

  const pick = (next: Hsv) => {
    setHsv(next)
    const hex = hsvToHex(next)
    setShown(hex)
    onChange(hex)
  }

  const drag = (move: (x: number, y: number) => void) =>
    Gesture.Pan()
      .minDistance(0)
      .runOnJS(true)
      .onBegin((e) => {
        onDragging?.(true)
        move(e.x, e.y)
      })
      .onUpdate((e) => move(e.x, e.y))
      .onFinalize(() => onDragging?.(false))

  const square = drag((x, y) => {
    if (!squareWidth || !squareHeight) return
    pick({ h: hsv.h, s: clamp01(x / squareWidth), v: 1 - clamp01(y / squareHeight) })
  })
  const bar = drag((x) => {
    if (!barWidth) return
    pick({ ...hsv, h: clamp01(x / barWidth) * 359.9 })
  })

  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 })
  const commitDraft = () => {
    if (draft == null) return
    const text = (draft.startsWith('#') ? draft : `#${draft}`).toUpperCase()
    if (isHex(text)) pick(hexToHsv(text))
    setDraft(null)
  }

  return (
    <View style={styles.root}>
      <GestureDetector gesture={square}>
        <View
          style={styles.square}
          onLayout={(e: LayoutChangeEvent) => {
            setSquareWidth(e.nativeEvent.layout.width)
            setSquareHeight(e.nativeEvent.layout.height)
          }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Color strength and lightness"
          accessibilityValue={{ text: `${Math.round(hsv.s * 100)}% strength, ${Math.round(hsv.v * 100)}% light` }}
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: hueHex }]} />
          <View style={[StyleSheet.absoluteFill, styles.whiteFade]} />
          <View style={[StyleSheet.absoluteFill, styles.blackFade]} />
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              { left: hsv.s * squareWidth - THUMB / 2, top: (1 - hsv.v) * squareHeight - THUMB / 2, backgroundColor: value },
            ]}
          />
        </View>
      </GestureDetector>

      <GestureDetector gesture={bar}>
        <View
          style={styles.barArea}
          onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Hue"
          accessibilityValue={{ min: 0, max: 360, now: Math.round(hsv.h) }}
        >
          <View style={styles.bar} />
          <View pointerEvents="none" style={[styles.thumb, styles.barThumb, { left: (hsv.h / 360) * barWidth - THUMB / 2, backgroundColor: hueHex }]} />
        </View>
      </GestureDetector>

      <View style={styles.row}>
        <View style={styles.hexField}>
          <View style={[styles.current, { backgroundColor: value }]} />
          <TextInput
            style={[styles.hexInput, { width: hexWidth }]}
            value={draft ?? value}
            onChangeText={setDraft}
            onEndEditing={commitDraft}
            onSubmitEditing={commitDraft}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            returnKeyType="done"
            accessibilityLabel="Hex color"
          />
        </View>
        <View style={styles.presets} accessibilityRole="radiogroup" accessibilityLabel="Preset colors">
          {presets.map((p) => {
            const selected = p.hex.toUpperCase() === value.toUpperCase()
            return (
              <Pressable
                key={p.hex}
                style={[styles.presetRing, selected && { borderColor: p.hex }]}
                onPress={() => pick(hexToHsv(p.hex))}
                accessibilityRole="radio"
                accessibilityLabel={p.label}
                accessibilityState={{ checked: selected }}
                hitSlop={4}
              >
                <View style={[styles.presetDot, { backgroundColor: p.hex }]} />
              </Pressable>
            )
          })}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
  },
  square: {
    height: 168,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    overflow: 'hidden',
  },
  whiteFade: {
    experimental_backgroundImage: 'linear-gradient(to right, #FFFFFF, rgba(255,255,255,0))',
  },
  blackFade: {
    experimental_backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0), #000000)',
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    borderColor: '#F5EEDD',
    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
  },
  // Taller than the bar, so it's easy to grab.
  barArea: {
    height: 32,
    justifyContent: 'center',
  },
  bar: {
    height: 14,
    borderRadius: 7,
    experimental_backgroundImage: HUES,
  },
  barThumb: {
    top: (32 - THUMB) / 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hexField: {
    height: 44,
    paddingLeft: 7,
    paddingRight: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  current: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.16)',
  },
  hexInput: {
    padding: 0,
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  presets: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  presetRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
})

