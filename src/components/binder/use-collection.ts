import { useFocusEffect } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useRef, useState } from 'react'

import { getBinders, type Binder } from '@/db/binders'
import { entryPrice, getCollection, getOwnedPricesDaysAgo, type CollectionEntry } from '@/db/collection'
import { collectionVersion } from '@/db/version'
import { oldPricesVersion, saveOldPrices } from '@/utils/remote-prices'
import { PERIOD_DAYS, useSettings } from '@/utils/settings'

type OldPrice = { price_eur: number | null; price_eur_foil: number | null }

// Everything owned, the binders, and owned cards' prices a week, month or year ago (Settings).
// Reloads when the screen is shown, but only if something changed meanwhile (cards scanned, added
// or edited elsewhere, an owned card's price refreshed, or the period); coming back from a card
// without changes costs nothing.
export function useCollection() {
  const db = useSQLiteContext()
  const days = PERIOD_DAYS[useSettings().priceChangePeriod]
  const [binders, setBinders] = useState<Binder[]>([])
  const [entries, setEntries] = useState<CollectionEntry[]>([])
  const [oldPrices, setOldPrices] = useState<Map<string, OldPrice>>(() => new Map())
  const [loaded, setLoaded] = useState(false)

  // The collection version this screen last loaded (see db/version.ts).
  const loadedVersion = useRef(-1)
  const loadedDays = useRef(0)

  const load = useCallback(async () => {
    const version = collectionVersion()
    const saved = oldPricesVersion()
    const [b, collection, old] = await Promise.all([getBinders(db), getCollection(db), getOwnedPricesDaysAgo(db, days)])
    setBinders(b)
    setEntries((previous) => keepUnchanged(previous, collection))
    setOldPrices(new Map(old.map((p) => [p.card_id, p])))
    setLoaded(true)
    loadedVersion.current = version
    loadedDays.current = days
    // Then the published old prices the phone doesn't have yet; read again if that added some.
    await saveOldPrices(db)
    if (oldPricesVersion() === saved) return
    const again = await getOwnedPricesDaysAgo(db, days)
    setOldPrices(new Map(again.map((p) => [p.card_id, p])))
  }, [db, days])

  useFocusEffect(
    useCallback(() => {
      if (loadedVersion.current === collectionVersion() && loadedDays.current === days) return
      load().catch((e) => console.warn('Failed to load binder', e))
    }, [load, days]),
  )

  // For changes made on this screen (it only reloads by itself when shown again).
  const reload = useCallback(() => {
    load().catch((e) => console.warn('Failed to load binder', e))
  }, [load])

  return { binders, entries, oldPrices, loaded, reload }
}

// Value, card count and change over the period of some entries. Change only counts cards we have a
// price that old for; null until that much history exists.
export function summarize(entries: CollectionEntry[], oldPrices: Map<string, OldPrice>) {
  let value = 0
  let cards = 0
  let change: number | null = null
  for (const e of entries) {
    const now = entryPrice(e)
    value += (now ?? 0) * e.quantity
    cards += e.quantity
    const before = oldPrices.get(e.card_id)
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
