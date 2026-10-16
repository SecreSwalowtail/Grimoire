import { PRICES_URL } from '@/constants/prices'
import type { PricePoint } from '@/db/collection'

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
  if (!file || !card) return []
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

// The two together, oldest first: the published prices for the days they have, the phone's own
// daily snapshots for the rest (usually today, before the daily update).
export function mergeHistory(saved: PricePoint[], published: PricePoint[]) {
  const byDate = new Map(saved.map((p) => [p.date, p]))
  for (const p of published) byDate.set(p.date, p)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
