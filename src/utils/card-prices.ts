import { PRICES_URL } from '@/constants/prices'
import type { Finish, PricePoint } from '@/db/collection'
import type { ScryfallCard } from '@/db/scryfall'
import type { Money } from '@/utils/money'

// Prices for Card detail. Scryfall passes on Cardmarket's price in EUR and TCGplayer's market price
// in USD, once a day. History: the published daily prices (remote-prices.ts), plus the days the
// app saved a snapshot itself.

export type PriceSource = 'cardmarket' | 'tcgplayer'

const num = (value: string | null | undefined) => (value == null ? null : Number(value))

export function priceOf(card: ScryfallCard, finish: Finish, source: PriceSource) {
  const p = card.prices
  if (source === 'cardmarket') return num(finish === 'nonfoil' ? p.eur : p.eur_foil)
  if (finish === 'etched') return num(p.usd_etched ?? p.usd_foil)
  return num(finish === 'nonfoil' ? p.usd : p.usd_foil)
}

// The first finish the card exists in that has a price: non-foil, else foil, else etched.
export function mainFinish(card: ScryfallCard): Finish {
  const finishes = (card.finishes ?? ['nonfoil']) as Finish[]
  return finishes.find((f) => priceOf(card, f, 'cardmarket') != null) ?? finishes[0] ?? 'nonfoil'
}

// A price from one of the markets (euros or dollars), in the user's currency.
export const formatPrice = (value: number, source: PriceSource, money: Money) =>
  source === 'cardmarket' ? money.eur(value) : money.usd(value)

export function pointValue(point: PricePoint, finish: Finish, source: PriceSource) {
  if (source === 'cardmarket') return finish === 'nonfoil' ? point.price_eur : point.price_eur_foil
  return finish === 'nonfoil' ? point.price_usd : point.price_usd_foil
}

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (date: string) => Math.round((Date.now() - new Date(`${date}T00:00:00`).getTime()) / DAY)

// Saved prices from the last `days` days (all of them for null), oldest first, without gaps.
export function pricesWithin(history: PricePoint[], days: number | null, finish: Finish, source: PriceSource) {
  return history
    .filter((p) => days == null || daysAgo(p.date) <= days)
    .map((p) => ({ date: p.date, value: pointValue(p, finish, source) }))
    .filter((p): p is { date: string; value: number } => p.value != null)
}

// Change from the oldest saved price in the last `days` days to the newest. Null until there are
// two days to compare. `days` in the result is how far back the comparison actually goes.
export function priceChange(history: PricePoint[], days: number, finish: Finish, source: PriceSource) {
  const points = pricesWithin(history, days, finish, source)
  if (points.length < 2) return null
  const first = points[0]
  const last = points[points.length - 1]
  const span = daysAgo(first.date) - daysAgo(last.date)
  if (span < 1 || first.value === 0) return null
  return { diff: last.value - first.value, percent: ((last.value - first.value) / first.value) * 100, days: span }
}

// Whether Card detail shows prices over time (chart, changes): once the daily price files are set
// up (PRICES_URL). Without them there would only be the days the phone saved itself.
export const SHOW_HISTORY = PRICES_URL !== ''
