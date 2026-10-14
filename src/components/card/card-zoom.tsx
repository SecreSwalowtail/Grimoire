import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useEffect, useState, type RefObject } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { HoloFoil } from '@/components/card-effects/holo-foil';
import type { Tilt } from '@/components/card-effects/tilt';
import { faceImage, type ScryfallCard } from '@/db/scryfall';

// Hold the hero card on Card detail: it lifts out of the header to almost the whole screen, over
// the blurred page. It tilts much further than anywhere else, with the phone and under your finger
// (drag across it), and its edges darken as they turn away. Going back puts it down again: the
// screen turns that into `closing` (there is no close button on purpose).

// Where the hero card was on screen, in window coordinates.
export type ZoomFrom = { x: number; y: number; width: number; height: number }

// Degrees at full tilt: well past the hero's 14°, since the card has the screen to itself.
const MAX_TILT_DEG = 32
// The phone alone tilts it this far (0-1 of full); a finger can take it the rest of the way.
const SENSOR_SHARE = 0.75
// Dragging this many points across the card tilts it fully.
const FINGER_RANGE = 150
const GLARE_TRAVEL = 70
// Lifting out after a hold carries a little momentum; putting it back lands without a bounce.
const OPEN = { duration: 450, dampingRatio: 0.8 }
const CLOSE = { duration: 380, dampingRatio: 1 }
const LET_GO = { duration: 500, dampingRatio: 0.7 }

const clamp = (v: number) => {
  'worklet'
  return Math.max(-1, Math.min(1, v))
}

export function CardZoom({
  card,
  face,
  foil,
  from,
  closing,
  tilt,
  blurTarget,
  onClose,
  onClosed,
}: {
  card: ScryfallCard
  face: number
  foil: boolean
  from: ZoomFrom
  closing: boolean
  tilt: Tilt
  // The page behind, for Android's blur (iOS blurs whatever is underneath).
  blurTarget: RefObject<View | null>
  // Screen reader "escape" gesture: the same as going back.
  onClose: () => void
  // The card is back in the hero: unmount this.
  onClosed: () => void
}) {
  const { width: screenW, height: screenH } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const reducedMotion = useReducedMotion()

  // As big as fits with a margin, in the card's 63:88 shape, centered.
  const width = Math.min(screenW - 40, ((screenH - insets.top - insets.bottom - 64) * 63) / 88)
  const height = (width * 88) / 63
  // The hero card relative to the big one: center offset and scale.
  const fromX = from.x + from.width / 2 - screenW / 2
  const fromY = from.y + from.height / 2 - screenH / 2
  const fromScale = from.width / width

  // 0 = in the hero, 1 = out on its own.
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.set(
      withSpring(closing ? 0 : 1, closing ? CLOSE : OPEN, (finished) => {
        if (finished && closing) scheduleOnRN(onClosed)
      }),
    )
  }, [progress, closing, onClosed])

  // Finger tilt, -1..1 each way; springs back to flat when let go.
  const fingerX = useSharedValue(0)
  const fingerY = useSharedValue(0)
  const pan = Gesture.Pan()
    .enabled(!reducedMotion && !closing)
    .onUpdate((e) => {
      fingerX.set(clamp(e.translationX / FINGER_RANGE))
      fingerY.set(clamp(e.translationY / FINGER_RANGE))
    })
    .onFinalize((e) => {
      fingerX.set(withSpring(0, { ...LET_GO, velocity: e.velocityX / FINGER_RANGE }))
      fingerY.set(withSpring(0, { ...LET_GO, velocity: e.velocityY / FINGER_RANGE }))
    })

  // Phone and finger together, -1..1: drives the rotation, glare, shading and holo layer.
  const leanX = useSharedValue(0)
  const leanY = useSharedValue(0)
  // One stable object for the holo layer, like the screens' tilt.
  const [lean] = useState(() => ({ x: leanX, y: leanY }))
  useAnimatedReaction(
    () => [clamp(tilt.x.get() * SENSOR_SHARE + fingerX.get()), clamp(tilt.y.get() * SENSOR_SHARE + fingerY.get())],
    ([x, y]) => {
      lean.x.set(x)
      lean.y.set(y)
    },
  )

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [0, 1], Extrapolation.CLAMP),
  }))

  // Reduced motion: no flight from the hero, the card just fades in where it ends up.
  const liftStyle = useAnimatedStyle(() => {
    const p = progress.get()
    if (reducedMotion) return { opacity: interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP) }
    return {
      transform: [
        { translateX: fromX * (1 - p) },
        { translateY: fromY * (1 - p) },
        { scale: fromScale + (1 - fromScale) * p },
        // The hero card leans 3° to the left; it straightens as it comes out.
        { rotate: `${-3 * (1 - p)}deg` },
      ],
    }
  })

  const tiltStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateY: `${lean.x.get() * MAX_TILT_DEG}deg` },
      { rotateX: `${-lean.y.get() * MAX_TILT_DEG}deg` },
    ],
  }))

  // The shadow falls away from the side that lifts, and fades in as the card leaves the page.
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateX: -lean.x.get() * 18 }, { translateY: 12 - lean.y.get() * 18 }, { scale: 0.94 }],
  }))

  // The glare moves against the tilt, like a light fixed above the phone.
  const glareStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: `${-lean.x.get() * GLARE_TRAVEL}%` },
      { translateY: `${-lean.y.get() * GLARE_TRAVEL}%` },
    ],
  }))

  // Edges turning away from you darken (opacity only, so it's cheap).
  const shadeRight = useAnimatedStyle(() => ({ opacity: Math.max(0, lean.x.get()) * 0.5 }))
  const shadeLeft = useAnimatedStyle(() => ({ opacity: Math.max(0, -lean.x.get()) * 0.5 }))
  const shadeBottom = useAnimatedStyle(() => ({ opacity: Math.max(0, lean.y.get()) * 0.5 }))
  const shadeTop = useAnimatedStyle(() => ({ opacity: Math.max(0, -lean.y.get()) * 0.5 }))

  const image = faceImage(card, face)
  const radius = width * 0.045

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      {/* A still blur, faded in and out: animating the blur's own intensity is costly. */}
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={60}
          tint="dark"
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
        />
        <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      </Animated.View>

      <Animated.View
        style={[styles.slot, { left: (screenW - width) / 2, top: (screenH - height) / 2, width, height }, liftStyle]}
        pointerEvents={closing ? 'none' : 'auto'}
      >
        <Animated.View style={[styles.shadow, { borderRadius: radius }, shadowStyle]} />
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[styles.card, { borderRadius: radius }, tiltStyle]}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${card.name}, full screen. Go back to close.`}
          >
            {foil && image ? (
              <HoloFoil uri={image} tilt={lean} />
            ) : (
              <Image source={{ uri: image ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
            )}
            <Animated.View pointerEvents="none" style={[styles.shade, styles.shadeRight, shadeRight]} />
            <Animated.View pointerEvents="none" style={[styles.shade, styles.shadeLeft, shadeLeft]} />
            <Animated.View pointerEvents="none" style={[styles.shade, styles.shadeBottom, shadeBottom]} />
            <Animated.View pointerEvents="none" style={[styles.shade, styles.shadeTop, shadeTop]} />
            <Animated.View pointerEvents="none" style={[styles.glare, glareStyle]} />
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: 'rgba(8,7,6,0.35)',
  },
  slot: {
    position: 'absolute',
  },
  // No fill: only the shadow around it shows, so it never peeks out from under the card.
  shadow: {
    ...StyleSheet.absoluteFill,
    boxShadow: '0 30px 60px rgba(0,0,0,0.7)',
  },
  card: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    backgroundColor: '#17150F',
    boxShadow: '0 0 0 1px rgba(237,230,214,0.22)',
  },
  shade: {
    ...StyleSheet.absoluteFill,
  },
  shadeRight: {
    experimental_backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0) 35%, rgba(0,0,0,0.85))',
  },
  shadeLeft: {
    experimental_backgroundImage: 'linear-gradient(to left, rgba(0,0,0,0) 35%, rgba(0,0,0,0.85))',
  },
  shadeBottom: {
    experimental_backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 35%, rgba(0,0,0,0.85))',
  },
  shadeTop: {
    experimental_backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0) 35%, rgba(0,0,0,0.85))',
  },
  glare: {
    position: 'absolute',
    left: '-20%',
    top: '-20%',
    width: '140%',
    height: '140%',
    experimental_backgroundImage: 'radial-gradient(circle at 50% 39%, rgba(255,255,255,0.32), rgba(255,255,255,0) 50%)',
  },
})
