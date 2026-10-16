import Storage from 'expo-sqlite/kv-store'
import { useSyncExternalStore } from 'react'

import type { GroupBy } from '@/rules/deck-stats'
import { createListeners } from '@/utils/listeners'

// How cards are grouped, saved on the phone. A deck uses its own choice, else the choice made for
// every deck ("Group all"), else Types. A binder uses its own choice, else no grouping.
const ALL_DECKS = 'deck-group:all'
const forDeck = (deckId: string) => `deck-group:${deckId}`
const forBinder = (binderId: string) => `binder-group:${binderId}`
const VALID: GroupBy[] = ['types', 'mv', 'colors', 'rarity', 'set', 'none']

const changes = createListeners()

function read(key: string) {
  try {
    const v = Storage.getItemSync(key) as GroupBy | null
    return v && VALID.includes(v) ? v : null
  } catch {
    return null
  }
}

function save(write: () => void) {
  try {
    write()
  } catch (e) {
    console.warn('Failed to save grouping', e)
  }
  changes.notify()
}

// The grouping itself is the snapshot: reading it after the hook would be cached by the React
// Compiler (same deck, same result), and the screen would keep showing the old grouping.
export function useGroupBy(deckId: string) {
  return useSyncExternalStore(changes.subscribe, () => read(forDeck(deckId)) ?? read(ALL_DECKS) ?? 'types')
}

export function setGroupBy(deckId: string, by: GroupBy, everyDeck: boolean) {
  save(() => {
    if (!everyDeck) return Storage.setItemSync(forDeck(deckId), by)
    Storage.setItemSync(ALL_DECKS, by)
    // Every deck follows it from now on, this one included.
    for (const key of Storage.getAllKeysSync()) if (key.startsWith('deck-group:') && key !== ALL_DECKS) Storage.removeItemSync(key)
  })
}

export function useBinderGroupBy(binderId: string) {
  return useSyncExternalStore(changes.subscribe, () => read(forBinder(binderId)) ?? 'none')
}

export function setBinderGroupBy(binderId: string, by: GroupBy) {
  save(() => Storage.setItemSync(forBinder(binderId), by))
}
