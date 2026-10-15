import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';

import { getBinders, type Binder } from '@/db/binders';
import { entryPrice, getCollection, getOwnedPricesDaysAgo, type CollectionEntry } from '@/db/collection';
import { collectionVersion } from '@/db/version';
import { JS_START, recordOnce, timed } from '@/utils/perf';

type OldPrice = { price_eur: number | null; price_eur_foil: number | null }

// Everything owned, the binders, and owned cards' prices a week ago. Reloads when the screen is
// shown, but only if something changed meanwhile (cards scanned, added or edited elsewhere, or an
// owned card's price refreshed); coming back from a card without changes costs nothing.
export function useCollection() {
  const db = useSQLiteContext()
  const [binders, setBinders] = useState<Binder[]>([])
  const [entries, setEntries] = useState<CollectionEntry[]>([])
  const [weekAgo, setWeekAgo] = useState<Map<string, OldPrice>>(() => new Map())
  const [loaded, setLoaded] = useState(false)

  // The collection version this screen last loaded (see db/version.ts).
  const loadedVersion = useRef(-1)

  const load = useCallback(async () => {
    const version = collectionVersion()
    const [b, collection, old] = await timed(
      'binder: load collection',
      () => Promise.all([getBinders(db), getCollection(db), getOwnedPricesDaysAgo(db, 7)]),
      ([, c]) => `${c.length} entries`,
    )
    setBinders(b)
    setEntries((previous) => keepUnchanged(previous, collection))
    setWeekAgo(new Map(old.map((p) => [p.card_id, p])))
    setLoaded(true)
    loadedVersion.current = version
    recordOnce('startup: binder has its cards', Date.now() - JS_START, 'from JS start')
  }, [db])

  useFocusEffect(
    useCallback(() => {
      if (loadedVersion.current === collectionVersion()) return
      load().catch((e) => console.warn('Failed to load binder', e))
    }, [load]),
  )

  // For changes made on this screen (it only reloads by itself when shown again).
  const reload = useCallback(() => {
    load().catch((e) => console.warn('Failed to load binder', e))
  }, [load])

  return { binders, entries, weekAgo, loaded, reload }
}

// Value, card count and change over the week of some entries. Change only counts cards we have a
// week-old price for; null until a week of history exists.
export function summarize(entries: CollectionEntry[], weekAgo: Map<string, OldPrice>) {
  let value = 0
  let cards = 0
  let change: number | null = null
  for (const e of entries) {
    const now = entryPrice(e)
    value += (now ?? 0) * e.quantity
    cards += e.quantity
    const before = weekAgo.get(e.card_id)
    if (!before || now == null) continue
    const then = entryPrice({ finish: e.finish, ...before })
    if (then == null) continue
    change = (change ?? 0) + (now - then) * e.quantity
  }
  return { value, cards, change }
}

// After a reload, entries that didn't change keep their old object, so their tiles don't
// re-render; if nothing changed at all, the old list is kept as it is.
function keepUnchanged(previous: CollectionEntry[], next: CollectionEntry[]) {
  const old = new Map(previous.map((e) => [e.id, e]))
  let same = previous.length === next.length
  const merged = next.map((entry, i) => {
    const before = old.get(entry.id)
    const keep = before != null && (Object.keys(entry) as (keyof CollectionEntry)[]).every((k) => before[k] === entry[k])
    if (!keep || previous[i] !== before) same = false
    return keep ? before : entry
  })
  return same ? previous : merged
}
