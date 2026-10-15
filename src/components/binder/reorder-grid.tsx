import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// Like the Decks reorder list (components/decks/reorder-list.tsx), with a gentler sway: these
// items are big.
const SETTLE = { damping: 20, stiffness: 240 }
const WOBBLE = { damping: 14, stiffness: 200 }
const TILT = 0.0008
const MAX_TILT = 1.2
const LONG_PRESS = 280
// Over this middle share of another cell (each way from its center), the dragged item merges
// into it instead of taking its place.
const MERGE_ZONE = 0.35
// Held this long over a new place (and not over a cell's middle), the item moves there. Without
// the wait, passing an item's edge on the way to its middle would push it away.
const DWELL = 300

type Positions = Record<string, number>

const indexById = (ids: string[]) => Object.fromEntries(ids.map((id, i) => [id, i])) as Positions

// Moves `id` from slot `from` to `to`, shifting the items in between by one.
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

type Layout = { columns: number; width: number; height: number; columnGap: number; rowGap: number }

const slotX = (slot: number, l: Layout) => {
  'worklet'
  return (slot % l.columns) * (l.width + l.columnGap)
}
const slotY = (slot: number, l: Layout) => {
  'worklet'
  return Math.floor(slot / l.columns) * (l.height + l.rowGap)
}

type Drag = {
  positions: SharedValue<Positions>
  startPositions: SharedValue<Positions>
  active: SharedValue<string | null>
  settling: SharedValue<string | null>
  startSlot: SharedValue<number>
  dx: SharedValue<number>
  dy: SharedValue<number>
  tilt: SharedValue<number>
  lift: SharedValue<number>
  // The item the dragged one is over the middle of (it merges into it when let go).
  over: SharedValue<string | null>
  // The place it's held over, waiting out DWELL before the others make room (-1: none), and the
  // frame time the wait started (-1: from the next frame).
  pendingSlot: SharedValue<number>
  pendingSince: SharedValue<number>
}

// Where the merge glow is drawn in a cell, e.g. around just the picture of the item.
export type GlowRect = { left: number; top: number; width: number; height: number; radius: number }

// A grid of same-size cells you can reorder by holding one and dragging it: it lifts and sways
// with the drag speed while the others slide out of its way. Let go over the middle of another
// cell to merge into it (`onMerge`), anywhere else to move it there (`onReorder`).
// `onHold` fires as soon as a cell is held (the Binder screen enters edit mode then). The gold
// glow on a merge target covers `glow` (the whole cell without it).
export function ReorderGrid<T extends { id: string }>({
  items,
  columns,
  cellWidth,
  cellHeight,
  columnGap,
  rowGap,
  renderItem,
  onReorder,
  onMerge,
  onHold,
  onDragChange,
  glow,
}: {
  items: T[]
  columns: number
  cellWidth: number
  cellHeight: number
  columnGap: number
  rowGap: number
  renderItem: (item: T) => ReactNode
  onReorder: (ids: string[]) => void
  onMerge: (id: string, intoId: string) => void
  onHold: (id: string) => void
  onDragChange?: (dragging: boolean) => void
  glow?: GlowRect
}) {
  const layout: Layout = { columns, width: cellWidth, height: cellHeight, columnGap, rowGap }
  const key = items.map((item) => item.id).join('\n')
  const drag: Drag = {
    positions: useSharedValue<Positions>(indexById(items.map((item) => item.id))),
    startPositions: useSharedValue<Positions>({}),
    active: useSharedValue<string | null>(null),
    settling: useSharedValue<string | null>(null),
    startSlot: useSharedValue(0),
    dx: useSharedValue(0),
    dy: useSharedValue(0),
    tilt: useSharedValue(0),
    lift: useSharedValue(0),
    over: useSharedValue<string | null>(null),
    pendingSlot: useSharedValue(-1),
    pendingSince: useSharedValue(0),
  }
  const { positions, active, pendingSlot, pendingSince } = drag

  // Moves the held item once it has stayed over a new place long enough.
  useFrameCallback(({ timestamp }) => {
    const id = active.get()
    const slot = pendingSlot.get()
    if (id == null || slot < 0) return
    if (pendingSince.get() < 0) pendingSince.set(timestamp)
    if (timestamp - pendingSince.get() < DWELL) return
    pendingSlot.set(-1)
    const now = positions.get()
    if (now[id] !== slot) positions.set(move(now, id, now[id], slot))
  })

  // Follow the list when it changes (a reorder saved, a binder added, merged or removed).
  useEffect(() => {
    positions.set(indexById(key ? key.split('\n') : []))
  }, [key, positions])

  const rows = Math.ceil(items.length / columns)
  return (
    <View style={{ height: Math.max(rows * cellHeight + (rows - 1) * rowGap, 0) }}>
      {items.map((item, index) => (
        <Cell
          key={item.id}
          id={item.id}
          index={index}
          count={items.length}
          layout={layout}
          drag={drag}
          onReorder={onReorder}
          onMerge={onMerge}
          onHold={onHold}
          onDragChange={onDragChange}
          glow={glow}
        >
          {renderItem(item)}
        </Cell>
      ))}
    </View>
  )
}

function Cell({
  id,
  index,
  count,
  layout,
  drag,
  onReorder,
  onMerge,
  onHold,
  onDragChange,
  glow: glowRect,
  children,
}: {
  id: string
  index: number
  count: number
  layout: Layout
  drag: Drag
  onReorder: (ids: string[]) => void
  onMerge: (id: string, intoId: string) => void
  onHold: (id: string) => void
  onDragChange?: (dragging: boolean) => void
  glow?: GlowRect
  children: ReactNode
}) {
  const { positions, startPositions, active, settling, startSlot, dx, dy, tilt, lift, over, pendingSlot, pendingSince } = drag
  const dragChange = (dragging: boolean) => onDragChange?.(dragging)

  const pickUp = () => {
    'worklet'
    if (active.get() != null) return
    settling.set(null)
    active.set(id)
    const at = positions.get()[id] ?? index
    startSlot.set(at)
    startPositions.set(positions.get())
    dx.set(0)
    dy.set(0)
    tilt.set(0)
    over.set(null)
    pendingSlot.set(-1)
    lift.set(withSpring(1, SETTLE))
    scheduleOnRN(onHold, id)
    scheduleOnRN(dragChange, true)
  }

  const follow = (tx: number, ty: number, vx: number) => {
    'worklet'
    if (active.get() !== id) return
    const from = startSlot.get()
    const x = slotX(from, layout) + tx
    const y = slotY(from, layout) + ty
    dx.set(tx)
    dy.set(ty)
    tilt.set(withSpring(Math.min(Math.max(vx * TILT, -MAX_TILT), MAX_TILT), WOBBLE))

    // The cell under the dragged item's middle.
    const cx = x + layout.width / 2
    const cy = y + layout.height / 2
    const col = Math.min(Math.max(Math.floor(cx / (layout.width + layout.columnGap)), 0), layout.columns - 1)
    const rows = Math.ceil(count / layout.columns)
    const row = Math.min(Math.max(Math.floor(cy / (layout.height + layout.rowGap)), 0), rows - 1)
    const slot = Math.min(row * layout.columns + col, count - 1)

    const now = positions.get()
    let under: string | null = null
    for (const key in now) if (now[key] === slot && key !== id) under = key
    const inMiddle =
      under != null &&
      Math.abs(cx - (slotX(slot, layout) + layout.width / 2)) < layout.width * MERGE_ZONE &&
      Math.abs(cy - (slotY(slot, layout) + layout.height / 2)) < layout.height * MERGE_ZONE
    if (inMiddle) {
      if (over.get() !== under) over.set(under)
      pendingSlot.set(-1)
      return
    }
    if (over.get() != null) over.set(null)
    if (slot === now[id]) pendingSlot.set(-1)
    else if (pendingSlot.get() !== slot) {
      pendingSlot.set(slot)
      pendingSince.set(-1)
    }
  }

  const drop = () => {
    'worklet'
    if (active.get() !== id) return
    const target = over.get()
    pendingSlot.set(-1)
    active.set(null)
    settling.set(id)
    over.set(null)
    tilt.set(withSpring(0, WOBBLE))
    lift.set(withSpring(0, SETTLE))
    scheduleOnRN(dragChange, false)
    if (target != null) {
      // Merging asks first, so the item goes back to where it was meanwhile.
      positions.set(startPositions.get())
      scheduleOnRN(onMerge, id, target)
      return
    }
    const now = positions.get()
    if (now[id] !== startSlot.get()) scheduleOnRN(onReorder, Object.keys(now).sort((a, b) => now[a] - now[b]))
  }

  const hold = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS)
    .onStart(pickUp)
    .onUpdate((e) => follow(e.translationX, e.translationY, e.velocityX))
    .onFinalize(drop)

  const style = useAnimatedStyle(() => {
    if (active.get() === id) {
      const from = startSlot.get()
      return {
        zIndex: 10,
        transform: [
          { translateX: slotX(from, layout) + dx.get() },
          { translateY: slotY(from, layout) + dy.get() },
          { scale: (1 + 0.04 * lift.get()) * (over.get() != null ? 0.9 : 1) },
          { rotateZ: `${tilt.get()}deg` },
        ],
      }
    }
    const slot = positions.get()[id] ?? index
    const landing = settling.get() === id
    return {
      zIndex: landing ? 5 : 0,
      transform: [
        { translateX: withSpring(slotX(slot, layout), SETTLE) },
        { translateY: withSpring(slotY(slot, layout), SETTLE) },
        // The one about to get merged into grows a little.
        { scale: withTiming(over.get() === id ? 1.05 : landing ? 1 + 0.04 * lift.get() : 1, { duration: 160 }) },
        { rotateZ: landing ? `${tilt.get()}deg` : '0deg' },
      ],
    }
  })
  // Gold glow on the cell the dragged one would merge into.
  const glow = useAnimatedStyle(() => ({ opacity: withTiming(over.get() === id ? 1 : 0, { duration: 160 }) }))

  return (
    <GestureDetector gesture={hold}>
      <Animated.View style={[styles.cell, { width: layout.width, height: layout.height }, style]}>
        {children}
        <Animated.View pointerEvents="none" style={[styles.glow, glowRect && { ...glowRect, borderRadius: glowRect.radius }, glow]} />
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  cell: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  glow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#D4A64A',
    backgroundColor: 'rgba(212,166,74,0.12)',
    boxShadow: '0 0 18px rgba(212,166,74,0.35)',
  },
})
