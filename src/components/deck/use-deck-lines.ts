import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import type { ScryfallCard } from '@/db/scryfall';
import { lineFrom, type DeckLine } from '@/rules/deck-stats';
import { isCommander, useDeckStore } from '@/utils/deck-store';

type Extra = { cards: Map<string, ScryfallCard>; owned: Map<string, number> }

// A deck's cards as DeckLines: the deck store's cards, plus each card's full data saved on the
// phone (mana cost, produced mana, rules text) and how many copies your binders hold. The saved
// data is read again when the deck's cards change or the screen comes back into view.
export function useDeckLines(deckId: string) {
  const db = useSQLiteContext()
  const store = useDeckStore()
  const deckCards = store.cards.filter((c) => c.deckId === deckId)
  const ids = [...new Set(deckCards.map((c) => c.cardId))]
  const key = ids.join(',')
  const [extra, setExtra] = useState<Extra>(() => ({ cards: new Map(), owned: new Map() }))
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    const list = key ? key.split(',') : []
    const marks = list.map(() => '?').join(',')
    const rows = list.length
      ? await db.getAllAsync<{ id: string; name: string; data: string | null }>(`SELECT id, name, data FROM cards WHERE id IN (${marks})`, ...list)
      : []
    const cards = new Map<string, ScryfallCard>()
    for (const r of rows) {
      if (!r.data) continue
      try {
        cards.set(r.id, JSON.parse(r.data))
      } catch {
        // Unreadable data: the card shows without its cost.
      }
    }
    // Owned copies by name: any printing counts.
    const names = [...new Set(rows.map((r) => r.name))]
    const owned = new Map<string, number>()
    if (names.length) {
      const counts = await db.getAllAsync<{ name: string; n: number }>(
        `SELECT cards.name, SUM(collection.quantity) AS n FROM collection JOIN cards ON cards.id = collection.card_id
         WHERE cards.name IN (${names.map(() => '?').join(',')}) GROUP BY cards.name`,
        ...names,
      )
      for (const c of counts) owned.set(c.name, c.n)
    }
    setExtra({ cards, owned })
    setLoadedKey(key)
  }, [db, key])

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => console.warn('Failed to load deck cards', e))
    }, [load]),
  )

  const lines: DeckLine[] = deckCards.flatMap((c) => {
    const info = store.info[c.cardId]
    if (!info) return []
    return [lineFrom(c.cardId, c.board, c.quantity, info, extra.cards.get(c.cardId) ?? null, extra.owned.get(info.name) ?? 0, isCommander(c, store.decks))]
  })
  return { lines, loaded: loadedKey === key }
}
