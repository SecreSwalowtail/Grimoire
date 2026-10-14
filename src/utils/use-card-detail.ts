import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useRef, useState } from 'react'

import { upsertCard } from '@/db/cards'
import { getCopiesOfCard, getPriceHistory, type CollectionEntry, type PricePoint } from '@/db/collection'
import { cachedCard, getCard, getPrintings, getRulings, type Ruling, type ScryfallCard } from '@/db/scryfall'

// Data for Card detail. Each piece is stored with the key it was loaded for (printing id, or the
// card's oracle id / name), so switching printings never shows another printing's data, and no
// state has to be reset inside an effect.

type Keyed<T> = { key: string; value: T }

// One printing: from memory if a list already loaded it, else from Scryfall.
export function useCard(id: string) {
  const [loaded, setLoaded] = useState<Keyed<ScryfallCard | null> | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const card = loaded?.key === id ? loaded.value : cachedCard(id)

  useEffect(() => {
    if (cachedCard(id)) return
    let live = true
    getCard(id)
      .then((value) => {
        if (live) setLoaded({ key: id, value })
      })
      .catch(() => {
        if (live) setFailed(id)
      })
    return () => {
      live = false
    }
  }, [id, attempt])

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

// Every printing (first page, then more on demand) and the official rulings, per card.
export function useOracleData(card: ScryfallCard | null) {
  const oracleId = card?.oracle_id ?? null
  const cardId = card?.id ?? null
  const [printings, setPrintings] = useState<Keyed<{ list: ScryfallCard[]; total: number; page: number; more: boolean }> | null>(null)
  const [rulings, setRulings] = useState<Keyed<Ruling[]> | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const rulingsFor = useRef<string | null>(null)

  useEffect(() => {
    if (!oracleId) return
    let live = true
    getPrintings(oracleId)
      .then((res) => {
        if (live) setPrintings({ key: oracleId, value: { list: res.data, total: res.total_cards, page: 1, more: res.has_more } })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [oracleId])

  // Rulings belong to the card, not the printing: load them once per card, for the first printing seen.
  useEffect(() => {
    if (!oracleId || !cardId || rulingsFor.current === oracleId) return
    rulingsFor.current = oracleId
    getRulings(cardId)
      .then((value) => setRulings({ key: oracleId, value }))
      .catch(() => {
        rulingsFor.current = null
      })
  }, [oracleId, cardId])

  const current = printings?.key === oracleId ? printings.value : null

  const loadMore = async () => {
    if (!oracleId || !current?.more || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await getPrintings(oracleId, current.page + 1)
      setPrintings({
        key: oracleId,
        value: { list: [...current.list, ...res.data], total: res.total_cards, page: current.page + 1, more: res.has_more },
      })
    } finally {
      setLoadingMore(false)
    }
  }

  return {
    printings: current,
    rulings: rulings?.key === oracleId ? rulings.value : null,
    loadMore,
    loadingMore,
  }
}

// What's saved on the phone for a card: your copies of it (any printing), and the price history of
// the printing on show. Opening a printing saves it, which records today's price for the chart.
export function useLocalCardData(card: ScryfallCard | null) {
  const db = useSQLiteContext()
  const name = card?.name ?? null
  const [copies, setCopies] = useState<Keyed<CollectionEntry[]> | null>(null)
  const [history, setHistory] = useState<Keyed<PricePoint[]> | null>(null)

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
    upsertCard(db, card)
      .then(() => getPriceHistory(db, card.id))
      .then((value) => {
        if (live) setHistory({ key: card.id, value })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [db, card])

  return {
    copies: copies?.key === name ? copies.value : [],
    history: history != null && history.key === card?.id ? history.value : [],
    reloadCopies,
  }
}
