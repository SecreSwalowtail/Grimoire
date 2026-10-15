import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import type { GroupBy } from '@/rules/deck-stats';

// How each deck's cards are grouped, saved on the phone: a deck's own choice, or the choice made
// for every deck ("Group all"), or Types.
const ALL = 'deck-group:all'
const forDeck = (deckId: string) => `deck-group:${deckId}`
const VALID: GroupBy[] = ['types', 'mv', 'colors', 'rarity', 'set', 'none']

const read = (key: string) => {
  try {
    const v = Storage.getItemSync(key) as GroupBy | null
    return v && VALID.includes(v) ? v : null
  } catch {
    return null
  }
}

let version = 0
const listeners = new Set<() => void>()

export function getGroupBy(deckId: string): GroupBy {
  return read(forDeck(deckId)) ?? read(ALL) ?? 'types'
}

export function setGroupBy(deckId: string, by: GroupBy, everyDeck: boolean) {
  try {
    if (everyDeck) {
      Storage.setItemSync(ALL, by)
      // Every deck follows it from now on, this one included.
      for (const key of Storage.getAllKeysSync()) if (key.startsWith('deck-group:') && key !== ALL) Storage.removeItemSync(key)
    } else {
      Storage.setItemSync(forDeck(deckId), by)
    }
  } catch (e) {
    console.warn('Failed to save grouping', e)
  }
  version += 1
  listeners.forEach((l) => l())
}

export function useGroupBy(deckId: string) {
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  return getGroupBy(deckId)
}
