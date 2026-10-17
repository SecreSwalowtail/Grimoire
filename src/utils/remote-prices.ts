import type { SQLiteDatabase } from 'expo-sqlite'
import Storage from 'expo-sqlite/kv-store'

import { PRICES_URL } from '@/constants/prices'
import { addOldPrices, getTrackedCardIds } from '@/db/cards'
import type { PricePoint } from '@/db/collection'
import { PERIOD_DAYS } from '@/utils/settings'

// Past prices for Card detail, from the daily price files at PRICES_URL: one small file per first
// three characters of the Scryfall id, a few dozen cards each.

// Cardmarket EUR / TCGplayer USD, non-foil and foil, in cents; item i is the price `start` + i days.
type Series = 'e' | 'ef' | 'u' | 'uf'
type PriceFile = { start: string; cards: Record<string, Partial<Record<Series, (number | null)[]>>> }

// Each file once per session (cards next to each other share it). A failed download is asked again.
const files = new Map<string, Promise<PriceFile | null>>()

function priceFile(name: string) {
  let file = files.get(name)
  if (!file) {
    file = fetch(`${PRICES_URL}/prices/v1/${name}.json`)
      // No file: none of its cards has a price.
      .then((res) => (res.ok ? (res.json() as Promise<PriceFile>) : null))
      .catch((e) => {
        files.delete(name)
        throw e
      })
    files.set(name, file)
  }
  return file
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// The published prices of one printing, oldest first, days without any left out. Empty when
// there's no price source set up (PRICES_URL) or nothing for this card.
export async function getRemotePrices(cardId: string): Promise<PricePoint[]> {
  if (!PRICES_URL) return []
  const file = await priceFile(cardId.slice(0, 3))
  const card = file?.cards[cardId]
  return file && card ? pointsOf(file, card) : []
}

function pointsOf(file: PriceFile, card: PriceFile['cards'][string]) {
  const at = (series: Series, i: number) => {
    const cents = card[series]?.[i]
    return cents == null ? null : cents / 100
  }
  const length = Math.max(0, ...Object.values(card).map((list) => list?.length ?? 0))
  const points: PricePoint[] = []
  for (let i = 0; i < length; i++) {
    const point = { date: addDays(file.start, i), price_eur: at('e', i), price_eur_foil: at('ef', i), price_usd: at('u', i), price_usd_foil: at('uf', i) }
    if (point.price_eur != null || point.price_eur_foil != null || point.price_usd != null || point.price_usd_foil != null) points.push(point)
  }
  return points
}

const today = () => new Date().toISOString().slice(0, 10)

// The cards whose old prices were saved today (owned and deck cards), kept on the phone.
const SAVED_KEY = 'old-prices-saved'

function savedToday(day: string) {
  try {
    const saved = JSON.parse(Storage.getItemSync(SAVED_KEY) ?? 'null') as { date: string; ids: string[] } | null
    return new Set(saved?.date === day ? saved.ids : [])
  } catch {
    return new Set<string>()
  }
}

// Goes up each time saveOldPrices() saves some: whoever read old prices before reads them again.
let saves = 0
export const oldPricesVersion = () => saves

let running: Promise<void> | null = null

// Owned and deck cards' published prices a week, month and year ago, saved with the phone's own
// snapshots: the ▲ / ▼ then show from the day a card is added, not once the phone has saved that
// far back. Each card once a day; callers at the same time share one run.
export function saveOldPrices(db: SQLiteDatabase) {
  running ??= save(db)
    .catch((e) => console.warn('Failed to save old prices', e))
    .finally(() => {
      running = null
    })
  return running
}

async function save(db: SQLiteDatabase) {
  if (!PRICES_URL) return
  const day = today()
  const done = savedToday(day)
  const byFile = new Map<string, string[]>()
  for (const id of await getTrackedCardIds(db)) {
    if (done.has(id)) continue
    const name = id.slice(0, 3)
    byFile.set(name, [...(byFile.get(name) ?? []), id])
  }
  if (byFile.size === 0) return
  const targets = [...new Set(Object.values(PERIOD_DAYS))].map((days) => addDays(day, -days))
  const rows: (PricePoint & { card_id: string })[] = []
  const names = [...byFile.keys()]
  // A few files at a time.
  for (let i = 0; i < names.length; i += 8) {
    await Promise.all(
      names.slice(i, i + 8).map(async (name) => {
        let file: PriceFile | null
        try {
          file = await priceFile(name)
        } catch {
          return // Tried again next time.
        }
        for (const id of byFile.get(name)!) {
          done.add(id)
          const card = file?.cards[id]
          if (!file || !card) continue
          const points = pointsOf(file, card)
          for (const target of targets) {
            // The newest price at least that old.
            let j = points.length - 1
            while (j >= 0 && points[j].date > target) j--
            if (j >= 0) rows.push({ card_id: id, ...points[j] })
          }
        }
      }),
    )
  }
  if (rows.length > 0) {
    await addOldPrices(db, rows)
    saves += 1
  }
  Storage.setItemSync(SAVED_KEY, JSON.stringify({ date: day, ids: [...done] }))
}

// The two together, oldest first: the published prices for the days they have, the phone's own
// daily snapshots for the rest (usually today, before the daily update).
export function mergeHistory(saved: PricePoint[], published: PricePoint[]) {
  const byDate = new Map(saved.map((p) => [p.date, p]))
  for (const p of published) byDate.set(p.date, p)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
