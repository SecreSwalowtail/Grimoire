import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import type { GroupBy } from '@/rules/deck-stats';

// How each binder's cards are grouped, saved on the phone per binder. Not grouped until picked.
const forBinder = (binderId: string) => `binder-group:${binderId}`
const VALID: GroupBy[] = ['types', 'mv', 'colors', 'rarity', 'set', 'none']

const listeners = new Set<() => void>()

export function getBinderGroupBy(binderId: string): GroupBy {
  try {
    const v = Storage.getItemSync(forBinder(binderId)) as GroupBy | null
    return v && VALID.includes(v) ? v : 'none'
  } catch {
    return 'none'
  }
}

export function setBinderGroupBy(binderId: string, by: GroupBy) {
  try {
    Storage.setItemSync(forBinder(binderId), by)
  } catch (e) {
    console.warn('Failed to save grouping', e)
  }
  listeners.forEach((l) => l())
}

// The grouping itself is the snapshot (see components/deck/group-prefs.ts).
export function useBinderGroupBy(binderId: string) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => getBinderGroupBy(binderId),
  )
}
