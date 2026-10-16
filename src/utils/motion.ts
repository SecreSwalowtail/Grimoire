import * as Haptics from 'expo-haptics'
import { useReducedMotion } from 'react-native-reanimated'

import { getSettings, useSettings } from '@/utils/settings'

// Animations and taps, as Settings has them. With animations off (or the phone's reduce-motion
// setting on), Reanimated's animations finish at once (see the root layout), card effects (tilt,
// foil shimmer, pulse) stop and dialogs appear without fading; dragging still works.

export function useAnimationsOff() {
  const system = useReducedMotion()
  const { animations } = useSettings()
  return system || !animations
}

// For a Modal's animationType.
export function useModalAnimation(): 'fade' | 'none' {
  return useAnimationsOff() ? 'none' : 'fade'
}

// A light tap (a new card, a new day on the price chart), if taps are on.
export function tick() {
  if (getSettings().haptics) Haptics.selectionAsync().catch(() => undefined)
}

// A firmer tap.
export function thump() {
  if (getSettings().haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined)
}
