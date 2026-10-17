import { Image } from 'expo-image'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native'
import { Gesture, ScrollView } from 'react-native-gesture-handler'
import Animated, {
  scrollTo,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { PathIcon } from '@/components/deck/parts'
import { Colors, Fonts } from '@/constants/theme'
import type { DeckLine } from '@/rules/deck-stats'
import type { Board } from '@/utils/deck-store'

// Dragging cards in edit mode. In the deck screen: onto the Main deck / Sideboard / Maybe chips,
// onto the commander (cover card or Commander group), or down into the trash bubble that rises at
// the bottom, which pulls the cards in when they come close (like deleting in Instagram). Taking the
// cards up into the top third of the screen scrolls to the top, where the chips and commander are.
// In a binder: onto its Deck and Binder buttons, or into the trash. In Decks: decks and folders
// onto a folder, another deck or folder (to take its place), Duplicate, or the trash.

// 'commander-group': the Commander group's header, another way to the commander slot.
// 'to-deck' / 'new-binder' / 'edit-cards': a binder's Add to deck, New binder and Edit buttons.
// 'duplicate' and `folder:<id>` / `deck:<id>`: the Decks screen's button and rows.
// 'out': the screen's edges, where a screen that turns them on (useCardDrag's `edges`) takes things
// out (a folder's decks out of the folder).
export type DropTarget =
  | 'trash'
  | 'out'
  | 'commander'
  | 'commander-group'
  | 'to-deck'
  | 'new-binder'
  | 'edit-cards'
  | 'duplicate'
  | `folder:${string}`
  | `deck:${string}`
  | Board
// `s`: the scroll offset when it was measured (-1 for targets that don't scroll with the list).
type Rect = { x: number; y: number; w: number; h: number; s: number }

const LONG_PRESS = 300
const SPRING = { damping: 18, stiffness: 220 }
// How close (to the bubble's middle) the finger has to come for the cards to snap into the trash.
const TRASH_PULL = 80
const TRASH_SIZE = 64
const DANGER = '#E5533D'
const TRASH_ICON = 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'
// The screen's size and how far its edges reach in (left and right, top, bottom), for the 'out'
// target.
type Edges = { w: number; h: number; side: number; top: number; bottom: number }

export type CardDrag = {
  x: SharedValue<number>
  y: SharedValue<number>
  active: SharedValue<boolean>
  hover: SharedValue<DropTarget | null>
  rects: SharedValue<Partial<Record<DropTarget, Rect>>>
  // The same, kept on the JS side: targets measure one after another, and reading the shared value
  // back between writes can miss the one before.
  rectMap: Map<DropTarget, Rect>
  // Every target's measuring, run again when a drag starts (the chips scroll with the list).
  measurers: Set<() => void>
  // Whether the commander takes what's dragged, and the part of the deck on show (moving there
  // does nothing).
  commanderOk: SharedValue<boolean>
  board: SharedValue<Board | null>
  // Targets that aren't targets for this drag (the things being dragged), and ones that turn it down.
  skip: SharedValue<string[]>
  refuse: SharedValue<string[]>
  // The list's scroll view and how far it's scrolled (none where every target stays put).
  scrollRef?: AnimatedRef<any>
  scrollY: SharedValue<number>
  // Whether this drag already scrolled to the top.
  jumped: SharedValue<boolean>
  // The screen's edges as the 'out' target (null: none).
  edges: SharedValue<Edges | null>
}

// The binder passes nothing: it has no commander or parts of a deck, and its targets don't scroll.
export function useCardDrag({
  commanderOk = false,
  board = null,
  scrollRef,
  scrollY,
  skip = NONE,
  refuse = NONE,
  edges,
}: {
  commanderOk?: boolean
  board?: Board | null
  scrollRef?: AnimatedRef<any>
  scrollY?: SharedValue<number>
  skip?: string[]
  refuse?: string[]
  // Turns the screen's edges into the 'out' target: `side` points in from the left and right, the
  // top `top` points and the bottom `bottom` points (the trash, checked first, still wins there).
  edges?: { side: number; top: number; bottom: number }
} = {}): CardDrag {
  const { width: screenW, height: screenH } = useWindowDimensions()
  // One of each for the screen's life: written to by the targets, never rendered from.
  const [rectMap] = useState(() => new Map<DropTarget, Rect>())
  const [measurers] = useState(() => new Set<() => void>())
  const noScroll = useSharedValue(0)
  const drag: CardDrag = {
    rectMap,
    measurers,
    x: useSharedValue(0),
    y: useSharedValue(0),
    active: useSharedValue(false),
    hover: useSharedValue<DropTarget | null>(null),
    rects: useSharedValue<Partial<Record<DropTarget, Rect>>>({}),
    commanderOk: useSharedValue(commanderOk),
    board: useSharedValue<Board | null>(board),
    skip: useSharedValue(skip),
    refuse: useSharedValue(refuse),
    scrollRef,
    scrollY: scrollY ?? noScroll,
    jumped: useSharedValue(false),
    edges: useSharedValue<Edges | null>(null),
  }
  const { commanderOk: ok, board: on } = drag
  useEffect(() => ok.set(commanderOk), [ok, commanderOk])
  useEffect(() => on.set(board), [on, board])
  // By content, as the lists are new arrays every render.
  const { skip: skipped, refuse: refused } = drag
  const skipKey = skip.join('\n')
  const refuseKey = refuse.join('\n')
  useEffect(() => skipped.set(skipKey ? skipKey.split('\n') : []), [skipped, skipKey])
  useEffect(() => refused.set(refuseKey ? refuseKey.split('\n') : []), [refused, refuseKey])
  const { edges: edgeBox } = drag
  const edgeSide = edges?.side
  const edgeTop = edges?.top
  const edgeBottom = edges?.bottom
  useEffect(
    () =>
      edgeBox.set(
        edgeSide == null || edgeTop == null || edgeBottom == null
          ? null
          : { w: screenW, h: screenH, side: edgeSide, top: edgeTop, bottom: edgeBottom },
      ),
    [edgeBox, edgeSide, edgeTop, edgeBottom, screenW, screenH],
  )
  return drag
}

const NONE: string[] = []

const isCommander = (t: DropTarget) => {
  'worklet'
  return t === 'commander' || t === 'commander-group'
}

// Whether a target takes the drop: the commander only when allowed, the part of the deck on show
// never (nothing would change).
const accepts = (drag: CardDrag, target: DropTarget) => {
  'worklet'
  if (drag.refuse.get().includes(target)) return false
  if (isCommander(target)) return drag.commanderOk.get()
  if (target === 'main' || target === 'side' || target === 'maybe') return target !== drag.board.get()
  return true
}

// Gesture handler's scroll view, animatable so a drag can scroll it.
export const DragScrollView = Animated.createAnimatedComponent(ScrollView)

// Whether a finger at (px, py) on screen is close enough to the trash bubble to be pulled in.
// `rects`: the drag's (passed on its own: a worklet shouldn't take the whole drag along).
export const nearTrash = (rects: CardDrag['rects'], px: number, py: number) => {
  'worklet'
  const t = rects.get().trash
  return t != null && Math.hypot(px - (t.x + t.w / 2), py - (t.y + t.h / 2)) < TRASH_PULL
}

// Hold a card to pick it up (with whatever is selected); let go over a target to drop.
// `onStart` gets the held card, `onDrop` the target under the finger (null: none). `topZone`: how
// far down the screen (from the top) taking the cards scrolls the list to the top (0: never).
export function dragGesture<T>(
  drag: CardDrag,
  card: T,
  onStart: (card: T) => void,
  onDrop: (target: DropTarget | null) => void,
  topZone = 0,
) {
  const { x, y, active, hover, rects, measurers, scrollRef, scrollY, jumped, skip, edges } = drag
  const remeasure = () => measurers.forEach((m) => m())
  const hit = (px: number, py: number): DropTarget | null => {
    'worklet'
    const all = rects.get()
    // The trash pulls from a distance.
    if (nearTrash(rects, px, py)) return 'trash'
    // The screen's edges (where a screen turns them on).
    const e = edges.get()
    if (e && (px < e.side || px > e.w - e.side || py < e.top || py > e.h - e.bottom)) return 'out'
    for (const key in all) {
      if (key === 'trash' || skip.get().includes(key)) continue
      const r = all[key as DropTarget]!
      // Targets in the list moved by however much it scrolled since they were measured.
      const ry = r.s >= 0 ? r.y + r.s - scrollY.get() : r.y
      if (px >= r.x && px <= r.x + r.w && py >= ry && py <= ry + r.h) return key as DropTarget
    }
    return null
  }
  return Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS)
    .onStart((e) => {
      x.set(e.absoluteX)
      y.set(e.absoluteY)
      hover.set(null)
      active.set(true)
      jumped.set(false)
      scheduleOnRN(remeasure)
      scheduleOnRN(onStart, card)
    })
    .onUpdate((e) => {
      x.set(e.absoluteX)
      y.set(e.absoluteY)
      // Up into the top of the screen: straight to the top of the list.
      if (scrollRef && e.absoluteY < topZone && !jumped.get() && scrollY.get() > 0) {
        jumped.set(true)
        scrollTo(scrollRef, 0, 0, true)
      }
      const h = hit(e.absoluteX, e.absoluteY)
      if (h !== hover.get()) hover.set(h)
    })
    .onFinalize(() => {
      if (!active.get()) return
      const target = hover.get()
      active.set(false)
      hover.set(null)
      scheduleOnRN(onDrop, target)
    })
}

// Makes a view a drop target: measures it on screen and lights it gold under the finger (red when
// it won't take the cards). Spread `ref`, `onLayout` and `style` onto an Animated.View. `fixed`:
// it stays put when the list scrolls.
function useDropTarget(drag: CardDrag, id: DropTarget, fixed = false) {
  const ref = useRef<View>(null)
  const { rects, rectMap, measurers, scrollY } = drag
  const measure = () =>
    ref.current?.measureInWindow((x, y, w, h) => {
      rectMap.set(id, { x, y, w, h, s: fixed ? -1 : scrollY.get() })
      rects.set(Object.fromEntries(rectMap))
    })
  const latest = useRef(measure)
  useEffect(() => {
    latest.current = measure
  })
  useEffect(() => {
    const run = () => latest.current()
    measurers.add(run)
    const frame = requestAnimationFrame(run)
    return () => {
      cancelAnimationFrame(frame)
      measurers.delete(run)
      rectMap.delete(id)
      rects.set(Object.fromEntries(rectMap))
    }
  }, [measurers, rectMap, rects, id])

  const style = useAnimatedStyle(() => {
    const over = drag.hover.get() === id
    const ok = accepts(drag, id)
    return {
      transform: [{ scale: withSpring(over ? (ok ? 1.06 : 0.97) : 1, SPRING) }],
      borderColor: over ? (ok ? Colors.gold : DANGER) : 'transparent',
      backgroundColor: over ? (ok ? 'rgba(212,166,74,0.18)' : 'rgba(229,83,61,0.22)') : 'transparent',
    }
  })
  return { ref, onLayout: () => measure(), style }
}

// A drop target around something: a highlight frame drawn over it while it's under the finger.
// `fixed`: outside the list, so it stays put when the list scrolls.
export function DropZone({
  drag,
  id,
  fixed,
  style,
  children,
}: {
  drag: CardDrag
  id: DropTarget
  fixed?: boolean
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const { ref, onLayout, style: lit } = useDropTarget(drag, id, fixed)
  return (
    <View style={style}>
      {children}
      <Animated.View ref={ref} onLayout={onLayout} pointerEvents="none" style={[styles.zone, lit]} />
    </View>
  )
}

// What follows the finger: up to 5 cards fanned out, more as a bundle with a count. Over the trash
// it's pulled into the bubble and shrinks. `key`: unique among the dragged cards. `label`: what
// the bundle says it holds (cards and copies by default).
type GhostCard = Pick<DeckLine, 'name' | 'image' | 'quantity'> & { key: string }

export function DragGhost({ drag, lines, label }: { drag: CardDrag; lines: GhostCard[]; label?: string }) {
  const style = useAnimatedStyle(() => {
    const t = drag.rects.get().trash
    const intoTrash = drag.hover.get() === 'trash' && t != null
    const cx = intoTrash ? t.x + t.w / 2 : drag.x.get()
    const cy = intoTrash ? t.y + t.h / 2 + GHOST_H / 2 : drag.y.get() - 24
    return {
      opacity: withTiming(drag.active.get() ? 1 : 0, { duration: 120 }),
      transform: [
        { translateX: intoTrash ? withSpring(cx - GHOST_W / 2, SPRING) : cx - GHOST_W / 2 },
        { translateY: intoTrash ? withSpring(cy - GHOST_H, SPRING) : cy - GHOST_H },
        { scale: withSpring(!drag.active.get() ? 0.8 : intoTrash ? 0.4 : 1, SPRING) },
      ],
    }
  })
  // Red over a target that won't take the cards.
  const edge = useAnimatedStyle(() => {
    const h = drag.hover.get()
    const refused = h != null && !accepts(drag, h)
    return { opacity: withTiming(refused ? 1 : 0, { duration: 120 }) }
  })
  const n = lines.reduce((sum, l) => sum + l.quantity, 0)
  const bundle = lines.length > 5

  return (
    <Animated.View pointerEvents="none" style={[styles.ghost, style]}>
      {bundle ? (
        <View style={styles.bundle}>
          {lines.slice(0, 3).map((l, i) => (
            <View key={l.key} style={[styles.mini, styles.bundleCard, { left: 8 + i * 6, top: 8 - i * 4 }]}>
              {l.image && <Image source={{ uri: l.image }} style={StyleSheet.absoluteFill} contentFit="cover" />}
            </View>
          ))}
          <View style={styles.bundleText}>
            <Text style={styles.bundleCount}>{lines.length}</Text>
            <Text style={styles.bundleLabel}>{label ?? `${lines.length} cards · ${n} copies`}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.fan}>
          {lines.map((l, i) => {
            const mid = (lines.length - 1) / 2
            return (
              <View
                key={l.key}
                style={[
                  styles.mini,
                  { left: GHOST_W / 2 - MINI_W / 2 + (i - mid) * 20, top: 8 + Math.abs(i - mid) * 4, transform: [{ rotate: `${(i - mid) * 6}deg` }] },
                ]}
              >
                {l.image ? (
                  <Image source={{ uri: l.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <Text style={styles.miniName} numberOfLines={3}>{l.name}</Text>
                )}
              </View>
            )
          })}
        </View>
      )}
      <Animated.View style={[styles.refused, edge]} />
    </Animated.View>
  )
}

// The trash bubble: rises from the bottom while cards are dragged, swells red when they're over it.
export function TrashBubble({ drag, bottom }: { drag: CardDrag; bottom: number }) {
  const { ref, onLayout } = useDropTarget(drag, 'trash', true)
  const style = useAnimatedStyle(() => {
    const dragging = drag.active.get()
    const over = drag.hover.get() === 'trash'
    return {
      opacity: withTiming(dragging ? 1 : 0, { duration: 160 }),
      backgroundColor: withTiming(over ? DANGER : 'rgba(23,21,15,0.92)', { duration: 140 }),
      borderColor: over ? '#FF8A73' : 'rgba(237,230,214,0.25)',
      transform: [{ translateY: withSpring(dragging ? 0 : 40, SPRING) }, { scale: withSpring(over ? 1.35 : 1, SPRING) }],
    }
  })
  return (
    <View pointerEvents="none" style={[styles.trashWrap, { bottom }]}>
      <Animated.View ref={ref} onLayout={onLayout} style={[styles.trash, style]} accessible accessibilityLabel="Drag here to delete">
        <PathIcon d={TRASH_ICON} color={Colors.text} size={26} />
      </Animated.View>
    </View>
  )
}

// The screen's edges while dragging, when they take things out (useCardDrag's `edges`): a faint gold
// frame while anything is dragged, lit with `label` when the finger is on an edge.
export function EdgeZone({ drag, label }: { drag: CardDrag; label: string }) {
  const frame = useAnimatedStyle(() => {
    const on = drag.hover.get() === 'out'
    return { opacity: withTiming(on ? 1 : drag.active.get() ? 0.3 : 0, { duration: 140 }) }
  })
  const pill = useAnimatedStyle(() => ({
    opacity: withTiming(drag.hover.get() === 'out' ? 1 : 0, { duration: 140 }),
  }))
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.edgeFrame, frame]} />
      <Animated.View style={[styles.edgePill, pill]}>
        <Text style={styles.edgeLabel} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </View>
  )
}

// Height of the edit bar (title, buttons, room for the Scan button).
export const EDIT_BAR = 124

// The bar at the bottom in edit mode: Undo (the last change made here) and Done. `note` says what
// the last change did, in place of the hint.
export function EditBar({
  canUndo,
  onUndo,
  onDone,
  selected,
  note,
}: {
  canUndo: boolean
  onUndo: () => void
  onDone: () => void
  selected: number
  note?: string | null
}) {
  return (
    <View style={styles.bar}>
      <Text style={styles.barTitle} accessibilityLiveRegion="polite">
        {note ?? (selected ? `${selected} selected · hold one to drag them all` : 'Tap cards to select, then hold one to drag')}
      </Text>
      <View style={styles.barButtons}>
        <TouchableOpacity
          style={styles.undo}
          onPress={onUndo}
          disabled={!canUndo}
          accessibilityRole="button"
          accessibilityLabel="Undo the last change"
        >
          <PathIcon d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" color={canUndo ? Colors.text : Colors.textMuted} size={18} />
          <Text style={[styles.undoLabel, !canUndo && styles.off]}>Undo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.done} onPress={onDone} accessibilityRole="button">
          <Text style={styles.doneLabel}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const GHOST_W = 160
const GHOST_H = 96
const MINI_W = 52
const MINI_H = 72

const styles = StyleSheet.create({
  zone: {
    ...StyleSheet.absoluteFill,
    borderRadius: 18,
    borderWidth: 2,
  },
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 100,
    width: GHOST_W,
    height: GHOST_H,
  },
  refused: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: DANGER,
    backgroundColor: 'rgba(229,83,61,0.18)',
  },
  fan: {
    flex: 1,
  },
  mini: {
    position: 'absolute',
    width: MINI_W,
    height: MINI_H,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.25)',
    padding: 3,
    boxShadow: '0 8px 18px rgba(0,0,0,0.55)',
  },
  miniName: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  // More than five: a small stack and the count, on a gold-edged tile.
  bundle: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(212,166,74,0.6)',
    backgroundColor: 'rgba(23,21,15,0.96)',
    boxShadow: '0 12px 28px rgba(0,0,0,0.6)',
  },
  bundleCard: {
    width: 40,
    height: 56,
  },
  bundleText: {
    position: 'absolute',
    left: 72,
    right: 8,
    top: 14,
    gap: 2,
  },
  bundleCount: {
    fontSize: 28,
    lineHeight: 32,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  bundleLabel: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: '#CFC7B4',
  },
  edgeFrame: {
    ...StyleSheet.absoluteFill,
    borderWidth: 3,
    borderColor: Colors.gold,
    borderRadius: 28,
  },
  edgePill: {
    position: 'absolute',
    top: 64,
    alignSelf: 'center',
    maxWidth: '80%',
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
  },
  edgeLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
  trashWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 90,
  },
  trash: {
    width: TRASH_SIZE,
    height: TRASH_SIZE,
    borderRadius: TRASH_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 24px rgba(0,0,0,0.55)',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    // Clear of the Scan button, which rises above the tab bar.
    paddingBottom: 34,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.10)',
    backgroundColor: 'rgba(14,13,11,0.97)',
    gap: 10,
  },
  barTitle: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  barButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  undo: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.16)',
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  // Dimmed, not see-through: the list scrolls under the bar.
  off: {
    color: Colors.textMuted,
  },
  undoLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  done: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
})
