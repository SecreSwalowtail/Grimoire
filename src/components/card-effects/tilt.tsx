import { createContext, useContext } from 'react'
import { Platform } from 'react-native'
import {
  makeMutable,
  SensorType,
  useAnimatedSensor,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'

// Phone tilt shared by every card on a screen: x/y in -1..1, 0 = how you're currently holding it.
export type Tilt = { x: SharedValue<number>; y: SharedValue<number> }

// Never changes. Used when no TiltSensor is running (reduced motion, other screens), and by
// off-screen cards: animated styles bound to it never re-run, so those cards cost nothing.
export const FLAT: Tilt = { x: makeMutable(0), y: makeMutable(0) }
export const TiltContext = createContext<Tilt>(FLAT)
export const useTilt = () => useContext(TiltContext)

// iOS and Android report gravity with opposite signs. Flip these if the cards tilt the wrong way.
const SIGN_X = Platform.OS === 'ios' ? -1 : 1
const SIGN_Y = Platform.OS === 'ios' ? -1 : 1
const FULL_TILT = 3 // m/s² of gravity change for full tilt (about 18°)
const RECENTER = 0.015 // how fast "neutral" follows the way you hold the phone (per frame)
const SMOOTHING = 0.25 // output smoothing, removes sensor jitter
// Smallest change worth writing (≈0.03° of card tilt). Without it the smoothed value creeps
// toward its target forever, and every card would re-render its transform on every frame.
const EPSILON = 0.003

// A tilt value kept within -1..1.
export const clamp = (v: number) => {
  'worklet'
  return Math.max(-1, Math.min(1, v))
}

// Reads the gravity sensor and writes the tilt into `tilt`, all on the UI thread.
// Neutral slowly follows the phone, so cards react to movement and settle when you hold still.
// Mount it only while the screen is visible: the sensor costs battery.
export function TiltSensor({ tilt }: { tilt: Tilt }) {
  const sensor = useAnimatedSensor(SensorType.GRAVITY)
  const baseX = useSharedValue<number | null>(null)
  const baseY = useSharedValue<number | null>(null)

  useFrameCallback(() => {
    const g = sensor.sensor.get()
    const gx = g.x * SIGN_X
    const gy = g.y * SIGN_Y
    const bx = baseX.get() ?? gx
    const by = baseY.get() ?? gy
    baseX.set(bx + (gx - bx) * RECENTER)
    baseY.set(by + (gy - by) * RECENTER)
    // Only write when the change is visible: a still phone then costs the cards nothing.
    const x = tilt.x.get()
    const y = tilt.y.get()
    const dx = (clamp((gx - bx) / FULL_TILT) - x) * SMOOTHING
    const dy = (clamp((gy - by) / FULL_TILT) - y) * SMOOTHING
    if (Math.abs(dx) > EPSILON) tilt.x.set(x + dx)
    if (Math.abs(dy) > EPSILON) tilt.y.set(y + dy)
  })

  return null
}
