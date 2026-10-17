import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useSyncExternalStore } from 'react'

import { getDeckPricesDaysAgo } from '@/db/decks'
import { euros } from '@/utils/card-prices'
import type { Deck, DeckData } from '@/utils/deck-store'
import { createListeners } from '@/utils/listeners'
import { oldPricesVersion, saveOldPrices } from '@/utils/remote-prices'
import { PERIOD_DAYS, useSettings } from '@/utils/settings'

// What each card in a deck cost a week, month or year ago (Settings; its newest saved price at
// least that old, in euros), for the ▲ / ▼ on decks. Read once per run and period (prices change
// once a day); a card added since shows no change until the next run. Null until it's read.
let oldPrices: Map<string, number | null> | null = null
// The days back being read, or read.
let readDays: number | null = null
const changes = createListeners()

export function useDeckOldPrices() {
  const db = useSQLiteContext()
  const days = PERIOD_DAYS[useSettings().priceChangePeriod]
  useEffect(() => {
    if (readDays === days) return
    readDays = days
    if (oldPrices) {
      oldPrices = null
      changes.notify()
    }
    const read = async () => {
      const rows = await getDeckPricesDaysAgo(db, days)
      if (readDays !== days) return
      oldPrices = new Map(
        rows.map((r) => [r.card_id, euros({ eur: r.price_eur, eurFoil: r.price_eur_foil, usd: r.price_usd, usdFoil: r.price_usd_foil })]),
      )
      changes.notify()
    }
    const saved = oldPricesVersion()
    read()
      // Then the published old prices the phone doesn't have yet; read again if that added some.
      .then(() => saveOldPrices(db))
      .then(() => (oldPricesVersion() !== saved ? read() : undefined))
      .catch((e) => {
        if (readDays === days) readDays = null
        console.warn('Failed to read old deck prices', e)
      })
  }, [db, days])
  return useSyncExternalStore(changes.subscribe, () => oldPrices)
}

// A card's change over the period, for all `quantity` copies: null when either price is unknown.
export function priceChange(now: number | null, cardId: string, quantity: number, old: Map<string, number | null> | null) {
  const then = old?.get(cardId)
  return now == null || then == null ? null : (now - then) * quantity
}

// A deck's change over the period: the cards its value counts (the maybeboard left out) that have
// both prices. Null when none has.
export function deckChange(deck: Deck, data: DeckData, old: Map<string, number | null> | null) {
  if (!old) return null
  let change: number | null = null
  for (const c of data.cards) {
    if (c.deckId !== deck.id || c.board === 'maybe') continue
    const info = data.info[c.cardId]
    const d = priceChange(info ? info.priceEur ?? info.priceEurFoil : null, c.cardId, c.quantity, old)
    if (d != null) change = (change ?? 0) + d
  }
  return change
}
