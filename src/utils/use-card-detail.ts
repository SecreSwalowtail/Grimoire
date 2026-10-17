import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getSavedCard, upsertCard } from '@/db/cards'
import { getCopiesOfCard, getPriceHistory, type CollectionEntry, type PricePoint } from '@/db/collection'
import { cachedCard, getCard, getPrintings, getRulings, rememberCard, type Ruling, type ScryfallCard } from '@/db/scryfall'
import { getRemotePrices, mergeHistory } from '@/utils/remote-prices'

// Data for Card detail. Each piece is stored with the key it was loaded for (printing id, or the
// card's oracle id / name), so switching printings never shows another printing's data, and no
// state has to be reset inside an effect.

type Keyed<T> = { key: string; value: T }

// A saved card younger than this is shown without asking Scryfall: prices change once a day.
const FRESH_FOR = 24 * 60 * 60 * 1000

// Cards read back from the phone. They aren't saved again on opening: that would mark day-old
// data as just refreshed, and it would never be fetched anew.
const fromPhone = new WeakSet<ScryfallCard>()

// One printing, from the quickest place that has it: memory (a list loaded it this session), the
// phone (owned or opened before: shown at once, refreshed in the background when over a day
// old), else Scryfall.
export function useCard(id: string) {
  const db = useSQLiteContext()
  const [loaded, setLoaded] = useState<Keyed<ScryfallCard | null> | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const card = loaded?.key === id ? loaded.value : cachedCard(id)

  useEffect(() => {
    if (cachedCard(id)) return
    let live = true
    const load = async () => {
      const saved = await getSavedCard(db, id).catch(() => null)
      if (saved && live) {
        fromPhone.add(saved.card)
        rememberCard(saved.card)
        setLoaded({ key: id, value: saved.card })
      }
      if (saved && Date.now() - saved.updatedAt < FRESH_FOR) return
      try {
        const fresh = await getCard(id)
        // Keep the saved copy if Scryfall no longer knows the printing.
        if (live && (fresh || !saved)) setLoaded({ key: id, value: fresh })
      } catch {
        if (live && !saved) setFailed(id)
      }
    }
    load()
    return () => {
      live = false
    }
  }, [db, id, attempt])

  return {
    card,
    // Couldn't reach Scryfall for this printing (offline, or Scryfall down).
    failed: failed === id && card == null,
    // Scryfall answered but doesn't know the card.
    missing: loaded?.key === id && loaded.value == null,
    retry: () => {
      setFailed(null)
      setAttempt((n) => n + 1)
    },
  }
}

// Every printing (first page, then more on demand) and the official rulings, per card. Both are
// kept for the session, so reopening a card makes no requests. Rulings are asked for once the
// printings are in (or right away on the Rules tab): nothing on the Overview needs them.
type PrintingsState = { list: ScryfallCard[]; total: number; page: number; more: boolean }
const printingsCache = new Map<string, PrintingsState>()
const rulingsCache = new Map<string, Ruling[]>()

// Every printing of a card (by oracle id): the first page, then more on demand. `failed`: the
// first page couldn't be loaded (try again with `retry`).
export function usePrintings(oracleId: string | null) {
  const [printings, setPrintings] = useState<Keyed<PrintingsState> | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const current = oracleId ? (printings?.key === oracleId ? printings.value : printingsCache.get(oracleId) ?? null) : null

  useEffect(() => {
    if (!oracleId || printingsCache.has(oracleId)) return
    let live = true
    getPrintings(oracleId)
      .then((res) => {
        const value = { list: res.data, total: res.total_cards, page: 1, more: res.has_more }
        printingsCache.set(oracleId, value)
        if (live) setPrintings({ key: oracleId, value })
      })
      .catch(() => live && setFailed(oracleId))
    return () => {
      live = false
    }
  }, [oracleId, attempt])

  const loadMore = async () => {
    if (!oracleId || !current?.more || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await getPrintings(oracleId, current.page + 1)
      const value = { list: [...current.list, ...res.data], total: res.total_cards, page: current.page + 1, more: res.has_more }
      printingsCache.set(oracleId, value)
      setPrintings({ key: oracleId, value })
    } finally {
      setLoadingMore(false)
    }
  }

  return {
    printings: current,
    loadMore,
    loadingMore,
    failed: failed != null && failed === oracleId && current == null,
    retry: () => {
      setFailed(null)
      setAttempt((n) => n + 1)
    },
  }
}

export function useOracleData(card: ScryfallCard | null, onRulesTab: boolean) {
  const oracleId = card?.oracle_id ?? null
  const cardId = card?.id ?? null
  const { printings: current, loadMore, loadingMore } = usePrintings(oracleId)
  const [rulings, setRulings] = useState<Keyed<Ruling[]> | null>(null)
  const rulingsFor = useRef<string | null>(null)

  const currentRulings = oracleId ? (rulings?.key === oracleId ? rulings.value : rulingsCache.get(oracleId) ?? null) : null

  // Rulings belong to the card, not the printing: once per card, for the first printing seen.
  const wantRulings = onRulesTab || current != null
  useEffect(() => {
    if (!oracleId || !cardId || !wantRulings || rulingsCache.has(oracleId) || rulingsFor.current === oracleId) return
    rulingsFor.current = oracleId
    getRulings(cardId)
      .then((value) => {
        rulingsCache.set(oracleId, value)
        setRulings({ key: oracleId, value })
      })
      .catch(() => {
        rulingsFor.current = null
      })
  }, [oracleId, cardId, wantRulings])

  return {
    printings: current,
    rulings: currentRulings,
    loadMore,
    loadingMore,
  }
}

// What's saved on the phone for a card: your copies of it (any printing), and the price history of
// the printing on show. Opening a printing fresh from Scryfall saves it, which records today's
// price for the chart and lets it open from the phone next time. The history also takes in the
// published daily prices (remote-prices.ts), which go back further.
export function useLocalCardData(card: ScryfallCard | null) {
  const db = useSQLiteContext()
  const name = card?.name ?? null
  const [copies, setCopies] = useState<Keyed<CollectionEntry[]> | null>(null)
  const [history, setHistory] = useState<Keyed<PricePoint[]> | null>(null)
  const [published, setPublished] = useState<Keyed<PricePoint[]> | null>(null)

  const reloadCopies = useCallback(async () => {
    if (!name) return
    const value = await getCopiesOfCard(db, name)
    setCopies({ key: name, value })
  }, [db, name])

  useEffect(() => {
    if (!name) return
    let live = true
    getCopiesOfCard(db, name)
      .then((value) => {
        if (live) setCopies({ key: name, value })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [db, name])

  useEffect(() => {
    if (!card) return
    let live = true
    const save = fromPhone.has(card) ? Promise.resolve() : upsertCard(db, card)
    save
      .then(() => getPriceHistory(db, card.id))
      .then((value) => {
        if (live) setHistory({ key: card.id, value })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [db, card])

  useEffect(() => {
    if (!card) return
    let live = true
    getRemotePrices(card.id)
      .then((value) => {
        if (live) setPublished({ key: card.id, value })
      })
      .catch((e) => console.warn('Failed to download price history', e))
    return () => {
      live = false
    }
  }, [card])

  return {
    copies: copies?.key === name ? copies.value : [],
    history: mergeHistory(
      history != null && history.key === card?.id ? history.value : [],
      published != null && published.key === card?.id ? published.value : [],
    ),
    reloadCopies,
  }
}
