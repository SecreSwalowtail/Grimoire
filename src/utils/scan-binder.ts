import { useSyncExternalStore } from 'react'

import type { Board } from '@/utils/deck-store'

// Where scanned cards go. Always into a binder: the first one unless "Create & start scanning" on
// a new binder pointed it there (until the app restarts, or that binder is removed or merged).
// After "Create & start scanning" on a new deck they also go into that deck, in the part picked
// (until the Scan screen's "stop" button or a restart).
let target: string | null = null

export const getScanBinder = () => target

export function setScanBinder(binderId: string) {
  target = binderId
}

// A binder is gone: scans go back to the first binder if they were going into it.
export function forgetScanBinder(binderId: string) {
  if (target === binderId) target = null
}

export type ScanDeck = { deckId: string; board: Board }

let deck: ScanDeck | null = null
const listeners = new Set<() => void>()

export const getScanDeck = () => deck

export function setScanDeck(next: ScanDeck | null) {
  deck = next
  listeners.forEach((l) => l())
}

// The deck scans go into, for the Scan screen to show.
export function useScanDeck() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getScanDeck,
  )
}
