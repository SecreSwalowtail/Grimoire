import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { css, cubicBezier, useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';

import { HoloFoil } from '@/components/card-effects/holo-foil';
import { FLAT, useTilt } from '@/components/card-effects/tilt';
import { Colors, Fonts, RarityColors } from '@/constants/theme';
import { entryPrice, type CollectionEntry } from '@/db/collection';
import { capitalize, formatEur } from '@/utils/format';

// Magic cards are 63 × 88 mm.
const CARD_RATIO = 63 / 88
const MAX_TILT_DEG = 11.25
const GLARE_TRAVEL = 63 // % of the glare layer (140% of the card) the highlight moves at full tilt

// Price tiers (EUR per copy), each adding to the one below:
//  10+  gold light sweeps across the card now and then
//  50+  faster sweep, gold edge and glow
//  100+ brighter, faster sweep and a pulsing gold aura
type Tier = 0 | 1 | 2 | 3
const TIER_PRICES = [10, 50, 100]
const tierFor = (price: number | null): Tier =>
  price == null ? 0 : (TIER_PRICES.filter((p) => price >= p).length as Tier)
const SHIMMER_DURATION = ['0s', '4.5s', '3s', '2.4s'] as const

// Light sweep: crosses the card in the first 30% of the loop, then rests off-card and hidden.
// translateX % is relative to the band's own width (45–55% of the card), so it has to travel
// well past 100% to clear the right edge, including the extra width from the rotation.
const SHIMMER = css.keyframes({
  '0%': { opacity: 1, transform: [{ translateX: '-180%' }, { rotate: '18deg' }] },
  '30%': { opacity: 1, transform: [{ translateX: '320%' }, { rotate: '18deg' }] },
  '31%': { opacity: 0, transform: [{ translateX: '320%' }, { rotate: '18deg' }] },
  '100%': { opacity: 0, transform: [{ translateX: '320%' }, { rotate: '18deg' }] },
})

// Aura breathing in and out (opacity only, so it's cheap).
const PULSE = css.keyframes({
  from: { opacity: 0.35 },
  to: { opacity: 1 },
})

// One card in the 3-column Binder grid: full card image with quantity / foil badges,
// name, and set code + price. Rarity is shown by the dot (and spoken by screen readers).
// The card tilts in 3D with the phone, catches a moving glare, foils get a holographic layer,
// and expensive cards shimmer.
//
// `active` = the card is on screen. Off-screen cards bind to the never-changing FLAT tilt, so
// their animated styles and foil shader don't re-run while the phone moves.
export function CardTile({ entry, active }: { entry: CollectionEntry; active: boolean }) {
  const screenTilt = useTilt()
  const tilt = active ? screenTilt : FLAT
  const reducedMotion = useReducedMotion()
  const price = entryPrice(entry)
  const foil = entry.finish !== 'nonfoil'
  const set = entry.set_code.toUpperCase()
  const tier = tierFor(price)
  const premium = tier >= 2

  const tiltStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 700 },
      { rotateY: `${tilt.x.get() * MAX_TILT_DEG}deg` },
      { rotateX: `${-tilt.y.get() * MAX_TILT_DEG}deg` },
    ],
  }))
  // The glare moves against the tilt, like a light source fixed above the phone.
  const glareStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: `${-tilt.x.get() * GLARE_TRAVEL}%` },
      { translateY: `${-tilt.y.get() * GLARE_TRAVEL}%` },
    ],
  }))

  return (
    <View
      style={styles.tile}
      accessible
      accessibilityLabel={`${entry.name}, ${entry.quantity} ${entry.quantity === 1 ? 'copy' : 'copies'}${foil ? `, ${entry.finish}` : ''}, ${set} ${capitalize(entry.rarity)}, ${price != null ? formatEur(price) : 'no price'}`}
    >
      {/* The shadow and glow sit on a layer that never moves: only the card inside tilts,
          so Android doesn't have to redraw blurred shadows every frame. */}
      <View style={[styles.cardShadow, premium && styles.premiumGlow]}>
        {tier === 3 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.aura,
              !reducedMotion && {
                animationName: PULSE,
                animationDuration: '1.6s',
                animationIterationCount: 'infinite',
                animationDirection: 'alternate',
                animationTimingFunction: cubicBezier(0.77, 0, 0.175, 1),
              },
            ]}
          />
        )}
        <Animated.View style={[styles.card, premium && styles.premiumEdge, tiltStyle]}>
          {/* Foils draw their image in Skia; a second <Image> would download it twice. */}
          {foil && entry.image_uri ? (
            <HoloFoil uri={entry.image_uri} tilt={tilt} />
          ) : (
            <Image source={{ uri: entry.image_uri ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          )}
          <Animated.View pointerEvents="none" style={[styles.glare, glareStyle]} />
          {tier > 0 && !reducedMotion && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.shimmer,
                tier === 3 && styles.shimmerBright,
                {
                  animationName: SHIMMER,
                  animationDuration: SHIMMER_DURATION[tier],
                  // Offset per card so the grid doesn't flash in sync.
                  animationDelay: `${(entry.id % 7) * 0.45}s`,
                  // During the delay, hold the first keyframe (off-card) instead of the static style.
                  animationFillMode: 'backwards',
                  animationIterationCount: 'infinite',
                  animationTimingFunction: cubicBezier(0.77, 0, 0.175, 1),
                },
              ]}
            />
          )}
          {entry.quantity > 1 && <Text style={[styles.badge, styles.qty]}>×{entry.quantity}</Text>}
          {foil && (
            <View style={[styles.badge, styles.foil]}>
              <SymbolView name={{ ios: 'sparkle', android: 'auto_awesome' }} size={11} tintColor={Colors.goldLight} />
            </View>
          )}
        </Animated.View>
      </View>
      <Text style={styles.name} numberOfLines={1}>{entry.name}</Text>
      <View style={styles.meta}>
        <View style={styles.setRow}>
          <View style={[styles.dot, { backgroundColor: RarityColors[entry.rarity] ?? Colors.textMuted }]} />
          <Text style={styles.set} numberOfLines={1}>{set}</Text>
        </View>
        <Text style={styles.price} numberOfLines={1}>{price != null ? formatEur(price) : '—'}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
  },
  // Shadow lives on a wrapper without overflow clipping, so it isn't cut off by the card's corners.
  cardShadow: {
    marginBottom: 8,
    borderRadius: 6,
    boxShadow: '0 6px 12px rgba(0,0,0,0.55)',
  },
  premiumGlow: {
    boxShadow: '0 6px 12px rgba(0,0,0,0.55), 0 0 14px rgba(212,166,74,0.45)',
  },
  aura: {
    ...StyleSheet.absoluteFill,
    borderRadius: 6,
    boxShadow: '0 0 22px 3px rgba(232,192,106,0.85)',
  },
  premiumEdge: {
    borderWidth: 1,
    borderColor: 'rgba(232,192,106,0.8)',
  },
  // 140% of the card (was 200%): half the area to draw, same visible highlight.
  glare: {
    position: 'absolute',
    left: '-20%',
    top: '-20%',
    width: '140%',
    height: '140%',
    experimental_backgroundImage: 'radial-gradient(circle at 50% 39%, rgba(255,255,255,0.28), rgba(255,255,255,0) 50%)',
  },
  shimmer: {
    position: 'absolute',
    top: '-25%',
    left: 0,
    width: '45%',
    height: '150%',
    experimental_backgroundImage:
      'linear-gradient(to right, rgba(255,226,160,0), rgba(255,226,160,0.55) 50%, rgba(255,226,160,0))',
  },
  shimmerBright: {
    width: '55%',
    experimental_backgroundImage:
      'linear-gradient(to right, rgba(255,232,170,0), rgba(255,236,180,0.8) 50%, rgba(255,232,170,0))',
  },
  card: {
    aspectRatio: CARD_RATIO,
    // Real cards have ~3 mm corners on 63 mm: about 5% of the width.
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(237,230,214,0.12)',
  },
  badge: {
    position: 'absolute',
    top: 6,
    height: 20,
    minWidth: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(14,13,11,0.8)',
    overflow: 'hidden',
  },
  qty: {
    left: 6,
    paddingHorizontal: 6,
    lineHeight: 20,
    fontSize: 11,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    textAlign: 'center',
  },
  foil: {
    right: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  meta: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  setRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  set: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    letterSpacing: 0.3,
    color: Colors.textSecondary,
  },
  price: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
})
