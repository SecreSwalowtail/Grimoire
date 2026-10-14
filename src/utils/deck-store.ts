import type { SQLiteDatabase } from 'expo-sqlite'
import { useSyncExternalStore } from 'react'

import { getDecksAndFolders, saveDeckChanges, type DeckSnapshot } from '@/db/decks'

// Decks, folders and the cards in each deck, saved in the app's database (tables `deck_folders`,
// `decks` and `deck_cards`). loadDeckStore() reads them once at launch; after that the screens
// read and change this in-memory copy, so they never wait on the database, and each change is
// written back in the background.

export const FORMATS = ['Standard', 'Pioneer', 'Modern', 'Pauper', 'Legacy', 'Commander', 'Casual'] as const
export type DeckFormat = (typeof FORMATS)[number]

export const FOLDER_COLORS = {
  gold: { label: 'Gold', hex: '#D4A64A' },
  oxblood: { label: 'Oxblood', hex: '#B5523E' },
  moss: { label: 'Moss', hex: '#8DB477' },
  slate: { label: 'Slate blue', hex: '#6F93BA' },
  plum: { label: 'Plum', hex: '#B98AB0' },
  bone: { label: 'Bone', hex: '#B3AB9C' },
}
export type FolderColor = keyof typeof FOLDER_COLORS

const FOLDER_SORTS = ['custom', 'name', 'value'] as const
export type FolderSort = (typeof FOLDER_SORTS)[number]

export type Folder = { id: string; name: string; color: FolderColor; sort: FolderSort; pinned: boolean }
export type Deck = { id: string; name: string; format: DeckFormat; folderId: string | null }

// The parts of a deck: the deck itself, its sideboard, and cards you're considering.
export type Board = 'main' | 'side' | 'maybe'
const BOARDS: readonly Board[] = ['main', 'side', 'maybe']

// Copies of one printing in one part of a deck. `id` is "deckId|cardId|board".
export type DeckCard = { id: string; deckId: string; cardId: string; board: Board; quantity: number }

// What the deck screens need to know about a card (a cached copy of its row in `cards`).
export type CardInfo = {
  name: string
  typeLine: string | null
  cmc: number | null
  priceEur: number | null
  priceEurFoil: number | null
  image: string | null
}

// `info` isn't saved with the rest: it comes from the cards table.
type State = DeckSnapshot & { info: Record<string, CardInfo> }

let state: State = { folders: [], decks: [], cards: [], info: {} }
const listeners = new Set<() => void>()

let db: SQLiteDatabase | null = null
// What the database holds, as far as we know: each save writes the difference from this.
let saved: State = state
let saving = false
let dirty = false

function set(next: State) {
  state = next
  listeners.forEach((listener) => listener())
  save()
}

// Writes run one at a time; changes made during a write go out in the next one. If a write
// fails, `saved` stays as it was, so the next change retries everything still missing.
async function save() {
  dirty = true
  if (saving || !db) return
  saving = true
  while (dirty) {
    dirty = false
    const next = state
    try {
      await saveDeckChanges(db, saved, next)
      saved = next
    } catch (error) {
      console.warn('Saving decks failed', error)
      break
    }
  }
  saving = false
}

const pick = <T extends string>(value: string, allowed: readonly T[], fallback: T) =>
  allowed.includes(value as T) ? (value as T) : fallback

// Called once at launch, after the migrations (see app/_layout.tsx).
export async function loadDeckStore(database: SQLiteDatabase) {
  const rows = await getDecksAndFolders(database)
  const colors = Object.keys(FOLDER_COLORS) as FolderColor[]
  const info: Record<string, CardInfo> = {}
  for (const c of rows.cards) {
    info[c.card_id] = {
      name: c.name,
      typeLine: c.type_line,
      cmc: c.cmc,
      priceEur: c.price_eur,
      priceEurFoil: c.price_eur_foil,
      image: c.image_uri,
    }
  }
  const loaded: State = {
    info,
    cards: rows.cards.map((c) => {
      const board = pick(c.board, BOARDS, 'main')
      return { id: cardKey(c.deck_id, c.card_id, board), deckId: c.deck_id, cardId: c.card_id, board, quantity: c.quantity }
    }),
    folders: rows.folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: pick(f.color, colors, 'gold'),
      sort: pick(f.sort, FOLDER_SORTS, 'custom'),
      pinned: f.pinned === 1,
    })),
    decks: rows.decks.map((d) => ({ id: d.id, name: d.name, format: pick(d.format, FORMATS, 'Casual'), folderId: d.folder_id })),
  }
  db = database
  saved = loaded
  state = loaded
  listeners.forEach((listener) => listener())
}

export function useDeckStore() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, () => state)
}

const cardKey = (deckId: string, cardId: string, board: Board) => `${deckId}|${cardId}|${board}`

// Unique across launches: time plus a random part, e.g. "deck-mg9x3k2a-7f2kq1".
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function createDeck(deck: Omit<Deck, 'id'>) {
  const id = newId('deck')
  set({ ...state, decks: [...state.decks, { ...deck, id }] })
  return id
}

export function updateDeck(id: string, patch: Partial<Omit<Deck, 'id'>>) {
  set({ ...state, decks: state.decks.map((d) => (d.id === id ? { ...d, ...patch } : d)) })
}

// Copies go right after their originals, named "… copy", with the same cards.
export function duplicateDecks(ids: string[]) {
  const decks: Deck[] = []
  const cards = [...state.cards]
  for (const deck of state.decks) {
    decks.push(deck)
    if (!ids.includes(deck.id)) continue
    const id = newId('deck')
    decks.push({ ...deck, id, name: `${deck.name} copy` })
    for (const c of state.cards) {
      if (c.deckId === deck.id) cards.push({ ...c, id: cardKey(id, c.cardId, c.board), deckId: id })
    }
  }
  set({ ...state, decks, cards })
}

// Sets how many copies of a card are in one part of a deck (0 takes it out).
export function setDeckCardCount(deckId: string, cardId: string, card: CardInfo, board: Board, quantity: number) {
  const id = cardKey(deckId, cardId, board)
  const info = { ...state.info, [cardId]: card }
  const exists = state.cards.some((c) => c.id === id)
  let cards: DeckCard[]
  if (quantity <= 0) cards = state.cards.filter((c) => c.id !== id)
  else if (exists) cards = state.cards.map((c) => (c.id === id ? { ...c, quantity } : c))
  else cards = [...state.cards, { id, deckId, cardId, board, quantity }]
  set({ ...state, info, cards })
}

// The undo puts each deck back where it came from (out of folders if that folder is gone).
export function moveDecks(ids: string[], folderId: string | null): Undo {
  const from = new Map(state.decks.filter((d) => ids.includes(d.id)).map((d) => [d.id, d.folderId]))
  set({ ...state, decks: state.decks.map((d) => (ids.includes(d.id) ? { ...d, folderId } : d)) })
  return () => {
    const decks = state.decks.map((d) => {
      if (!from.has(d.id)) return d
      const back = from.get(d.id) ?? null
      return { ...d, folderId: back == null || state.folders.some((f) => f.id === back) ? back : null }
    })
    set({ ...state, decks })
  }
}

// Also files the given decks into the new folder.
export function createFolder(folder: Omit<Folder, 'id' | 'sort' | 'pinned'>, deckIds: string[] = []) {
  const id = newId('folder')
  set({
    ...state,
    folders: [...state.folders, { ...folder, id, sort: 'custom', pinned: false }],
    decks: state.decks.map((d) => (deckIds.includes(d.id) ? { ...d, folderId: id } : d)),
  })
  return id
}

export function updateFolder(id: string, patch: Partial<Omit<Folder, 'id'>>) {
  set({ ...state, folders: state.folders.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
}

// Puts the given items in this order, in the slots they already take up; the rest stay put.
// So reordering one folder's decks leaves every other deck where it was.
function reorder<T extends { id: string }>(list: T[], ids: string[]) {
  const byId = new Map(list.map((item) => [item.id, item]))
  const order = ids.filter((id) => byId.has(id))
  const slots = list.flatMap((item, i) => (order.includes(item.id) ? [i] : []))
  const next = [...list]
  slots.forEach((slot, k) => {
    next[slot] = byId.get(order[k])!
  })
  return next
}

export function reorderFolders(ids: string[]) {
  set({ ...state, folders: reorder(state.folders, ids) })
}

export function reorderDecks(ids: string[]) {
  set({ ...state, decks: reorder(state.decks, ids) })
}

// Deletes return an undo function that puts back exactly what they removed or changed,
// leaving anything created in the meantime alone.
export type Undo = () => void

// A deleted deck's cards leave with it; undo brings both back.
export function deleteDecks(ids: string[]): Undo {
  const removed = state.decks.map((d, i) => ({ d, i })).filter(({ d }) => ids.includes(d.id))
  const removedCards = state.cards.filter((c) => ids.includes(c.deckId))
  set({ ...state, decks: state.decks.filter((d) => !ids.includes(d.id)), cards: state.cards.filter((c) => !ids.includes(c.deckId)) })
  return () => {
    const decks = [...state.decks]
    for (const { d, i } of removed) decks.splice(Math.min(i, decks.length), 0, d)
    set({ ...state, decks, cards: [...state.cards, ...removedCards] })
  }
}

// `withDecks`: delete the folders' decks too, else move them out of folders.
export function deleteFolders(ids: string[], withDecks: boolean): Undo {
  const removedFolders = state.folders.map((f, i) => ({ f, i })).filter(({ f }) => ids.includes(f.id))
  const affected = state.decks.map((d, i) => ({ d, i })).filter(({ d }) => d.folderId != null && ids.includes(d.folderId))
  const gone = (deckId: string) => withDecks && affected.some((a) => a.d.id === deckId)
  const removedCards = state.cards.filter((c) => gone(c.deckId))
  set({
    ...state,
    folders: state.folders.filter((f) => !ids.includes(f.id)),
    decks: withDecks
      ? state.decks.filter((d) => !affected.some((a) => a.d.id === d.id))
      : state.decks.map((d) => (affected.some((a) => a.d.id === d.id) ? { ...d, folderId: null } : d)),
    cards: state.cards.filter((c) => !gone(c.deckId)),
  })
  return () => {
    const folders = [...state.folders]
    for (const { f, i } of removedFolders) folders.splice(Math.min(i, folders.length), 0, f)
    let decks = state.decks.map((d) => affected.find((a) => a.d.id === d.id)?.d ?? d)
    if (withDecks) {
      decks = [...decks]
      for (const { d, i } of affected) decks.splice(Math.min(i, decks.length), 0, d)
    }
    set({ ...state, folders, decks, cards: [...state.cards, ...removedCards] })
  }
}

// Everything the deck numbers below read. Pass the snapshot from useDeckStore(), so a screen
// re-renders (and the React Compiler recomputes) when cards change.
export type DeckData = Pick<State, 'cards' | 'info'>

// Decks in a folder, in the folder's chosen order (most valuable first for "value").
export function folderDecks(decks: Deck[], folder: Folder, data: DeckData) {
  const inFolder = decks.filter((d) => d.folderId === folder.id)
  if (folder.sort === 'name') return [...inFolder].sort((a, b) => a.name.localeCompare(b.name))
  if (folder.sort === 'value') return [...inFolder].sort((a, b) => deckValue(b, data) - deckValue(a, data))
  return inFolder
}

const cardPrice = (info: CardInfo | undefined) => info?.priceEur ?? info?.priceEurFoil ?? 0

// Lands count by the front face: a card that's a spell on the front and a land on the back is a spell.
const isLand = (info: CardInfo | undefined) => (info?.typeLine ?? '').split(' // ')[0].includes('Land')

// Cards in the deck itself (not the sideboard or maybe list).
export function deckCardCount(deck: Deck, data: DeckData) {
  return data.cards.reduce((n, c) => n + (c.deckId === deck.id && c.board === 'main' ? c.quantity : 0), 0)
}

// What the deck and its sideboard are worth in EUR (non-foil prices, foil when that's all there is).
export function deckValue(deck: Deck, data: DeckData) {
  return data.cards.reduce(
    (sum, c) => sum + (c.deckId === deck.id && c.board !== 'maybe' ? c.quantity * cardPrice(data.info[c.cardId]) : 0),
    0,
  )
}

// Average mana value of the deck's spells: lands left out, each copy counted. Null with no spells.
export function deckManaValue(deck: Deck, data: DeckData): number | null {
  let total = 0
  let count = 0
  for (const c of data.cards) {
    const info = data.info[c.cardId]
    if (c.deckId !== deck.id || c.board !== 'main' || isLand(info) || info?.cmc == null) continue
    total += info.cmc * c.quantity
    count += c.quantity
  }
  return count ? total / count : null
}

// Where a card (any printing, found by name) is used: its copies per part, per deck id.
export function cardUse(name: string, data: DeckData) {
  const byDeck = new Map<string, Record<Board, number>>()
  for (const c of data.cards) {
    if (data.info[c.cardId]?.name !== name) continue
    const counts = byDeck.get(c.deckId) ?? { main: 0, side: 0, maybe: 0 }
    counts[c.board] += c.quantity
    byDeck.set(c.deckId, counts)
  }
  return byDeck
}

// "#D4A64A" + 0.18 -> "rgba(212,166,74,0.18)", for folder tints and glows.
export function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
