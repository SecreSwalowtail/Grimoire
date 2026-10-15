import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { cubicBezier, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoloFoil } from '@/components/card-effects/holo-foil';
import type { Tilt } from '@/components/card-effects/tilt';
import type { CardTab } from '@/components/card/card-chrome';
import type { ZoomFrom } from '@/components/card/card-zoom';
import { CostRow, OracleText } from '@/components/card/oracle-text';
import { ManaSymbol } from '@/components/mana-symbol';
import { NavIcon } from '@/components/nav-icon';
import { Colors, Fonts, RarityColors } from '@/constants/theme';
import type { CollectionEntry, PricePoint } from '@/db/collection';
import { cardArt, faceImage, type CardFace, type ScryfallCard } from '@/db/scryfall';
import { identityName, sortColors } from '@/rules/colors';
import { commanderStatus } from '@/rules/commander';
import { isPlayable, PAPER_FORMATS } from '@/rules/formats';
import { FLIPPABLE } from '@/rules/printings';
import { mainFinish, priceChange, priceOf, SHOW_HISTORY } from '@/utils/card-prices';
import { withAlpha } from '@/utils/deck-store';
import { capitalize, formatEur } from '@/utils/format';

// C1 · Card — Overview: the hero (art backdrop, tilted card, name, cost, type), then at a glance,
// card text, facts and legality. The bottom bar (Add to deck / Add to binder) is the screen's.

const HERO_HEIGHT = 420
// Degrees at full tilt: 25% more than the Binder / Market cards (11.25°, card-tile.tsx), since this
// is the one card on screen. And how far the glare moves (same as the Binder).
const MAX_TILT_DEG = 11.25 * 1.25
const GLARE_TRAVEL = 63
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
// Pressing in sinks the card a little before it lifts out to full screen (card-zoom.tsx).
// (Reanimated CSS transition; outside StyleSheet.create, whose types don't know these properties.)
const PRESS_TRANSITION = {
  transitionProperty: 'transform',
  transitionDuration: 120,
  transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
} as const

// The face on show: double-faced cards flip between faces; split, adventure and flip cards show
// the whole card.
export function shownFace(card: ScryfallCard, face: number): CardFace | ScryfallCard {
  return FLIPPABLE.includes(card.layout ?? '') ? card.card_faces?.[face] ?? card : card
}

// Behind the hero: the card's art, blurred, fading into the screen.
export function HeroBackdrop({ card, face }: { card: ScryfallCard; face: number }) {
  return (
    <View style={styles.backdrop} pointerEvents="none">
      <Image source={{ uri: cardArt(card, face) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={28} />
      <View style={[StyleSheet.absoluteFill, styles.backdropFade]} />
    </View>
  )
}

function stats(face: CardFace | ScryfallCard) {
  if (face.power != null && face.toughness != null) return `${face.power} / ${face.toughness}`
  if (face.loyalty != null) return `Loyalty ${face.loyalty}`
  if (face.defense != null) return `Defense ${face.defense}`
  return null
}

// The card tilts in 3D with the phone and catches a moving glare, like the Binder cards; a
// foil-only printing (or `foil`: a foil finish picked on the Prices tab) also gets the holographic
// layer. `tilt` stays flat when the sensor is off. Tap: the card lifts out to full screen
// (`onZoom`, with where it sits now); `hidden` while it's out there.
export function CardHero({
  card,
  face,
  tilt,
  foil,
  hidden,
  onFlip,
  onZoom,
}: {
  card: ScryfallCard
  face: number
  tilt: Tilt
  foil?: boolean
  hidden?: boolean
  onFlip: () => void
  onZoom: (from: ZoomFrom) => void
}) {
  const frame = useRef<View>(null)
  const [pressed, setPressed] = useState(false)
  const zoom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined)
    frame.current?.measureInWindow((x, y, width, height) => onZoom({ x, y, width, height }))
  }
  const tiltStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 700 },
      { rotateY: `${tilt.x.get() * MAX_TILT_DEG}deg` },
      { rotateX: `${-tilt.y.get() * MAX_TILT_DEG}deg` },
    ],
  }))
  // The glare moves against the tilt, like a light fixed above the phone.
  const glareStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: `${-tilt.x.get() * GLARE_TRAVEL}%` },
      { translateY: `${-tilt.y.get() * GLARE_TRAVEL}%` },
    ],
  }))
  const image = faceImage(card, face)
  const holo = foil || !(card.finishes ?? ['nonfoil']).includes('nonfoil')
  const shown = shownFace(card, face)
  const flippable = FLIPPABLE.includes(card.layout ?? '') && (card.card_faces?.length ?? 0) > 1
  const rarity = RarityColors[card.rarity] ?? Colors.textMuted
  const cost = shown.mana_cost ?? ''
  const halves = cost.split(' // ').filter(Boolean)
  const line = stats(shown)

  return (
    <View style={styles.hero}>
      <View>
        <AnimatedPressable
          ref={frame}
          style={[
            styles.cardFrame,
            { transform: [{ rotate: '-3deg' }, { scale: pressed ? 0.95 : 1 }], opacity: hidden ? 0 : 1 },
            PRESS_TRANSITION,
          ]}
          onPress={zoom}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          accessibilityRole="button"
          accessibilityLabel={`${card.name}, ${card.set.toUpperCase()} number ${card.collector_number}. View full screen`}
        >
          {/* The shadow stays on the still frame; only the card inside tilts. */}
          <Animated.View style={[styles.cardTilt, tiltStyle]}>
            {holo && image ? (
              <HoloFoil uri={image} tilt={tilt} />
            ) : (
              <Image source={{ uri: image ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            )}
            <Animated.View pointerEvents="none" style={[styles.glare, glareStyle]} />
          </Animated.View>
        </AnimatedPressable>
        {flippable && (
          <TouchableOpacity style={styles.flip} onPress={onFlip} accessibilityRole="button" accessibilityLabel="Show the other face">
            <SymbolView name={{ ios: 'arrow.triangle.2.circlepath', android: 'cached' }} size={18} tintColor={Colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.heroText}>
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: withAlpha(rarity, 0.18) }]}>
            <View style={[styles.chipDot, { backgroundColor: rarity }]} />
            <Text style={[styles.chipLabel, { color: rarity }]}>{capitalize(card.rarity)}</Text>
          </View>
          <View style={[styles.chip, styles.chipPlain]}>
            <Text style={styles.chipPlainLabel}>{card.set.toUpperCase()} · #{card.collector_number}</Text>
          </View>
        </View>
        <Text style={styles.name} accessibilityRole="header">{shown.name}</Text>
        {halves.length > 0 && (
          <View style={styles.cost}>
            {halves.map((half, h) => (
              <View key={h} style={styles.costHalf}>
                {h > 0 && <Text style={styles.costSlash}>{'//'}</Text>}
                <CostRow cost={half} size={24} />
              </View>
            ))}
          </View>
        )}
        {shown.type_line != null && <Text style={styles.type}>{shown.type_line}</Text>}
        <Text style={styles.statsLine}>
          {line != null && <Text style={styles.statsStrong}>{line} · </Text>}
          {card.set_name}
        </Text>
      </View>
    </View>
  )
}

export function OverviewTab({
  card,
  copies,
  history,
  decksUsing,
  copiesNeeded,
  onTab,
  onAddToDeck,
}: {
  card: ScryfallCard
  copies: CollectionEntry[]
  history: PricePoint[]
  decksUsing: number
  copiesNeeded: number
  onTab: (tab: CardTab) => void
  onAddToDeck: () => void
}) {
  const finish = mainFinish(card)
  const price = priceOf(card, finish, 'cardmarket')
  // Past prices are off for now, so no change over time either.
  const change = SHOW_HISTORY ? priceChange(history, 30, finish, 'cardmarket') : null
  const owned = copies.reduce((n, c) => n + c.quantity, 0)
  const short = Math.max(copiesNeeded - owned, 0)
  const faces: (CardFace | ScryfallCard)[] = card.card_faces?.length ? card.card_faces : [card]
  const withNames = faces.length > 1
  const flavor = faces.map((f) => f.flavor_text).filter(Boolean)
  const artist = card.artist ?? card.card_faces?.[0]?.artist
  const watermark = card.watermark ?? card.card_faces?.[0]?.watermark
  const identity = sortColors(card.color_identity ?? [])
  const commander = commanderStatus(card)
  const legal = PAPER_FORMATS.filter((f) => isPlayable(card.legalities?.[f.key]))
  const MAIN = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'pauper']
  const mainLegal = legal.filter((f) => MAIN.includes(f.key))
  const notLegal = PAPER_FORMATS.filter((f) => MAIN.includes(f.key) && card.legalities?.[f.key] != null && !isPlayable(card.legalities[f.key]))

  return (
    <View style={styles.tab}>
      <View style={styles.glance} accessibilityLabel="At a glance">
        <TouchableOpacity style={styles.glanceCell} onPress={() => onTab('prices')} accessibilityRole="button">
          <Text style={[styles.glanceValue, styles.gold]}>{price != null ? formatEur(price) : '—'}</Text>
          {change ? (
            <Text style={[styles.glanceNote, { color: change.diff >= 0 ? Colors.positive : Colors.negative }]}>
              {change.diff >= 0 ? '▲' : '▼'} {Math.abs(change.percent).toFixed(1)}% · {change.days}d
            </Text>
          ) : (
            <Text style={styles.glanceNote}>No history yet</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.glanceCell, styles.glanceRule]} onPress={() => onTab('printings')} accessibilityRole="button">
          <Text style={styles.glanceValue}>×{owned}</Text>
          <Text style={styles.glanceNote}>in your binder</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.glanceCell, styles.glanceRule]} onPress={onAddToDeck} accessibilityRole="button">
          <Text style={styles.glanceValue}>{decksUsing} {decksUsing === 1 ? 'deck' : 'decks'}</Text>
          {short > 0 ? (
            <Text style={[styles.glanceNote, styles.goldBold]}>{short} {short === 1 ? 'copy' : 'copies'} short</Text>
          ) : (
            <Text style={styles.glanceNote}>{decksUsing ? 'you have enough' : 'not in a deck'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <Text style={styles.label}>Card text</Text>
        <View style={styles.faces}>
          {faces.map((f, i) => (
            <View key={i} style={styles.faceBlock}>
              {withNames && (
                <View style={styles.faceHead}>
                  <Text style={styles.faceName}>{f.name}</Text>
                  {f.mana_cost ? <CostRow cost={f.mana_cost} size={16} /> : null}
                </View>
              )}
              {withNames && f.type_line != null && <Text style={styles.faceType}>{f.type_line}</Text>}
              {f.oracle_text ? (
                <OracleText text={f.oracle_text} keywords={card.keywords ?? []} />
              ) : (
                <Text style={styles.noText}>No rules text.</Text>
              )}
            </View>
          ))}
        </View>
        {flavor.length > 0 && (
          <View style={styles.flavorBlock}>
            {flavor.map((text, i) => (
              <Text key={i} style={styles.flavor}>{text}</Text>
            ))}
          </View>
        )}
        {(artist || watermark) && (
          <View style={styles.credits}>
            {artist ? (
              <Text style={styles.credit}>
                Illustrated by <Text style={styles.creditStrong}>{artist}</Text>
              </Text>
            ) : <View />}
            {watermark ? <Text style={styles.credit}>{capitalize(watermark)} watermark</Text> : null}
          </View>
        )}
      </View>

      <View style={styles.facts}>
        <Fact label="Mana value" value={String(card.cmc ?? 0)} />
        <View style={styles.fact}>
          <Text style={styles.factLabel}>Color identity</Text>
          <View style={styles.identity}>
            {(identity.length ? identity : ['C']).map((c) => <ManaSymbol key={c} symbol={c} size={16} />)}
            <Text style={styles.identityName} numberOfLines={1}>{identityName(identity)}</Text>
          </View>
        </View>
        <Fact label="Keywords" value={card.keywords?.length ? card.keywords.join(', ') : 'None'} />
        <Fact label="Commander" value={commander.short} />
      </View>

      <View style={styles.legalHead}>
        <Text style={styles.label}>Legal in {legal.length} {legal.length === 1 ? 'format' : 'formats'}</Text>
        <TouchableOpacity style={styles.link} onPress={() => onTab('rules')} accessibilityRole="button">
          <Text style={styles.linkLabel}>All formats</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.legalChips}>
        {mainLegal.map((f) => (
          <View key={f.key} style={styles.legalChip}>
            <View style={styles.legalDot} />
            <Text style={styles.legalLabel}>{f.label}</Text>
          </View>
        ))}
      </View>
      {notLegal.length > 0 && (
        <Text style={styles.notLegal}>
          <Text style={styles.notLegalStrong}>Not legal: </Text>
          {notLegal.map((f) => f.label).join(', ')}
        </Text>
      )}
    </View>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  )
}

// Fixed at the bottom of the Overview: "Add to deck" and the gold "Add to binder".
export function OverviewActions({ onAddToDeck, onAddCopy }: { onAddToDeck: () => void; onAddCopy: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
      <TouchableOpacity style={styles.secondary} onPress={onAddToDeck} accessibilityRole="button">
        <NavIcon kind="decks" color={Colors.text} bg={Colors.surface} size={20} />
        <Text style={styles.secondaryLabel}>Add to deck</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.primary} onPress={onAddCopy} accessibilityRole="button">
        <SymbolView name={{ ios: 'plus', android: 'add' }} size={18} tintColor={Colors.onGold} weight="bold" />
        <Text style={styles.primaryLabel}>Add to binder</Text>
      </TouchableOpacity>
    </View>
  )
}

export const ACTIONS_HEIGHT = 52 + 32

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: HERO_HEIGHT,
    overflow: 'hidden',
  },
  backdropFade: {
    experimental_backgroundImage: 'linear-gradient(to bottom, rgba(14,13,11,0.45) 0%, rgba(14,13,11,0.7) 55%, #0E0D0B 100%)',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
  },
  cardFrame: {
    marginTop: 6,
    marginLeft: 2,
    width: 124,
    height: 174,
    borderRadius: 8,
    boxShadow: '0 0 0 1px rgba(237,230,214,0.20), 0 22px 44px rgba(0,0,0,0.6)',
    backgroundColor: Colors.surface,
  },
  cardTilt: {
    ...StyleSheet.absoluteFill,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  glare: {
    position: 'absolute',
    left: '-20%',
    top: '-20%',
    width: '140%',
    height: '140%',
    experimental_backgroundImage: 'radial-gradient(circle at 50% 39%, rgba(255,255,255,0.28), rgba(255,255,255,0) 50%)',
  },
  flip: {
    position: 'absolute',
    right: -8,
    bottom: -10,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.18)',
    backgroundColor: 'rgba(14,13,11,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipLabel: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
  },
  chipPlain: {
    backgroundColor: 'rgba(237,230,214,0.09)',
  },
  chipPlainLabel: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: '#CFC7B4',
  },
  name: {
    marginTop: 12,
    fontSize: 31,
    lineHeight: 33,
    fontFamily: Fonts.serif,
    color: '#F5EEDD',
  },
  cost: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  costHalf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  costSlash: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  type: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  statsLine: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  statsStrong: {
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  tab: {
    paddingTop: 18,
    gap: 14,
  },
  glance: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  glanceCell: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 8,
  },
  glanceRule: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
  },
  glanceValue: {
    fontSize: 19,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  glanceNote: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  gold: {
    color: Colors.goldLight,
  },
  goldBold: {
    fontFamily: Fonts.bold,
    color: Colors.goldLight,
  },
  panel: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  label: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  faces: {
    marginTop: 10,
    gap: 16,
  },
  faceBlock: {
    gap: 6,
  },
  faceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  faceName: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  faceType: {
    marginBottom: 2,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  noText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  flavorBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8,
  },
  flavor: {
    fontSize: 18,
    lineHeight: 23,
    fontFamily: Fonts.serifItalic,
    color: '#CFC7B4',
  },
  credits: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  credit: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  creditStrong: {
    fontFamily: Fonts.bold,
    color: '#CFC7B4',
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fact: {
    width: '48.8%',
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  factLabel: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  factValue: {
    marginTop: 3,
    flexShrink: 1,
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  identity: {
    marginTop: 3,
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Same look as factValue, but no top margin and a fixed line height, so it centers on the symbols.
  identityName: {
    flexShrink: 1,
    marginLeft: 3,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  legalHead: {
    marginTop: 4,
    marginLeft: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  link: {
    height: 32,
    justifyContent: 'center',
  },
  linkLabel: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Colors.gold,
  },
  legalChips: {
    marginTop: -4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legalChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(127,199,166,0.35)',
    backgroundColor: 'rgba(127,199,166,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.positive,
  },
  legalLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: '#BFE5D3',
  },
  // Under the green chips, as plain text: a chip with wrapped text looks broken.
  notLegal: {
    marginTop: -4,
    marginLeft: 2,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  notLegalStrong: {
    fontFamily: Fonts.bold,
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 32,
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 10,
    experimental_backgroundImage: 'linear-gradient(to bottom, rgba(14,13,11,0), #0E0D0B 38%)',
  },
  secondary: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.16)',
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  primary: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
})
