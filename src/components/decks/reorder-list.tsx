import { SymbolView } from 'expo-symbols';
import { useEffect, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  scrollTo,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Colors } from '@/constants/theme';

// Space between rows.
export const ROW_GAP = 6
const GAP = ROW_GAP
// Thickness of the gold guide line.
const LINE = 2
// Rows sliding into place, and the lift in / out.
const SETTLE = { damping: 20, stiffness: 240 }
// The lifted row's tilt: loose, so it sways as you drag up and down and wobbles to rest.
const WOBBLE = { damping: 6, stiffness: 170 }
// Degrees of tilt per px/s of drag speed, and the most it tilts.
const TILT = 0.003
const MAX_TILT = 3.5
// Hold a row this long to pick it up anywhere; the grip picks it up straight away.
const LONG_PRESS = 280
// Dropping into a target: the row flies in and shrinks away, then fades back into its slot.
const INTO = 240
const BACK = 220
// How long a dropped row waits to leave the list before it comes back instead.
const STAY_GONE = 500
// The soft gold glow a target gives when it gets a row: up quickly, then a slow fade
// (CSS ease-in-out).
const GLOW_IN = 160
const GLOW_OUT = 650
const GLOW_EASING = Easing.bezier(0.42, 0, 0.58, 1)
// Holding a row this close to the top or bottom of the scroll view scrolls it, up to this
// many px per frame (faster the closer to the edge).
const EDGE = 90
const SCROLL_SPEED = 12

type Positions = Record<string, number>

const indexById = (ids: string[]) => Object.fromEntries(ids.map((id, i) => [id, i])) as Positions

// Moves `id` from slot `from` to `to`, shifting the rows in between by one.
function move(positions: Positions, id: string, from: number, to: number) {
  'worklet'
  const next: Positions = {}
  for (const key in positions) {
    const p = positions[key]
    if (key === id) next[key] = to
    else if (from < to && p > from && p <= to) next[key] = p - 1
    else if (from > to && p >= to && p < from) next[key] = p + 1
    else next[key] = p
  }
  return next
}

// Shared between a list whose rows can be dropped (the decks) and the list they drop into
// (the folders): which target is under the dragged row, and the glow (0 → 1 → 0) of the one
// that got it.
export type DropFx = {
  hover: SharedValue<string | null>
  received: SharedValue<string | null>
  glow: SharedValue<number>
}

export function useDropFx(): DropFx {
  return {
    hover: useSharedValue<string | null>(null),
    received: useSharedValue<string | null>(null),
    glow: useSharedValue(0),
  }
}

// The rows of another list this list's rows can be dropped onto. `top` is where the first
// target starts, measured from the top of this list (negative when the targets are above).
export type DropTargets = {
  ids: string[]
  top: number
  slot: number
  height: number
  fx: DropFx
  onDrop: (itemId: string, targetId: string) => void
}

// The scroll view the list sits in, so dragging near its edges scrolls it. `top` / `bottom`
// are the visible area's edges on screen; `max` is how far the content can scroll.
export type AutoScroll = {
  ref: AnimatedRef<any>
  offset: SharedValue<number>
  max: number
  top: number
  bottom: number
}

type Drag = {
  positions: SharedValue<Positions>
  // The order when the row was picked up; restored while it hovers over a drop target.
  startPositions: SharedValue<Positions>
  active: SharedValue<string | null>
  // The row just dropped, still springing into its slot.
  settling: SharedValue<string | null>
  // A row is flying into a drop target; nothing can be picked up until it's back.
  dropping: SharedValue<boolean>
  startIndex: SharedValue<number>
  dragY: SharedValue<number>
  tilt: SharedValue<number>
  lift: SharedValue<number>
  // Scale and opacity for hovering over / dropping into a target.
  shrink: SharedValue<number>
  fade: SharedValue<number>
  // Where the guide line is drawn.
  guideY: SharedValue<number>
  // Auto-scroll: the offset when the row was picked up and where we've scrolled it to since,
  // plus the finger's last drag distance and position on screen.
  scrollStart: SharedValue<number>
  scrollAt: SharedValue<number>
  lastTranslation: SharedValue<number>
  fingerY: SharedValue<number>
}

// The guide line sits in the gap above the slot the row will land in.
const lineY = (at: number, slot: number) => {
  'worklet'
  return at * slot - GAP / 2 - LINE / 2
}

// A list of same-height rows you can drag to reorder: by the grip, or by holding a row.
// The lifted row sways with the drag speed, the others slide out of its way, and a gold line
// shows where it will land. `renderItem` gets the grip to put at the row's end.
// With `dropTargets`, a row can also be dragged onto another list's rows (decks into folders);
// that list passes the same `fx` as `dropFx` so its rows light up, and the one that gets the
// row glows for a moment.
export function ReorderList<T extends { id: string }>({
  items,
  itemHeight,
  renderItem,
  onReorder,
  onDragChange,
  dropTargets,
  dropFx,
  scroll,
}: {
  items: T[]
  itemHeight: number
  renderItem: (item: T, grip: ReactElement) => ReactNode
  onReorder: (ids: string[]) => void
  onDragChange?: (dragging: boolean) => void
  dropTargets?: DropTargets
  dropFx?: DropFx
  scroll?: AutoScroll
}) {
  const slot = itemHeight + GAP
  const key = items.map((item) => item.id).join('\n')
  const drag: Drag = {
    positions: useSharedValue<Positions>(indexById(items.map((item) => item.id))),
    startPositions: useSharedValue<Positions>({}),
    active: useSharedValue<string | null>(null),
    settling: useSharedValue<string | null>(null),
    dropping: useSharedValue(false),
    startIndex: useSharedValue(0),
    dragY: useSharedValue(0),
    tilt: useSharedValue(0),
    lift: useSharedValue(0),
    shrink: useSharedValue(1),
    fade: useSharedValue(1),
    guideY: useSharedValue(0),
    scrollStart: useSharedValue(0),
    scrollAt: useSharedValue(0),
    lastTranslation: useSharedValue(0),
    fingerY: useSharedValue(0),
  }
  const { positions, active, dropping, guideY, scrollAt, fingerY } = drag
  const hover = dropTargets?.fx.hover

  // Follow the list when it changes (a drop, a delete, a new deck); the rows slide to their new
  // places. A row that just went into a drop target has left the list: free the drag.
  useEffect(() => {
    const ids = key ? key.split('\n') : []
    positions.set(indexById(ids))
    const gone = active.get()
    if (gone != null && !ids.includes(gone)) {
      active.set(null)
      dropping.set(false)
    }
  }, [key, positions, active, dropping])

  // The guide line: placed at once on pick-up, glides evenly (no spring) from slot to slot,
  // and on drop stays where it is and only fades out. Hidden while over a drop target.
  const guide = useAnimatedStyle(() => {
    const shown = active.get() != null && !dropping.get() && (hover == null || hover.get() == null)
    return {
      opacity: withTiming(shown ? 1 : 0, { duration: 120 }),
      transform: [{ translateY: guideY.get() }],
    }
  })

  // While a row is held near the top or bottom edge, scroll a little every frame. The row
  // follows along (see the reaction in Row).
  useFrameCallback(() => {
    if (!scroll || active.get() == null || dropping.get()) return
    const y = fingerY.get()
    let speed = 0
    if (y < scroll.top + EDGE) speed = -SCROLL_SPEED * Math.min(1, (scroll.top + EDGE - y) / EDGE)
    else if (y > scroll.bottom - EDGE) speed = SCROLL_SPEED * Math.min(1, (y - scroll.bottom + EDGE) / EDGE)
    if (speed === 0) return
    const next = Math.min(Math.max(scrollAt.get() + speed, 0), Math.max(scroll.max, 0))
    if (next === scrollAt.get()) return
    scrollAt.set(next)
    scrollTo(scroll.ref, 0, next, false)
  })

  // Accessibility: move a row one step with the "Move up" / "Move down" actions.
  const step = (index: number, by: number) => {
    const to = index + by
    if (to < 0 || to >= items.length) return
    const ids = items.map((item) => item.id)
    ;[ids[index], ids[to]] = [ids[to], ids[index]]
    onReorder(ids)
  }

  return (
    <View style={{ height: Math.max(items.length * slot - GAP, 0) }}>
      {items.map((item, index) => (
        <Row
          key={item.id}
          id={item.id}
          index={index}
          count={items.length}
          slot={slot}
          height={itemHeight}
          drag={drag}
          targets={dropTargets}
          fx={dropFx}
          scroll={scroll}
          onDrop={onReorder}
          onDragChange={onDragChange}
          onStep={(by) => step(index, by)}
          render={(grip) => renderItem(item, grip)}
        />
      ))}
      <Animated.View pointerEvents="none" style={[styles.guide, guide]} />
    </View>
  )
}

function Row({
  id,
  index,
  count,
  slot,
  height,
  drag,
  targets,
  fx,
  scroll,
  onDrop,
  onDragChange,
  onStep,
  render,
}: {
  id: string
  index: number
  count: number
  slot: number
  height: number
  drag: Drag
  targets?: DropTargets
  fx?: DropFx
  scroll?: AutoScroll
  onDrop: (ids: string[]) => void
  onDragChange?: (dragging: boolean) => void
  onStep: (by: number) => void
  render: (grip: ReactElement) => ReactNode
}) {
  const { positions, startPositions, active, settling, dropping, startIndex, dragY, tilt, lift, shrink, fade, guideY } = drag
  const { scrollStart, scrollAt, lastTranslation, fingerY } = drag
  const dragChange = (dragging: boolean) => onDragChange?.(dragging)

  const pickUp = (absoluteY: number) => {
    'worklet'
    if (active.get() != null) return
    settling.set(null)
    active.set(id)
    const at = positions.get()[id] ?? index
    startIndex.set(at)
    startPositions.set(positions.get())
    guideY.set(lineY(at, slot))
    dragY.set(0)
    tilt.set(0)
    shrink.set(1)
    fade.set(1)
    const offset = scroll ? scroll.offset.get() : 0
    scrollStart.set(offset)
    scrollAt.set(offset)
    lastTranslation.set(0)
    fingerY.set(absoluteY)
    lift.set(withSpring(1, SETTLE))
    scheduleOnRN(dragChange, true)
  }

  // The drop target under the middle of the dragged row, if any.
  const targetAt = (rowTop: number) => {
    'worklet'
    if (!targets) return null
    const middle = rowTop + height / 2
    for (let i = 0; i < targets.ids.length; i++) {
      const top = targets.top + i * targets.slot
      if (middle >= top && middle <= top + targets.height) return targets.ids[i]
    }
    return null
  }

  // `translationY`: how far the finger moved; scrolling moves the row along with the content.
  const follow = (translationY: number, velocityY: number, absoluteY: number) => {
    'worklet'
    if (active.get() !== id || dropping.get()) return
    lastTranslation.set(translationY)
    fingerY.set(absoluteY)
    const moved = translationY + scrollAt.get() - scrollStart.get()
    const from = startIndex.get()
    // Stays within the list, or goes up as far as the drop targets.
    const top = targets ? Math.min(targets.top, 0) : 0
    const y = Math.min(Math.max(moved, top - from * slot), (count - 1 - from) * slot)
    dragY.set(y)
    tilt.set(withSpring(Math.min(Math.max(velocityY * TILT, -MAX_TILT), MAX_TILT), WOBBLE))

    const over = targetAt(from * slot + y)
    if (targets && targets.fx.hover.get() !== over) {
      targets.fx.hover.set(over)
      shrink.set(withSpring(over == null ? 1 : 0.9, SETTLE))
    }
    if (over != null) {
      // Going into a target: the list goes back to how it was.
      if (positions.get()[id] !== from) {
        positions.set(startPositions.get())
        guideY.set(lineY(from, slot))
      }
      return
    }
    const now = positions.get()
    const to = Math.round(from + Math.max(y, -from * slot) / slot)
    if (to !== now[id]) {
      positions.set(move(now, id, now[id], to))
      guideY.set(withTiming(lineY(to, slot), { duration: 110 }))
    }
  }

  // Into a target: the row flies to its middle and shrinks away while the target stays lit,
  // then the target glows for a moment. The row is gone from this list then (the decks shown are the ones
  // outside folders); if it's somehow still here a moment later, it fades back into its slot.
  const dropInto = (target: string) => {
    'worklet'
    if (!targets) return
    dropping.set(true)
    const from = startIndex.get()
    const i = targets.ids.indexOf(target)
    const middle = targets.top + i * targets.slot + targets.height / 2
    const offset = middle - (from * slot + dragY.get() + height / 2)
    tilt.set(withSpring(0, WOBBLE))
    lift.set(withTiming(0, { duration: INTO }))
    shrink.set(withTiming(0.3, { duration: INTO }))
    dragY.set(withTiming(dragY.get() + offset, { duration: INTO }))
    scheduleOnRN(dragChange, false)
    fade.set(
      withTiming(0, { duration: INTO }, () => {
        const { hover, received, glow } = targets.fx
        hover.set(null)
        received.set(target)
        glow.set(
          withSequence(
            withTiming(1, { duration: GLOW_IN, easing: GLOW_EASING }),
            withTiming(0, { duration: GLOW_OUT, easing: GLOW_EASING }),
          ),
        )
        scheduleOnRN(targets.onDrop, id, target)
        dragY.set(0)
        shrink.set(1)
        fade.set(
          withDelay(
            STAY_GONE,
            withTiming(1, { duration: BACK }, () => {
              // Only if no other row has been picked up since.
              if (active.get() !== id) return
              active.set(null)
              dropping.set(false)
            }),
          ),
        )
      }),
    )
  }

  const drop = () => {
    'worklet'
    if (active.get() !== id || dropping.get()) return
    const over = targets ? targets.fx.hover.get() : null
    if (over != null) {
      dropInto(over)
      return
    }
    const now = positions.get()
    // Both gestures end here; only the first one through drops the row.
    active.set(null)
    // It springs from where it was let go into its slot, and wobbles to rest.
    settling.set(id)
    tilt.set(withSpring(0, WOBBLE))
    lift.set(withSpring(0, SETTLE))
    scheduleOnRN(dragChange, false)
    if (now[id] !== startIndex.get()) {
      scheduleOnRN(onDrop, Object.keys(now).sort((a, b) => now[a] - now[b]))
    }
  }

  // Auto-scroll moved the content under a still finger: move the row with it.
  useAnimatedReaction(
    () => (active.get() === id ? scrollAt.get() : null),
    (now, before) => {
      if (now != null && before != null && now !== before) follow(lastTranslation.get(), 0, fingerY.get())
    },
  )

  const grab = Gesture.Pan()
    .minDistance(0)
    .onStart((e) => pickUp(e.absoluteY))
    .onUpdate((e) => follow(e.translationY, e.velocityY, e.absoluteY))
    .onFinalize(drop)
  const hold = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS)
    .onStart((e) => pickUp(e.absoluteY))
    .onUpdate((e) => follow(e.translationY, e.velocityY, e.absoluteY))
    .onFinalize(drop)

  const style = useAnimatedStyle(() => {
    if (active.get() === id) {
      return {
        zIndex: 10,
        opacity: fade.get(),
        transform: [
          { translateY: startIndex.get() * slot + dragY.get() },
          { scale: (1 + 0.035 * lift.get()) * shrink.get() },
          { rotateZ: `${tilt.get()}deg` },
        ],
      }
    }
    const landing = settling.get() === id
    return {
      zIndex: landing ? 5 : 0,
      opacity: 1,
      transform: [
        { translateY: withSpring((positions.get()[id] ?? index) * slot, SETTLE) },
        { scale: landing ? 1 + 0.035 * lift.get() : 1 },
        { rotateZ: landing ? `${tilt.get()}deg` : '0deg' },
      ],
    }
  })
  // Shadow and gold edge while lifted.
  const lifted = useAnimatedStyle(() => ({ opacity: active.get() === id || settling.get() === id ? lift.get() : 0 }))

  // As a drop target: grows a little and lights up gold while a row is over it (eased, no
  // bounce). When it gets the row, it glows softly for a moment.
  const asTarget = useAnimatedStyle(() => {
    if (!fx) return {}
    const over = fx.hover.get() === id
    return { transform: [{ scale: withTiming(over ? 1.03 : 1, { duration: 160 }) }] }
  })
  const targetGlow = useAnimatedStyle(() => {
    if (!fx) return { opacity: 0 }
    return { opacity: withTiming(fx.hover.get() === id ? 1 : 0, { duration: 160 }) }
  })

  const dropGlow = useAnimatedStyle(() => ({
    opacity: fx != null && fx.received.get() === id ? fx.glow.get() : 0,
  }))

  const grip = (
    <GestureDetector gesture={grab}>
      <View
        style={styles.grip}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Reorder"
        accessibilityActions={[
          { name: 'increment', label: 'Move down' },
          { name: 'decrement', label: 'Move up' },
        ]}
        onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      >
        <SymbolView name={{ ios: 'line.3.horizontal', android: 'drag_indicator' }} size={18} tintColor={Colors.textMuted} />
      </View>
    </GestureDetector>
  )

  return (
    <GestureDetector gesture={hold}>
      <Animated.View style={[styles.row, { height }, style]}>
        <Animated.View style={[styles.fill, asTarget]}>
          <Animated.View pointerEvents="none" style={[styles.shadow, lifted]} />
          {render(grip)}
          <Animated.View pointerEvents="none" style={[styles.edge, lifted]} />
          {fx && <Animated.View pointerEvents="none" style={[styles.glow, targetGlow]} />}
          {fx && <Animated.View pointerEvents="none" style={[styles.dropGlow, dropGlow]} />}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  fill: {
    flex: 1,
  },
  // Where the lifted row will land. Drawn over the rows (the lifted one too) so it stays visible.
  guide: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    height: LINE,
    borderRadius: LINE / 2,
    backgroundColor: Colors.gold,
  },
  shadow: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    boxShadow: '0 14px 30px rgba(0,0,0,0.55)',
  },
  edge: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(232,197,120,0.85)',
  },
  // A drop target that just got a row: a soft gold glow.
  dropGlow: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(232,197,120,0.7)',
    boxShadow: '0 0 14px rgba(212,166,74,0.45)',
  },
  // A drop target with a row over it.
  glow: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.14)',
    boxShadow: '0 0 18px rgba(212,166,74,0.35)',
  },
  grip: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
