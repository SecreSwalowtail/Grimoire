import { useSyncExternalStore } from 'react'

import type { Board } from '@/utils/deck-store'
import { createListeners } from '@/utils/listeners'

// Where scanned cards go, picked on the Scan screen: a binder, decks, or both (decks only with
// none picked: the scan says so and adds nothing). Starts as the first binder only; kept until
// the app restarts. "Create & start scanning" on a new binder points the binder there; on a new
// deck it adds that deck's main deck too.

export type ScanTarget = {
  binder: boolean
  // null: the first binder.
  binderId: string | null
  decks: boolean
  deckIds: string[]
  // The part of the decks the cards go into.
  board: Board
}

let target: ScanTarget = { binder: true, binderId: null, decks: false, deckIds: [], board: 'main' }
const changes = createListeners()

export const getScanTarget = () => target

export function setScanTarget(next: ScanTarget) {
  target = next
  changes.notify()
}

export const useScanTarget = () => useSyncExternalStore(changes.subscribe, getScanTarget)

// A new binder to scan into.
export function setScanBinder(binderId: string) {
  setScanTarget({ ...target, binder: true, binderId })
}

// A new deck to scan into (the binder setting stays as it is).
export function setScanDeck({ deckId, board }: { deckId: string; board: Board }) {
  setScanTarget({ ...target, decks: true, deckIds: [deckId], board })
}

// A binder is gone: scans go back to the first binder if they were going into it.
export function forgetScanBinder(binderId: string) {
  if (target.binderId === binderId) setScanTarget({ ...target, binderId: null })
}
