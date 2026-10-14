import type { SQLiteDatabase } from 'expo-sqlite'
import { useSyncExternalStore } from 'react'

import { getDecksAndFolders, saveDeckChanges, type DeckSnapshot } from '@/db/decks'

// Decks and folders for the Decks tab, saved in the app's database (tables `deck_folders` and
// `decks`). loadDeckStore() reads them once at launch; after that the screens read and change
// this in-memory copy, so they never wait on the database, and each change is written back in
// the background.

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

type State = DeckSnapshot

let state: State = { folders: [], decks: [] }
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
  const loaded: State = {
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

// Copies go right after their originals, named "… copy".
export function duplicateDecks(ids: string[]) {
  const decks: Deck[] = []
  for (const deck of state.decks) {
    decks.push(deck)
    if (ids.includes(deck.id)) decks.push({ ...deck, id: newId('deck'), name: `${deck.name} copy` })
  }
  set({ ...state, decks })
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

export function deleteDecks(ids: string[]): Undo {
  const removed = state.decks.map((d, i) => ({ d, i })).filter(({ d }) => ids.includes(d.id))
  set({ ...state, decks: state.decks.filter((d) => !ids.includes(d.id)) })
  return () => {
    const decks = [...state.decks]
    for (const { d, i } of removed) decks.splice(Math.min(i, decks.length), 0, d)
    set({ ...state, decks })
  }
}

// `withDecks`: delete the folders' decks too, else move them out of folders.
export function deleteFolders(ids: string[], withDecks: boolean): Undo {
  const removedFolders = state.folders.map((f, i) => ({ f, i })).filter(({ f }) => ids.includes(f.id))
  const affected = state.decks.map((d, i) => ({ d, i })).filter(({ d }) => d.folderId != null && ids.includes(d.folderId))
  set({
    folders: state.folders.filter((f) => !ids.includes(f.id)),
    decks: withDecks
      ? state.decks.filter((d) => !affected.some((a) => a.d.id === d.id))
      : state.decks.map((d) => (affected.some((a) => a.d.id === d.id) ? { ...d, folderId: null } : d)),
  })
  return () => {
    const folders = [...state.folders]
    for (const { f, i } of removedFolders) folders.splice(Math.min(i, folders.length), 0, f)
    let decks = state.decks.map((d) => affected.find((a) => a.d.id === d.id)?.d ?? d)
    if (withDecks) {
      decks = [...decks]
      for (const { d, i } of affected) decks.splice(Math.min(i, decks.length), 0, d)
    }
    set({ folders, decks })
  }
}

// Decks in a folder, in the folder's chosen order. Decks hold no cards yet, so "value" keeps
// the custom order.
export function folderDecks(decks: Deck[], folder: Folder) {
  const inFolder = decks.filter((d) => d.folderId === folder.id)
  return folder.sort === 'name' ? [...inFolder].sort((a, b) => a.name.localeCompare(b.name)) : inFolder
}

// A deck's price in EUR, and the average mana value of its cards (null with no cards).
// Decks hold no cards yet, so these are placeholders for the deck card list.
export function deckValue(_deck: Deck) {
  return 0
}

export function deckManaValue(_deck: Deck): number | null {
  return null
}

// "#D4A64A" + 0.18 -> "rgba(212,166,74,0.18)", for folder tints and glows.
export function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
