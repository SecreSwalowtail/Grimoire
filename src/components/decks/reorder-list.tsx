import { SymbolView } from 'expo-symbols';
import { useEffect, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Colors } from '@/constants/theme';

const GAP = 6
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

type Drag = {
  positions: SharedValue<Positions>
  active: SharedValue<string | null>
  // The row just dropped, still springing into its slot.
  settling: SharedValue<string | null>
  startIndex: SharedValue<number>
  dragY: SharedValue<number>
  tilt: SharedValue<number>
  lift: SharedValue<number>
  // Where the guide line is drawn.
  guideY: SharedValue<number>
}

// The guide line sits in the gap above the slot the row will land in.
const lineY = (at: number, slot: number) => {
  'worklet'
  return at * slot - GAP / 2 - LINE / 2
}

// A list of same-height rows you can drag to reorder: by the grip, or by holding a row.
// The lifted row sways with the drag speed, the others slide out of its way, and a gold line
// shows where it will land. `renderItem` gets the grip to put at the row's end.
export function ReorderList<T extends { id: string }>({
  items,
  itemHeight,
  renderItem,
  onReorder,
  onDragChange,
}: {
  items: T[]
  itemHeight: number
  renderItem: (item: T, grip: ReactElement) => ReactNode
  onReorder: (ids: string[]) => void
  onDragChange?: (dragging: boolean) => void
}) {
  const slot = itemHeight + GAP
  const key = items.map((item) => item.id).join('\n')
  const drag: Drag = {
    positions: useSharedValue<Positions>(indexById(items.map((item) => item.id))),
    active: useSharedValue<string | null>(null),
    settling: useSharedValue<string | null>(null),
    startIndex: useSharedValue(0),
    dragY: useSharedValue(0),
    tilt: useSharedValue(0),
    lift: useSharedValue(0),
    guideY: useSharedValue(0),
  }
  const { positions, active, guideY } = drag

  // Follow the list when it changes (a drop, a delete, a new deck).
  useEffect(() => {
    positions.set(indexById(key ? key.split('\n') : []))
  }, [key, positions])

  // The guide line: placed at once on pick-up, glides evenly (no spring) from slot to slot,
  // and on drop stays where it is and only fades out.
  const guide = useAnimatedStyle(() => ({
    opacity: withTiming(active.get() != null ? 1 : 0, { duration: 120 }),
    transform: [{ translateY: guideY.get() }],
  }))

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
  onDrop: (ids: string[]) => void
  onDragChange?: (dragging: boolean) => void
  onStep: (by: number) => void
  render: (grip: ReactElement) => ReactNode
}) {
  const { positions, active, settling, startIndex, dragY, tilt, lift, guideY } = drag
  const dragChange = (dragging: boolean) => onDragChange?.(dragging)

  const pickUp = () => {
    'worklet'
    if (active.get() != null) return
    settling.set(null)
    active.set(id)
    const at = positions.get()[id] ?? index
    startIndex.set(at)
    guideY.set(lineY(at, slot))
    dragY.set(0)
    tilt.set(0)
    lift.set(withSpring(1, SETTLE))
    scheduleOnRN(dragChange, true)
  }

  const follow = (translationY: number, velocityY: number) => {
    'worklet'
    if (active.get() !== id) return
    const from = startIndex.get()
    // Stays within the list.
    const y = Math.min(Math.max(translationY, -from * slot), (count - 1 - from) * slot)
    dragY.set(y)
    tilt.set(withSpring(Math.min(Math.max(velocityY * TILT, -MAX_TILT), MAX_TILT), WOBBLE))
    const now = positions.get()
    const to = Math.round(from + y / slot)
    if (to !== now[id]) {
      positions.set(move(now, id, now[id], to))
      guideY.set(withTiming(lineY(to, slot), { duration: 110 }))
    }
  }

  const drop = () => {
    'worklet'
    if (active.get() !== id) return
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

  const grab = Gesture.Pan()
    .minDistance(0)
    .onStart(pickUp)
    .onUpdate((e) => follow(e.translationY, e.velocityY))
    .onFinalize(drop)
  const hold = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS)
    .onStart(pickUp)
    .onUpdate((e) => follow(e.translationY, e.velocityY))
    .onFinalize(drop)

  const style = useAnimatedStyle(() => {
    if (active.get() === id) {
      return {
        zIndex: 10,
        transform: [
          { translateY: startIndex.get() * slot + dragY.get() },
          { scale: 1 + 0.035 * lift.get() },
          { rotateZ: `${tilt.get()}deg` },
        ],
      }
    }
    const landing = settling.get() === id
    return {
      zIndex: landing ? 5 : 0,
      transform: [
        { translateY: withSpring((positions.get()[id] ?? index) * slot, SETTLE) },
        { scale: landing ? 1 + 0.035 * lift.get() : 1 },
        { rotateZ: landing ? `${tilt.get()}deg` : '0deg' },
      ],
    }
  })
  // Shadow and gold edge while lifted.
  const lifted = useAnimatedStyle(() => ({ opacity: active.get() === id || settling.get() === id ? lift.get() : 0 }))

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
        <Animated.View pointerEvents="none" style={[styles.shadow, lifted]} />
        {render(grip)}
        <Animated.View pointerEvents="none" style={[styles.edge, lifted]} />
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
  grip: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
