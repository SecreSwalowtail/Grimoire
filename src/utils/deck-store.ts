import type { SQLiteDatabase } from 'expo-sqlite'
import { useSyncExternalStore } from 'react'

import { getDecksAndFolders, saveDeckChanges, type DeckSnapshot } from '@/db/decks'
import { cardImage, type ScryfallCard } from '@/db/scryfall'
import { createListeners } from '@/utils/listeners'

// Decks, folders and the cards in each deck, saved in the app's database (tables `deck_folders`,
// `decks` and `deck_cards`). loadDeckStore() reads them once at launch; after that the screens
// read and change this in-memory copy, so they never wait on the database, and each change is
// written back in the background.

// Every format a deck can be for: the most played first (POPULAR_FORMATS), then the other paper
// formats, the MTG Arena ones, and Casual (no card pool). Saved by name.
export const FORMATS = [
  'Commander',
  'Standard',
  'Modern',
  'Pioneer',
  'Pauper',
  'Legacy',
  'Vintage',
  'Oathbreaker',
  'Pauper Commander',
  'Duel Commander',
  'PreDH',
  'Premodern',
  'Old School',
  'Penny Dreadful',
  'Future Standard',
  'Alchemy',
  'Explorer',
  'Historic',
  'Timeless',
  'Brawl',
  'Standard Brawl',
  'Competitive Brawl',
  'Gladiator',
  'Casual',
] as const
export type DeckFormat = (typeof FORMATS)[number]

// Formats built around a commander. In any other format a deck's commander mark is kept (switching
// back brings it back) but not shown or used.
const COMMANDER_FORMATS: DeckFormat[] = [
  'Commander',
  'Pauper Commander',
  'Duel Commander',
  'PreDH',
  'Brawl',
  'Standard Brawl',
  'Competitive Brawl',
  'Oathbreaker',
]
export const hasCommander = (format: DeckFormat) => COMMANDER_FORMATS.includes(format)

// Whether a deck card is its commander right now (marked, and the deck's format has one).
export function isCommander(card: DeckCard, decks: Deck[]) {
  if (!card.commander) return false
  const deck = decks.find((d) => d.id === card.deckId)
  return deck != null && hasCommander(deck.format)
}

// Shown first when picking a format; the rest are behind "More formats".
export const POPULAR_FORMATS: DeckFormat[] = ['Commander', 'Standard', 'Modern', 'Pioneer', 'Pauper', 'Legacy']

// Quick picks in the color picker. Folders made before any color could be picked are saved with
// these names instead of a hex.
export const FOLDER_COLORS = {
  gold: { label: 'Gold', hex: '#D4A64A' },
  oxblood: { label: 'Oxblood', hex: '#B5523E' },
  moss: { label: 'Moss', hex: '#8DB477' },
  slate: { label: 'Slate blue', hex: '#6F93BA' },
  plum: { label: 'Plum', hex: '#B98AB0' },
  bone: { label: 'Bone', hex: '#B3AB9C' },
}
export type FolderColor = keyof typeof FOLDER_COLORS

// A folder's color as "#RRGGBB" (it's saved as one, or as a preset's name).
export const folderHex = (color: string) => FOLDER_COLORS[color as FolderColor]?.hex ?? color

const FOLDER_SORTS = ['custom', 'name', 'value'] as const
export type FolderSort = (typeof FOLDER_SORTS)[number]

// `color`: "#RRGGBB", or a FOLDER_COLORS name (see folderHex).
export type Folder = { id: string; name: string; color: string; sort: FolderSort; pinned: boolean }
export type Deck = { id: string; name: string; format: DeckFormat; folderId: string | null }

// The parts of a deck: the deck itself, its sideboard, and cards you're considering.
export type Board = 'main' | 'side' | 'maybe'
const BOARDS: readonly Board[] = ['main', 'side', 'maybe']

// Copies of one printing in one part of a deck. `id` is "deckId|cardId|board".
// `commander`: the deck's commander (only main-deck cards; two for partners).
export type DeckCard = { id: string; deckId: string; cardId: string; board: Board; quantity: number; commander?: boolean }

// What the deck screens need to know about a card (a cached copy of its row in `cards`).
export type CardInfo = {
  name: string
  typeLine: string | null
  cmc: number | null
  priceEur: number | null
  priceEurFoil: number | null
  image: string | null
}

export function cardInfoOf(card: ScryfallCard): CardInfo {
  return {
    name: card.name,
    typeLine: card.type_line ?? null,
    cmc: card.cmc ?? null,
    priceEur: card.prices.eur == null ? null : Number(card.prices.eur),
    priceEurFoil: card.prices.eur_foil == null ? null : Number(card.prices.eur_foil),
    image: cardImage(card),
  }
}

// `info` isn't saved with the rest: it comes from the cards table.
type State = DeckSnapshot & { info: Record<string, CardInfo> }

let state: State = { folders: [], decks: [], cards: [], info: {} }
const changes = createListeners()

let db: SQLiteDatabase | null = null
// What the database holds, as far as we know: each save writes the difference from this.
let saved: State = state
let saving = false
let dirty = false

function set(next: State) {
  state = next
  changes.notify()
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
      return {
        id: cardKey(c.deck_id, c.card_id, board),
        deckId: c.deck_id,
        cardId: c.card_id,
        board,
        quantity: c.quantity,
        commander: board === 'main' && c.commander === 1,
      }
    }),
    folders: rows.folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color || 'gold',
      sort: pick(f.sort, FOLDER_SORTS, 'custom'),
      pinned: f.pinned === 1,
    })),
    decks: rows.decks.map((d) => ({ id: d.id, name: d.name, format: pick(d.format, FORMATS, 'Casual'), folderId: d.folder_id })),
  }
  db = database
  saved = loaded
  state = loaded
  changes.notify()
}

// The decks as they are now, outside a component (e.g. in a callback made earlier).
export const getDeckStore = () => state

export const useDeckStore = () => useSyncExternalStore(changes.subscribe, getDeckStore)

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

// Copies go right after their originals, named "… copy", with the same cards. The undo deletes
// the copies.
export function duplicateDecks(ids: string[]): Undo {
  const decks: Deck[] = []
  const cards = [...state.cards]
  const copies: string[] = []
  for (const deck of state.decks) {
    decks.push(deck)
    if (!ids.includes(deck.id)) continue
    const id = newId('deck')
    copies.push(id)
    decks.push({ ...deck, id, name: `${deck.name} copy` })
    for (const c of state.cards) {
      if (c.deckId === deck.id) cards.push({ ...c, id: cardKey(id, c.cardId, c.board), deckId: id })
    }
  }
  set({ ...state, decks, cards })
  return () => {
    deleteDecks(copies)
  }
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

// Adds `by` copies (negative takes them away) to one part of a deck. Does nothing if the deck is
// gone. Returns whether it did anything. `commander` also makes the card a commander (main deck).
export function addDeckCards(deckId: string, cardId: string, card: CardInfo, board: Board, by: number, commander = false) {
  if (!state.decks.some((d) => d.id === deckId)) return false
  const now = state.cards.find((c) => c.id === cardKey(deckId, cardId, board))?.quantity ?? 0
  setDeckCardCount(deckId, cardId, card, board, now + by)
  if (commander && board === 'main') setCommander(deckId, cardId, true)
  return true
}

// Makes a main-deck card the deck's commander, or a regular card again. A third commander replaces
// the earliest: a deck has one, or two with partners.
function setCommander(deckId: string, cardId: string, on: boolean) {
  const id = cardKey(deckId, cardId, 'main')
  const others = state.cards.filter((c) => c.deckId === deckId && c.commander && c.id !== id)
  const drop = on && others.length >= 2 ? others[0].id : null
  set({
    ...state,
    cards: state.cards.map((c) =>
      c.id === id ? { ...c, commander: on } : c.id === drop ? { ...c, commander: false } : c,
    ),
  })
}

// Makes exactly these main-deck cards the deck's commanders (one, or two that can share command).
export function setCommanders(deckId: string, cardIds: string[]) {
  const ids = new Set(cardIds.map((id) => cardKey(deckId, id, 'main')))
  set({
    ...state,
    cards: state.cards.map((c) =>
      c.deckId !== deckId ? c : ids.has(c.id) ? { ...c, commander: true } : c.commander ? { ...c, commander: false } : c,
    ),
  })
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

// A card in one part of a deck.
type DeckCardKey = { cardId: string; board: Board }

// Undo for an edit to one deck's cards: puts back the deck's cards as they were.
function restoreDeck(deckId: string): Undo {
  const before = state.cards.filter((c) => c.deckId === deckId)
  return () => set({ ...state, cards: [...state.cards.filter((c) => c.deckId !== deckId), ...before] })
}

// Adds cards to one part of several decks at once (copies already there add up), in one change.
// Decks that are gone are skipped. The undo puts those decks' cards back as they were.
export function addCardsToDecks(deckIds: string[], add: { cardId: string; info: CardInfo; quantity: number }[], board: Board): Undo {
  const ids = deckIds.filter((id) => state.decks.some((d) => d.id === id))
  const before = state.cards.filter((c) => ids.includes(c.deckId))
  const info = { ...state.info }
  for (const a of add) info[a.cardId] = a.info
  const cards = [...state.cards]
  const index = new Map(cards.map((c, i) => [c.id, i]))
  for (const deckId of ids) {
    for (const a of add) {
      if (a.quantity <= 0) continue
      const id = cardKey(deckId, a.cardId, board)
      const i = index.get(id)
      if (i != null) {
        cards[i] = { ...cards[i], quantity: cards[i].quantity + a.quantity }
      } else {
        index.set(id, cards.length)
        cards.push({ id, deckId, cardId: a.cardId, board, quantity: a.quantity })
      }
    }
  }
  set({ ...state, info, cards })
  return () => set({ ...state, cards: [...state.cards.filter((c) => !ids.includes(c.deckId)), ...before] })
}

// Takes cards out of a deck (every copy of each).
export function removeDeckCards(deckId: string, keys: DeckCardKey[]): Undo {
  const undo = restoreDeck(deckId)
  const ids = new Set(keys.map((k) => cardKey(deckId, k.cardId, k.board)))
  set({ ...state, cards: state.cards.filter((c) => !ids.has(c.id)) })
  return undo
}

// Moves cards to another part of the deck. Copies already there add up; a commander moved out of
// the main deck stops being the commander.
export function moveDeckCards(deckId: string, keys: DeckCardKey[], to: Board): Undo {
  const undo = restoreDeck(deckId)
  let cards = [...state.cards]
  for (const k of keys) {
    if (k.board === to) continue
    const from = cards.find((c) => c.id === cardKey(deckId, k.cardId, k.board))
    if (!from) continue
    const id = cardKey(deckId, k.cardId, to)
    const there = cards.find((c) => c.id === id)
    cards = cards.filter((c) => c.id !== from.id)
    cards = there
      ? cards.map((c) => (c.id === id ? { ...c, quantity: c.quantity + from.quantity } : c))
      : [...cards, { ...from, id, board: to, commander: false }]
  }
  set({ ...state, cards })
  return undo
}

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

// Test data for the performance pass (utils/dev-seed.ts): adds many folders, decks and cards in
// one change.
export function addTestDecks(add: { folders: Folder[]; decks: Deck[]; cards: DeckCard[]; info: Record<string, CardInfo> }) {
  set({
    folders: [...state.folders, ...add.folders],
    decks: [...state.decks, ...add.decks],
    cards: [...state.cards, ...add.cards],
    info: { ...state.info, ...add.info },
  })
}

// After the database was wiped (Developer tools → Clear database): empty, and nothing to save.
export function resetDeckStore() {
  state = { folders: [], decks: [], cards: [], info: {} }
  saved = state
  changes.notify()
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
