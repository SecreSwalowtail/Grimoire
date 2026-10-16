import type { SQLiteDatabase } from 'expo-sqlite'

import { collectionChanged } from '@/db/version'
import { isHex, shade } from '@/utils/color'

// The binder copies go in when none is picked: the first one in the user's order. In SQL, so it
// still works after that binder is deleted (there is always at least one).
export const FIRST_BINDER_SQL = '(SELECT id FROM binders ORDER BY position LIMIT 1)'

// Quick picks in the color picker. Early binders were saved with these names instead of a hex.
export const BINDER_PRESETS = {
  gold: { label: 'Gold', hex: '#D4A64A' },
  oxblood: { label: 'Oxblood', hex: '#B5523E' },
  moss: { label: 'Moss', hex: '#8DB477' },
  slate: { label: 'Slate blue', hex: '#6F93BA' },
  plum: { label: 'Plum', hex: '#9A7194' },
  bone: { label: 'Bone', hex: '#B3AB9C' },
} as const

// `color` is the picked color as "#RRGGBB": it marks the binder in the value bar, and the leather
// is made from it (see binderShades).
export type Binder = { id: string; name: string; color: string }

// The binder's leather from its one color: the front darkens from top left to bottom right, the
// spine is darker than any of the front, the zipper a little lighter than the front.
// The factors turn the Gold preset into the design's gold binder.
export function binderShades(color: string) {
  return {
    cover: [shade(color, 0.65), shade(color, 0.48), shade(color, 0.3)],
    spine: [shade(color, 0.24), shade(color, 0.4)],
    zip: shade(color, 0.8),
  }
}

export const binderCover = (color: string) => {
  const [a, b, c] = binderShades(color).cover
  return `linear-gradient(160deg, ${a} 0%, ${b} 55%, ${c} 100%)`
}

export const binderSpine = (color: string) => {
  const [a, b] = binderShades(color).spine
  return `linear-gradient(90deg, ${a}, ${b})`
}

// A stored color: a hex, or the name of a preset.
function toHex(stored: string) {
  if (isHex(stored)) return stored.toUpperCase()
  return (BINDER_PRESETS[stored as keyof typeof BINDER_PRESETS] ?? BINDER_PRESETS.gold).hex
}

export async function getBinders(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ id: string; name: string; color: string }>(
    'SELECT id, name, color FROM binders ORDER BY position',
  )
  return rows.map((r): Binder => ({ ...r, color: toHex(r.color) }))
}

// A new, empty binder after the others. Returns its id.
export async function createBinder(db: SQLiteDatabase, binder: { name: string; color: string }) {
  const id = `binder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  await db.runAsync(
    'INSERT INTO binders (id, name, color, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM binders))',
    id,
    binder.name,
    binder.color,
  )
  // The Binder screens reload on this (see db/version.ts).
  collectionChanged()
  return id
}

export async function updateBinder(db: SQLiteDatabase, id: string, changes: { name: string; color: string }) {
  await db.runAsync('UPDATE binders SET name = ?, color = ? WHERE id = ?', changes.name, changes.color, id)
  collectionChanged()
}

// Saves the order the user dragged the binders into.
export async function reorderBinders(db: SQLiteDatabase, ids: string[]) {
  await db.withTransactionAsync(async () => {
    for (const [position, id] of ids.entries()) {
      await db.runAsync('UPDATE binders SET position = ? WHERE id = ?', position, id)
    }
  })
  collectionChanged()
}

// Every copy in `fromId` goes to `toId`. A printing already there (same finish, condition and
// language) becomes one entry: quantities add up, a price paid and "for trade" are kept.
// Call inside a transaction.
async function moveCards(db: SQLiteDatabase, fromId: string, toId: string) {
  const same = 't.card_id = f.card_id AND t.finish = f.finish AND t.condition = f.condition AND t.language = f.language'
  await db.runAsync(
    `UPDATE collection AS t SET
       quantity = t.quantity + f.quantity,
       purchase_price = COALESCE(t.purchase_price, f.purchase_price),
       for_trade = MAX(t.for_trade, f.for_trade),
       traded = MAX(t.traded, f.traded)
     FROM collection AS f
     WHERE f.binder_id = ? AND t.binder_id = ? AND ${same}`,
    fromId,
    toId,
  )
  await db.runAsync(
    `DELETE FROM collection AS f
     WHERE f.binder_id = ? AND EXISTS (SELECT 1 FROM collection AS t WHERE t.binder_id = ? AND ${same})`,
    fromId,
    toId,
  )
  await db.runAsync('UPDATE collection SET binder_id = ? WHERE binder_id = ?', toId, fromId)
}

// Drag-and-drop merge: `fromId`'s cards go into `intoId`, and `fromId` is removed.
export async function mergeBinders(db: SQLiteDatabase, fromId: string, intoId: string) {
  await db.withTransactionAsync(async () => {
    await moveCards(db, fromId, intoId)
    await db.runAsync('DELETE FROM binders WHERE id = ?', fromId)
  })
  collectionChanged()
}

// Removes a binder only if no cards are in it (undoing "New binder" with picked cards).
export async function deleteEmptyBinder(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM binders WHERE id = ? AND NOT EXISTS (SELECT 1 FROM collection WHERE binder_id = ?)', id, id)
  collectionChanged()
}

// Removes a binder. Its cards move to `moveTo`, or are deleted with it when that's null.
// The last binder can't be removed: copies always need somewhere to go.
export async function deleteBinder(db: SQLiteDatabase, id: string, moveTo: string | null) {
  await db.withTransactionAsync(async () => {
    const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM binders')
    if ((count?.n ?? 0) <= 1) throw new Error('The last binder cannot be removed')
    if (moveTo) await moveCards(db, id, moveTo)
    else await db.runAsync('DELETE FROM collection WHERE binder_id = ?', id)
    await db.runAsync('DELETE FROM binders WHERE id = ?', id)
  })
  collectionChanged()
}
