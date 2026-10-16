import { getLocales } from 'expo-localization'
import Storage from 'expo-sqlite/kv-store'
import { useSyncExternalStore } from 'react'

import { createListeners } from '@/utils/listeners'
import { getSettings, subscribeSettings } from '@/utils/settings'

// Prices in the user's currency. Card prices arrive in euros (Cardmarket) and dollars (TCGplayer);
// they're converted with the European Central Bank's daily rates (frankfurter.dev, free, no key),
// fetched once a day and kept on the phone. Until there are rates, prices show as they came.

// The currencies the ECB publishes rates for, plus the euro.
export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'EUR', name: 'Euro' },
  { code: 'USD', name: 'US dollar' },
  { code: 'GBP', name: 'British pound' },
  { code: 'RON', name: 'Romanian leu' },
  { code: 'PLN', name: 'Polish złoty' },
  { code: 'HUF', name: 'Hungarian forint' },
  { code: 'CZK', name: 'Czech koruna' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'SEK', name: 'Swedish krona' },
  { code: 'NOK', name: 'Norwegian krone' },
  { code: 'DKK', name: 'Danish krone' },
  { code: 'ISK', name: 'Icelandic króna' },
  { code: 'TRY', name: 'Turkish lira' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'KRW', name: 'South Korean won' },
  { code: 'HKD', name: 'Hong Kong dollar' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'IDR', name: 'Indonesian rupiah' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'PHP', name: 'Philippine peso' },
  { code: 'THB', name: 'Thai baht' },
  { code: 'ILS', name: 'Israeli shekel' },
  { code: 'BRL', name: 'Brazilian real' },
  { code: 'MXN', name: 'Mexican peso' },
  { code: 'ZAR', name: 'South African rand' },
]

// The phone's language -> its currency; anything else (English included) is the euro.
const BY_LANGUAGE: Record<string, string> = {
  ro: 'RON', pl: 'PLN', hu: 'HUF', cs: 'CZK', sv: 'SEK', da: 'DKK', nb: 'NOK', nn: 'NOK', no: 'NOK',
  is: 'ISK', tr: 'TRY', ja: 'JPY', zh: 'CNY', ko: 'KRW', id: 'IDR', ms: 'MYR', fil: 'PHP', tl: 'PHP',
  th: 'THB', he: 'ILS', iw: 'ILS', hi: 'INR',
}

export function phoneCurrency() {
  try {
    return BY_LANGUAGE[getLocales()[0]?.languageCode ?? ''] ?? 'EUR'
  } catch {
    return 'EUR'
  }
}

export const currencyName = (code: string) => CURRENCIES.find((c) => c.code === code)?.name ?? code

// Number formatting in the way the currency's home country writes it ("1.284,60 lei").
const LOCALES: Record<string, string> = {
  RON: 'ro-RO', PLN: 'pl-PL', HUF: 'hu-HU', CZK: 'cs-CZ', CHF: 'de-CH', SEK: 'sv-SE', NOK: 'nb-NO',
  DKK: 'da-DK', ISK: 'is-IS', TRY: 'tr-TR', GBP: 'en-GB', JPY: 'ja-JP', CNY: 'zh-CN', KRW: 'ko-KR',
  BRL: 'pt-BR', MXN: 'es-MX', INR: 'en-IN', IDR: 'id-ID', THB: 'th-TH', ILS: 'he-IL',
}

// A price typed in ("4,50" or "4.50"): the number, or null when it's empty or not a price.
export function parsePaid(text: string) {
  const value = Number(text.replace(',', '.'))
  return text.trim() && Number.isFinite(value) && value >= 0 ? value : null
}

// ---- Rates (euros -> other currencies) ----

type Rates = { fetched: number; rates: Record<string, number> }

const RATES_KEY = 'exchange-rates'
const FRESH_FOR = 12 * 60 * 60 * 1000

let rates: Rates | null = (() => {
  try {
    const saved = Storage.getItemSync(RATES_KEY)
    return saved ? (JSON.parse(saved) as Rates) : null
  } catch {
    return null
  }
})()

// Fetches the day's rates if the saved ones are older than half a day. Called at start.
export async function refreshRates() {
  if (rates && Date.now() - rates.fetched < FRESH_FOR) return
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR')
    if (!res.ok) throw new Error(`Rates: ${res.status}`)
    const body = (await res.json()) as { rates: Record<string, number> }
    rates = { fetched: Date.now(), rates: { ...body.rates, EUR: 1 } }
    Storage.setItemSync(RATES_KEY, JSON.stringify(rates))
    update()
  } catch (e) {
    console.warn('Failed to fetch exchange rates', e)
  }
}

// ---- Formatting ----

export type Money = {
  // The currency prices show in (the euro, until there are rates for the chosen one).
  code: string
  // "€", "lei", "$": for price fields.
  symbol: string
  // A price in euros / dollars, written in the user's currency.
  eur: (value: number) => string
  usd: (value: number) => string
  // Euros <-> the user's currency, for what was paid for a copy (stored in euros).
  fromEur: (value: number) => number
  toEur: (value: number) => number
}

const eurFormat = (value: number) => `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const usdFormat = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function formatterFor(code: string) {
  try {
    const f = new Intl.NumberFormat(LOCALES[code] ?? 'en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
    return (value: number) => f.format(value)
  } catch {
    return (value: number) => `${value.toFixed(2)} ${code}`
  }
}

function symbolFor(code: string, format: (value: number) => string) {
  if (code === 'EUR') return '€'
  // The formatted number without its digits and separators (spaces, dots, commas, apostrophes).
  return format(0).replace(/[\d\s.,'’-]/g, '') || code
}

function makeMoney(): Money {
  const wanted = getSettings().currency ?? phoneCurrency()
  const rate = rates?.rates[wanted]
  const usdRate = rates?.rates.USD
  // No rate yet: euros stay euros, dollars stay dollars.
  if (wanted === 'EUR' || rate == null) {
    return {
      code: 'EUR',
      symbol: '€',
      eur: eurFormat,
      usd: (v) => (usdRate ? eurFormat(v / usdRate) : usdFormat(v)),
      fromEur: (v) => v,
      toEur: (v) => v,
    }
  }
  const format = wanted === 'USD' ? usdFormat : formatterFor(wanted)
  return {
    code: wanted,
    symbol: wanted === 'USD' ? '$' : symbolFor(wanted, format),
    eur: (v) => format(v * rate),
    usd: (v) => format(usdRate ? (v / usdRate) * rate : v),
    fromEur: (v) => v * rate,
    toEur: (v) => v / rate,
  }
}

let money = makeMoney()
const changes = createListeners()

function update() {
  money = makeMoney()
  changes.notify()
}

// Only a change of currency matters (not the other settings).
let chosen = getSettings().currency
subscribeSettings(() => {
  if (getSettings().currency === chosen) return
  chosen = getSettings().currency
  update()
})

// Prices in the user's currency. A new object whenever the currency or the rates change, so
// whatever formats with it shows the new amounts.
export const useMoney = () => useSyncExternalStore(changes.subscribe, () => money)
