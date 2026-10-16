import { BlurView } from 'expo-blur'
import { router } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { EditCopiesSheet } from '@/components/binder/edit-copies-sheet'
import { FLAT, TiltSensor, type Tilt } from '@/components/card-effects/tilt'
import { CardFace } from '@/components/card-tile'
import { PathIcon } from '@/components/deck/parts'
import { Icon } from '@/components/icon'
import { CostRow } from '@/components/mana-symbol'
import { Colors, Fonts, RarityColors } from '@/constants/theme'
import type { Binder } from '@/db/binders'
import { getSavedCard } from '@/db/cards'
import { entryPrice, setQuantity, type CollectionEntry } from '@/db/collection'
import { cardManaCost, faceImage, type ScryfallCard } from '@/db/scryfall'
import { conditionName, FINISH_NAME, LANGUAGE_NAMES } from '@/rules/collection'
import { COLOR_HEX, parseColors } from '@/rules/deck-stats'
import { withAlpha } from '@/utils/color'
import { cardUse, useDeckStore } from '@/utils/deck-store'
import { capitalize, plural } from '@/utils/format'
import { useMoney } from '@/utils/money'
import { tick, useAnimationsOff, useModalAnimation } from '@/utils/motion'

// 1b · Card quick look: a card from a binder held up over the blurred binder, alive like in the
// grid (it tilts with the phone, foils shine, expensive cards shimmer), with what a player wants at
// a glance (price and its week, cost and type, the copies here and how they're kept, the decks it's
// in) and the way on: Edit (condition, finish, trade) and Full details. Swipe the card left or right
// (or use the arrows) for the next or previous card in the grid's order: the card follows the
// finger, the neighbors peek in from the sides, and each change taps the phone.

// Settles without bouncing back and forth.
const SETTLE = { damping: 32, stiffness: 260 }
// How far the neighbors lean, per card away.
const LEAN_DEG = 1.5
// A drag this share of the way to a neighbor (or a flick) moves to it.
const SWITCH_AT = 0.22
const FLICK = 450
const CARD_RATIO = 63 / 88

type OldPrice = { price_eur: number | null; price_eur_foil: number | null }

// "3/4", a planeswalker's loyalty or a battle's defense (the front face's for double-faced cards).
function statsOf(card: ScryfallCard | null | undefined) {
  if (!card) return null
  const face = card.card_faces?.[0]
  const power = card.power ?? face?.power
  const toughness = card.toughness ?? face?.toughness
  if (power != null && toughness != null) return `${power}/${toughness}`
  const loyalty = card.loyalty ?? face?.loyalty
  if (loyalty != null) return `Loyalty ${loyalty}`
  const defense = card.defense ?? face?.defense
  return defense != null ? `Defense ${defense}` : null
}

export function QuickLook({
  entries,
  openId,
  title,
  binders,
  collection,
  weekAgo,
  blurTarget,
  onClose,
  onChanged,
}: {
  // The cards it goes through, in the grid's order.
  entries: CollectionEntry[]
  // The card opened (null: closed).
  openId: number | null
  // What the cards are: the binder's name, or the search.
  title: string
  binders: Binder[]
  // Everything owned, for copies in other binders.
  collection: CollectionEntry[]
  weekAgo: Map<string, OldPrice>
  // The screen behind, wrapped in a BlurTargetView: what Android blurs.
  blurTarget: RefObject<View | null>
  onClose: () => void
  // After a change to the collection (reload).
  onChanged: () => void
}) {
  const money = useMoney()
  const modalAnimation = useModalAnimation()
  const db = useSQLiteContext()
  const store = useDeckStore()
  const insets = useSafeAreaInsets()
  const { width: screenW, height: screenH } = useWindowDimensions()
  const visible = openId != null

  // The card on show: by id, so a reload doesn't lose it; by place, for when it's gone.
  const [at, setAt] = useState({ id: openId, index: 0 })
  // Copies just changed here, until the reload brings them.
  const [patches, setPatches] = useState<Map<number, Partial<CollectionEntry>>>(() => new Map())
  const [saved, setSaved] = useState<Map<string, ScryfallCard | null>>(() => new Map())
  const [editOpen, setEditOpen] = useState(false)
  const [sheetH, setSheetH] = useState(360)
  // Phone tilt for the card on show, as in the grid (the sensor runs only while open).
  const reducedMotion = useAnimationsOff()
  const tiltX = useSharedValue(0)
  const tiltY = useSharedValue(0)
  const [tilt] = useState<Tilt>(() => ({ x: tiltX, y: tiltY }))

  const [wasOpen, setWasOpen] = useState(openId)
  if (openId !== wasOpen) {
    setWasOpen(openId)
    if (openId != null) {
      setAt({ id: openId, index: Math.max(0, entries.findIndex((e) => e.id === openId)) })
      setPatches(new Map())
    }
  }

  const found = entries.findIndex((e) => e.id === at.id)
  const last = entries.length - 1
  const index = found >= 0 ? found : Math.max(0, Math.min(at.index, last))
  const entry = entries[index] as CollectionEntry | undefined

  // Where the cards are, in cards (2.4 = between the third and fourth): follows the finger.
  const pos = useSharedValue(index)
  const start = useSharedValue(0)
  // The place this screen last moved to itself: any other change (a card removed, a reload in
  // another order) puts the cards straight there.
  const expected = useSharedValue(index)
  useLayoutEffect(() => {
    if (index !== expected.get()) pos.set(index)
    expected.set(index)
  }, [index, pos, expected])
  useLayoutEffect(() => {
    if (openId != null) pos.set(Math.max(0, entries.findIndex((e) => e.id === openId)))
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, pos])

  // The card's full data (cost, stats, a sharper image).
  const cardId = entry?.card_id
  useEffect(() => {
    if (!visible || !cardId || saved.has(cardId)) return
    let live = true
    getSavedCard(db, cardId)
      .then((s) => live && setSaved((m) => new Map(m).set(cardId, s?.card ?? null)))
      .catch((e) => console.warn('Failed to read card', e))
    return () => {
      live = false
    }
  }, [visible, cardId, saved, db])

  // Sizes: the card as big as fits between the top bar and the info sheet, clear of the arrows at
  // the sides, with the dots and a margin under it.
  const barTop = insets.top + 8
  const bandTop = barTop + 44 + 14
  const maxH = screenH - bandTop - sheetH - 44
  const cardH = Math.max(160, Math.min((screenW - 112) / CARD_RATIO, maxH))
  const cardW = cardH * CARD_RATIO
  // A neighbor's middle sits this far from the card's: a gap between them, and they peek in at the
  // screen's edges.
  const spacing = cardW * 0.86 + 28

  const select = (target: number) => {
    const e = entries[target]
    if (!e) return
    expected.set(target)
    setAt({ id: e.id, index: target })
    tick()
  }
  const go = (by: number) => {
    const target = Math.max(0, Math.min(last, index + by))
    if (target === index) return
    pos.set(withSpring(target, SETTLE))
    select(target)
  }

  // Drag across the card: right brings the previous card in from the left, left the next one.
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onStart(() => {
      start.set(pos.get())
    })
    .onUpdate((e) => {
      const p = start.get() - e.translationX / spacing
      // Past the first or last card it gives, but less.
      pos.set(p < 0 ? p / 3 : p > last ? last + (p - last) / 3 : p)
    })
    .onEnd((e) => {
      const from = Math.round(start.get())
      let target = from
      if (e.translationX < -spacing * SWITCH_AT || e.velocityX < -FLICK) target = from + 1
      else if (e.translationX > spacing * SWITCH_AT || e.velocityX > FLICK) target = from - 1
      target = Math.max(0, Math.min(last, target))
      pos.set(withSpring(target, SETTLE))
      if (target !== from) scheduleOnRN(select, target)
    })

  const openDetails = () => {
    if (!entry) return
    onClose()
    router.push({ pathname: '/card/[id]', params: { id: entry.card_id } })
  }

  if (!entry) {
    return <Modal visible={false} transparent onRequestClose={onClose} />
  }

  const card = saved.get(entry.card_id)
  const binder = binders.find((b) => b.id === entry.binder_id)
  // The card as just changed here, before the reload brings it.
  const now = { ...entry, ...patches.get(entry.id) }
  const qty = now.quantity
  const price = entryPrice(entry)
  const before = weekAgo.get(entry.card_id)
  const then = before ? entryPrice({ finish: entry.finish, ...before }) : null
  const change = price != null && then != null && then > 0 ? ((price - then) / then) * 100 : null
  const elsewhere = collection.reduce((n, e) => n + (e.name === entry.name && e.id !== entry.id ? e.quantity : 0), 0)
  const decks = [...cardUse(entry.name, store).values()].filter((c) => c.main + c.side > 0).length
  const typeLine = card?.type_line ?? card?.card_faces?.[0]?.type_line ?? entry.type_line ?? ''
  const stats = statsOf(card)
  const cost = card ? cardManaCost(card) : ''
  const colors = parseColors(entry.colors)
  const glow = withAlpha(colors.length ? COLOR_HEX[colors[0]] : Colors.gold, 0.3)

  const changeQty = (next: number) => {
    if (next < 1) return
    setPatches(new Map(patches).set(entry.id, { quantity: next }))
    setQuantity(db, entry.id, next)
      .then(onChanged)
      .catch((e) => console.warn('Failed to change copies', e))
  }

  // Up to 5 dots (7 when that's all): the one for this card is long.
  const dotCount = entries.length <= 7 ? entries.length : 5
  const activeDot = entries.length <= 7 ? index : index < 2 ? index : index > last - 2 ? 4 - (last - index) : 2

  // The cards around this one, this one drawn last (on top).
  const around = [-2, -1, 1, 2, 0].map((d) => index + d).filter((i) => i >= 0 && i <= last)

  return (
    <Modal visible={visible} transparent animationType={modalAnimation} statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        {visible && !reducedMotion && <TiltSensor tilt={tilt} />}
        {/* The binder underneath, blurred (only dimmed on Android before 12). */}
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={28}
          tint="dark"
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
        />
        <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close quick look" />

        <View style={[styles.topBar, { top: barTop }]} pointerEvents="box-none">
          <View style={styles.where}>
            <View style={[styles.whereSpine, { backgroundColor: binder?.color ?? Colors.gold }]} />
            <Text style={styles.whereLabel} numberOfLines={1}>
              {title} · <Text style={styles.whereStrong}>{index + 1} / {entries.length}</Text>
            </Text>
          </View>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Icon name={{ ios: 'xmark', android: 'close' }} size={18} tintColor={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* The cards: drag anywhere across this band. */}
        <GestureDetector gesture={pan}>
          <View style={[styles.band, { top: bandTop, height: cardH }]}>
            {around.map((i) => (
              <Slot
                key={entries[i].id}
                entry={entries[i]}
                i={i}
                pos={pos}
                spacing={spacing}
                left={(screenW - cardW) / 2}
                width={cardW}
                height={cardH}
                image={i === index && card ? faceImage(card) : null}
                glow={i === index ? glow : null}
                // Only the card on show moves; the neighbors lie still.
                tilt={i === index ? tilt : null}
                onPress={i === index ? openDetails : () => go(i - index)}
              />
            ))}
          </View>
        </GestureDetector>

        {index > 0 && (
          <TouchableOpacity
            style={[styles.arrow, styles.arrowLeft, { top: bandTop + cardH / 2 - 22 }]}
            onPress={() => go(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous card"
          >
            <Icon name={{ ios: 'chevron.left', android: 'chevron_left' }} size={20} tintColor={Colors.text} />
          </TouchableOpacity>
        )}
        {index < last && (
          <TouchableOpacity
            style={[styles.arrow, styles.arrowRight, { top: bandTop + cardH / 2 - 22 }]}
            onPress={() => go(1)}
            accessibilityRole="button"
            accessibilityLabel="Next card"
          >
            <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={20} tintColor={Colors.text} />
          </TouchableOpacity>
        )}

        {dotCount > 1 && (
          <View style={[styles.dots, { top: bandTop + cardH + 14 }]} pointerEvents="none">
            {Array.from({ length: dotCount }, (_, k) => (
              <View key={k} style={[styles.dot, k === activeDot && styles.dotOn]} />
            ))}
          </View>
        )}

        {/* What a player wants to know, and the way on. */}
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          onLayout={(e) => setSheetH(Math.ceil(e.nativeEvent.layout.height))}
        >
          <View style={styles.handle} />

          <View style={styles.headRow}>
            <View style={styles.headText}>
              <Text style={styles.name} numberOfLines={2} accessibilityRole="header">{entry.name}</Text>
              <View style={styles.setRow}>
                <View style={[styles.rarityDot, { backgroundColor: RarityColors[entry.rarity] ?? Colors.textMuted }]} />
                <Text style={styles.setText} numberOfLines={1}>
                  {capitalize(entry.rarity)} · {entry.set_name} · {entry.set_code.toUpperCase()} #{entry.collector_number}
                </Text>
              </View>
            </View>
            <View style={styles.priceBox}>
              <Text style={styles.price}>{price != null ? money.eur(price) : '—'}</Text>
              {change != null && (
                <Text style={[styles.change, { color: change > 0 ? Colors.positive : change < 0 ? Colors.negative : Colors.textSecondary }]}>
                  {change > 0 ? '▲' : change < 0 ? '▼' : '—'} {Math.abs(change).toFixed(1)}% · 7 days
                </Text>
              )}
            </View>
          </View>

          {(typeLine !== '' || cost !== '' || stats) && (
            <View style={styles.typeRow}>
              <CostRow cost={cost} size={15} />
              <Text style={styles.typeText} numberOfLines={1}>{typeLine}</Text>
              {stats && <Text style={styles.stats}>{stats}</Text>}
            </View>
          )}

          <View style={styles.copies}>
            <View style={styles.copiesText}>
              <Text style={styles.copiesLabel} numberOfLines={1}>
                In {binder?.name ?? 'your binder'}
                {elsewhere > 0 ? ` · ${elsewhere} more elsewhere` : ''}
              </Text>
              <Text style={styles.copiesValue} numberOfLines={1}>
                {plural(qty, 'copy', 'copies')}
                {price != null ? ` · ${money.eur(price * qty)}` : ''}
              </Text>
            </View>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.step}
                onPress={() => changeQty(qty - 1)}
                disabled={qty <= 1}
                accessibilityRole="button"
                accessibilityLabel="Remove one copy"
              >
                <Text style={[styles.stepLabel, qty <= 1 && styles.stepOff]}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qty} accessibilityLiveRegion="polite">{qty}</Text>
              <TouchableOpacity style={styles.step} onPress={() => changeQty(qty + 1)} accessibilityRole="button" accessibilityLabel="Add one copy">
                <Text style={styles.stepLabel}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.chips}>
            <Chip label={FINISH_NAME[entry.finish]} />
            <Chip label={conditionName(entry.condition)} />
            <Chip label={LANGUAGE_NAMES[entry.language] ?? entry.language.toUpperCase()} />
            {entry.traded === 1 && <Chip label="Traded" />}
            {entry.purchase_price != null && <Chip label={`Paid ${money.eur(entry.purchase_price)}`} />}
            {entry.for_trade === 1 && <Chip label="For trade" gold />}
            <Chip label={decks ? `In ${plural(decks, 'deck')}` : 'In no deck'} gold={decks > 0} />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.iconAction}
              onPress={() => setEditOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit card: condition, finish, trade"
            >
              <PathIcon d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" color={Colors.text} size={20} weight={1.75} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.details} onPress={openDetails} accessibilityRole="button">
              <Text style={styles.detailsLabel}>Full details</Text>
              <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={16} tintColor={Colors.onGold} weight="bold" />
            </TouchableOpacity>
          </View>
        </View>

        <EditCopiesSheet
          visible={editOpen}
          entries={[now]}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setPatches(new Map())
            onChanged()
          }}
        />
      </GestureHandlerRootView>
    </Modal>
  )
}

// One card in the band: in the middle when it's the one on show, peeking in smaller, tilted and
// faded at the sides otherwise; in between while dragged.
function Slot({
  entry,
  i,
  pos,
  spacing,
  left,
  width,
  height,
  image,
  glow,
  tilt,
  onPress,
}: {
  entry: CollectionEntry
  i: number
  pos: SharedValue<number>
  spacing: number
  left: number
  width: number
  height: number
  // A sharper image than the grid's, once it's known.
  image: string | null
  glow: string | null
  // The phone's tilt for the card on show; null: it lies still.
  tilt: Tilt | null
  onPress: () => void
}) {
  const style = useAnimatedStyle(() => {
    const rel = i - pos.get()
    const away = Math.abs(rel)
    return {
      opacity: interpolate(away, [0, 1, 2], [1, 0.45, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: rel * spacing },
        { rotate: `${Math.max(-1.5, Math.min(1.5, rel)) * LEAN_DEG}deg` },
        { scale: interpolate(away, [0, 1], [1, 0.72], Extrapolation.CLAMP) },
      ],
    }
  })
  const radius = width * 0.045
  return (
    <Animated.View style={[styles.slot, { left, width, height }, style]}>
      <Pressable
        style={styles.slotPress}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={glow ? `${entry.name}. Open full details` : `Show ${entry.name}`}
        accessibilityHint={glow ? 'Swipe left or right for the other cards' : undefined}
      >
        <CardFace
          entry={entry}
          tilt={tilt ?? FLAT}
          still={tilt == null}
          image={image}
          radius={radius}
          style={[styles.slotCard, glow != null && { boxShadow: `0 30px 60px rgba(0,0,0,0.7), 0 0 90px ${glow}` }]}
        />
      </Pressable>
    </Animated.View>
  )
}

// A fact about the copy you have.
function Chip({ label, gold }: { label: string; gold?: boolean }) {
  return (
    <View style={[styles.chip, gold && styles.chipGold]}>
      <Text style={[styles.chipLabel, gold && styles.chipLabelGold]} numberOfLines={1}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    backgroundColor: 'rgba(8,7,6,0.62)',
  },
  topBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  where: {
    flexShrink: 1,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: 'rgba(23,21,15,0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  whereSpine: {
    width: 9,
    height: 13,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  whereLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: '#CFC7B4',
  },
  whereStrong: {
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.14)',
    backgroundColor: 'rgba(23,21,15,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  slot: {
    position: 'absolute',
    top: 0,
  },
  slotPress: {
    flex: 1,
  },
  // The big card: no grid spacing under it, and a deeper shadow.
  slotCard: {
    marginBottom: 0,
    boxShadow: '0 30px 60px rgba(0,0,0,0.7)',
  },
  arrow: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.16)',
    backgroundColor: 'rgba(14,13,11,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: {
    left: 8,
  },
  arrowRight: {
    right: 8,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(237,230,214,0.25)',
  },
  dotOn: {
    width: 18,
    backgroundColor: Colors.gold,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: 'rgba(23,21,15,0.97)',
    boxShadow: '0 -20px 50px rgba(0,0,0,0.5)',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(237,230,214,0.22)',
  },
  headRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 28,
    lineHeight: 30,
    fontFamily: Fonts.serif,
    color: '#F5EEDD',
  },
  setRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rarityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  setText: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  priceBox: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 24,
    lineHeight: 28,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
  change: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: Fonts.bold,
  },
  typeRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: '#CFC7B4',
  },
  stats: {
    paddingHorizontal: 8,
    lineHeight: 22,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceRaised,
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  copies: {
    marginTop: 14,
    height: 64,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copiesText: {
    flex: 1,
    minWidth: 0,
  },
  copiesLabel: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  copiesValue: {
    marginTop: 2,
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  stepOff: {
    color: '#5A5446',
  },
  qty: {
    minWidth: 26,
    textAlign: 'center',
    fontSize: 17,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  chips: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: 'rgba(237,230,214,0.07)',
    justifyContent: 'center',
  },
  chipGold: {
    backgroundColor: 'rgba(212,166,74,0.14)',
  },
  chipLabel: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: '#CFC7B4',
  },
  chipLabelGold: {
    color: Colors.goldLight,
  },
  actions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
  },
  iconAction: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.16)',
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailsLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
})
