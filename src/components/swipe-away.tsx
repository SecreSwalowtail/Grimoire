import type { ReactNode } from 'react'
import type { AccessibilityProps, StyleProp, ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

// Dragged past this share of its width (or flicked), it's thrown away.
const AWAY_AT = 1 / 3
const FLICK = 800
const BACK = { damping: 20, stiffness: 240 }

// Something that can be thrown away sideways (a toast): it follows the finger left or right, fading
// as it goes; let go far enough (or flicked) it slides off and `onDismiss` runs, else it springs
// back. Only sideways drags: taps inside (its buttons) still work. Accessibility props go to the view.
export function SwipeAway({
  onDismiss,
  style,
  children,
  ...a11y
}: {
  onDismiss: () => void
  style?: StyleProp<ViewStyle>
  children: ReactNode
} & AccessibilityProps) {
  const x = useSharedValue(0)
  const width = useSharedValue(1)

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      x.set(e.translationX)
    })
    .onEnd((e) => {
      const away = Math.abs(e.translationX) > width.get() * AWAY_AT || Math.abs(e.velocityX) > FLICK
      if (!away) {
        x.set(withSpring(0, BACK))
        return
      }
      const side = Math.sign(e.translationX || e.velocityX) || 1
      x.set(
        withTiming(side * width.get() * 1.2, { duration: 180 }, (finished) => {
          if (finished) scheduleOnRN(onDismiss)
        }),
      )
    })

  const moving = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(x.get()), [0, width.get()], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: x.get() }],
  }))

  return (
    <GestureDetector gesture={pan}>
      <Animated.View {...a11y} style={[style, moving]} onLayout={(e) => width.set(Math.max(1, e.nativeEvent.layout.width))}>
        {children}
      </Animated.View>
    </GestureDetector>
  )
}
