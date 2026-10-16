import { useSyncExternalStore } from 'react'

import { createListeners } from '@/utils/listeners'

// Timings for the performance pass. Each one is kept in memory (the last 100, shown in Settings →
// Developer tools) and logged as "[perf] name: 123 ms", which a release build prints to
// `adb logcat` (filter on "perf"). Cheap enough to leave in.

type Timing = { name: string; ms: number; detail?: string; at: number }

// When the JavaScript bundle started running. Native start-up before that isn't counted.
export const JS_START = Date.now()

let timings: Timing[] = []
const timingChanges = createListeners()

export function record(name: string, ms: number, detail?: string) {
  timings = [{ name, ms: Math.round(ms), detail, at: Date.now() }, ...timings].slice(0, 100)
  console.log(`[perf] ${name}: ${Math.round(ms)} ms${detail ? ` (${detail})` : ''}`)
  timingChanges.notify()
}

// Times an async step: `await timed('binder load', () => getCollection(db))`.
export async function timed<T>(name: string, run: () => Promise<T>, detail?: (result: T) => string) {
  const start = Date.now()
  const result = await run()
  record(name, Date.now() - start, detail?.(result))
  return result
}

// Records something once per app run (e.g. the first time the Binder shows its cards).
const once = new Set<string>()
export function recordOnce(name: string, ms: number, detail?: string) {
  if (once.has(name)) return
  once.add(name)
  record(name, ms, detail)
}

export function clearTimings() {
  timings = []
  timingChanges.notify()
}

export const useTimings = () => useSyncExternalStore(timingChanges.subscribe, () => timings)

// The frame-rate meter (components/dev/fps-meter.tsx), switched on in Developer tools.
let fpsMeter = false
const meterChanges = createListeners()

export function setFpsMeter(on: boolean) {
  fpsMeter = on
  meterChanges.notify()
}

export const useFpsMeter = () => useSyncExternalStore(meterChanges.subscribe, () => fpsMeter)
