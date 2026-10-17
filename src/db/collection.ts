import type { SQLiteDatabase } from 'expo-sqlite'

import { ensureBinder, FIRST_BINDER_SQL } from '@/db/binders'
import { upsertCard } from '@/db/cards'
import type { ScryfallCard } from '@/db/scryfall'
import { collectionChanged } from '@/db/version'
import { euros } from '@/utils/card-prices'

export type Finish = 'nonfoil' | 'foil' | 'etched'
export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG'

type CopyOptions = {
  // Binder the copies go in; the first binder (in the user's order) when not given, a new one when
  // there are none.
  binderId?: string
  quantity?: number
  finish?: Finish
  condition?: Condition
  language?: string
  // Price paid per copy, in EUR.
  purchasePrice?: number | null
  forTrade?: boolean
}

export type CollectionEntry = {
  id: number
  binder_id: string
  card_id: string
  quantity: number
  finish: Finish
  condition: Condition
  language: string
  added_at: number
  purchase_price: number | null
  for_trade: number
  // 1: got in a trade.
  traded: number
  name: string
  set_code: string
  set_name: string
  collector_number: string
  rarity: string
  type_line: string | null
  cmc: number | null
  // JSON array of color letters, e.g. '["B","R"]'.
  colors: string
  image_uri: string | null
  price_eur: number | null
  price_eur_foil: number | null
  price_usd: number | null
  price_usd_foil: number | null
}

// Add copies of a card. If the same card + finish + condition + language is already in the binder,
// the quantity is increased instead (keeping its price paid if it has one). Saves/refreshes the
// card data too.
// Not wrapped in a transaction: call it inside db.withTransactionAsync() when adding many.
export async function addToCollection(db: SQLiteDatabase, card: ScryfallCard, options: CopyOptions = {}) {
  await upsertCard(db, card)
  if (!options.binderId) await ensureBinder(db)
  const result = await db.runAsync(
    `INSERT INTO collection (binder_id, card_id, quantity, finish, condition, language, purchase_price, for_trade, added_at)
     VALUES (COALESCE(?, ${FIRST_BINDER_SQL}), ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (binder_id, card_id, finish, condition, language) DO UPDATE SET
       quantity = quantity + excluded.quantity,
       purchase_price = COALESCE(purchase_price, excluded.purchase_price),
       for_trade = MAX(for_trade, excluded.for_trade)`,
    options.binderId ?? null,
    card.id,
    options.quantity ?? 1,
    options.finish ?? 'nonfoil',
    options.condition ?? 'NM',
    options.language ?? card.lang ?? 'en',
    options.purchasePrice ?? null,
    options.forTrade ? 1 : 0,
    Date.now(),
  )
  collectionChanged()
  return result.lastInsertRowId
}

// Undo an addToCollection(): take one copy back off, removing the entry if it was the last.
// Pass the same card id and options that were added.
export async function removeOneCopy(db: SQLiteDatabase, cardId: string, options: CopyOptions = {}) {
  const key = [options.binderId ?? null, cardId, options.finish ?? 'nonfoil', options.condition ?? 'NM', options.language ?? 'en']
  const where = `binder_id = COALESCE(?, ${FIRST_BINDER_SQL}) AND card_id = ? AND finish = ? AND condition = ? AND language = ?`
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM collection WHERE ${where} AND quantity <= 1`, ...key)
    await db.runAsync(`UPDATE collection SET quantity = quantity - 1 WHERE ${where} AND quantity > 1`, ...key)
  })
  collectionChanged()
}

// Change the quantity of an entry; 0 or less removes it.
export async function setQuantity(db: SQLiteDatabase, entryId: number, quantity: number) {
  if (quantity <= 0) {
    await db.runAsync('DELETE FROM collection WHERE id = ?', entryId)
  } else {
    await db.runAsync('UPDATE collection SET quantity = ? WHERE id = ?', quantity, entryId)
  }
  collectionChanged()
}

// Price of one copy of an entry in EUR, using the foil price for foil/etched copies. Falls back to
// the other finish's price when there's only one (e.g. foil-only printings), then to TCGplayer's in
// euros when Cardmarket has none (see euros).
export function entryPrice(entry: Pick<CollectionEntry, 'finish' | 'price_eur' | 'price_eur_foil'> & Partial<Pick<CollectionEntry, 'price_usd' | 'price_usd_foil'>>) {
  return euros(
    { eur: entry.price_eur, eurFoil: entry.price_eur_foil, usd: entry.price_usd ?? null, usdFoil: entry.price_usd_foil ?? null },
    entry.finish !== 'nonfoil',
  )
}

// The most recent price snapshot at least `days` days old, per owned card.
// Empty until the app has been recording prices for that long.
export async function getOwnedPricesDaysAgo(db: SQLiteDatabase, days: number) {
  // Newest snapshot per owned card first (one index lookup each), then its prices. About 3x faster
  // than checking every saved price row against a per-row subquery.
  return db.getAllAsync<{ card_id: string; price_eur: number | null; price_eur_foil: number | null }>(
    `SELECT h.card_id, h.price_eur, h.price_eur_foil
     FROM (SELECT p.card_id, MAX(p.date) AS date FROM price_history p
           WHERE p.card_id IN (SELECT card_id FROM collection) AND p.date <= date('now', ?)
           GROUP BY p.card_id) latest
     JOIN price_history h ON h.card_id = latest.card_id AND h.date = latest.date`,
    `-${days} days`,
  )
}

const ENTRY_COLUMNS = `collection.*, cards.name, cards.set_code, cards.set_name, cards.collector_number, cards.rarity, cards.type_line, cards.cmc,
            cards.colors, cards.image_uri, cards.price_eur, cards.price_eur_foil, cards.price_usd, cards.price_usd_foil`

export async function getCollection(db: SQLiteDatabase) {
  return db.getAllAsync<CollectionEntry>(
    `SELECT ${ENTRY_COLUMNS}
     FROM collection JOIN cards ON cards.id = collection.card_id
     ORDER BY collection.added_at DESC`,
  )
}

// Every owned copy of a card, in any printing. Scryfall names are unique per card (printings share
// the name, other cards never do), so the name finds them all.
export async function getCopiesOfCard(db: SQLiteDatabase, name: string) {
  return db.getAllAsync<CollectionEntry>(
    `SELECT ${ENTRY_COLUMNS}
     FROM collection JOIN cards ON cards.id = collection.card_id
     WHERE cards.name = ?
     ORDER BY collection.added_at`,
    name,
  )
}

type EntryChanges = {
  // Moves the copy to this binder.
  binderId: string
  // Another printing of the card (already saved with upsertCard); left out, it stays.
  cardId?: string
  quantity: number
  finish: Finish
  condition: Condition
  language: string
  purchasePrice: number | null
  forTrade: boolean
}

// Edit a copy (and move it to another binder, or make it another printing). If it now matches
// another entry of the same printing in that binder (same finish, condition and language), the two
// become one: quantities add up, the other's price paid is kept if this has none.
export async function updateEntry(db: SQLiteDatabase, entryId: number, changes: EntryChanges) {
  await db.withTransactionAsync(async () => {
    const entry = await db.getFirstAsync<{ card_id: string; traded: number }>('SELECT card_id, traded FROM collection WHERE id = ?', entryId)
    if (!entry) return
    const cardId = changes.cardId ?? entry.card_id
    const twin = await db.getFirstAsync<{ id: number; quantity: number; purchase_price: number | null; traded: number }>(
      `SELECT id, quantity, purchase_price, traded FROM collection
       WHERE binder_id = ? AND card_id = ? AND finish = ? AND condition = ? AND language = ? AND id != ?`,
      changes.binderId, cardId, changes.finish, changes.condition, changes.language, entryId,
    )
    if (twin) {
      await db.runAsync('DELETE FROM collection WHERE id = ?', entryId)
      await db.runAsync(
        'UPDATE collection SET quantity = ?, purchase_price = ?, for_trade = ?, traded = ? WHERE id = ?',
        twin.quantity + changes.quantity, changes.purchasePrice ?? twin.purchase_price, changes.forTrade ? 1 : 0, Math.max(twin.traded, entry.traded), twin.id,
      )
    } else {
      await db.runAsync(
        `UPDATE collection SET binder_id = ?, card_id = ?, quantity = ?, finish = ?, condition = ?, language = ?, purchase_price = ?,
           for_trade = ?
         WHERE id = ?`,
        changes.binderId,
        cardId,
        changes.quantity, changes.finish, changes.condition, changes.language, changes.purchasePrice, changes.forTrade ? 1 : 0, entryId,
      )
    }
  })
  collectionChanged()
}

export async function removeEntry(db: SQLiteDatabase, entryId: number) {
  await db.runAsync('DELETE FROM collection WHERE id = ?', entryId)
  collectionChanged()
}

// A copy's row as saved, to put it back after removeEntries().
type EntryRow = {
  id: number
  binder_id: string
  card_id: string
  quantity: number
  finish: Finish
  condition: Condition
  language: string
  added_at: number
  purchase_price: number | null
  for_trade: number
  traded: number
}

const placeholders = (n: number) => Array<string>(n).fill('?').join(', ')

// Removes entries (every copy of each) and returns them as they were, for restoreEntries().
export async function removeEntries(db: SQLiteDatabase, ids: number[]) {
  let rows: EntryRow[] = []
  if (ids.length === 0) return rows
  const list = placeholders(ids.length)
  await db.withTransactionAsync(async () => {
    rows = await db.getAllAsync<EntryRow>(
      `SELECT id, binder_id, card_id, quantity, finish, condition, language, added_at, purchase_price, for_trade, traded
       FROM collection WHERE id IN (${list})`,
      ...ids,
    )
    await db.runAsync(`DELETE FROM collection WHERE id IN (${list})`, ...ids)
  })
  collectionChanged()
  return rows
}

// Puts a saved row back, in the first binder if its own is gone. One that matches a copy added
// since (same printing, finish, condition and language in that binder) adds up with it.
// Call inside a transaction.
async function insertRow(db: SQLiteDatabase, r: EntryRow) {
  await ensureBinder(db)
  await db.runAsync(
    `INSERT INTO collection (id, binder_id, card_id, quantity, finish, condition, language, added_at, purchase_price, for_trade, traded)
     VALUES (?, COALESCE((SELECT id FROM binders WHERE id = ?), ${FIRST_BINDER_SQL}), ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (binder_id, card_id, finish, condition, language) DO UPDATE SET
       quantity = quantity + excluded.quantity,
       purchase_price = COALESCE(purchase_price, excluded.purchase_price),
       for_trade = MAX(for_trade, excluded.for_trade),
       traded = MAX(traded, excluded.traded)`,
    r.id, r.binder_id, r.card_id, r.quantity, r.finish, r.condition, r.language, r.added_at, r.purchase_price, r.for_trade, r.traded,
  )
}

// Puts removed entries back as they were (see insertRow).
export async function restoreEntries(db: SQLiteDatabase, rows: EntryRow[]) {
  await db.withTransactionAsync(async () => {
    for (const r of rows) await insertRow(db, r)
  })
  collectionChanged()
}

// Changes made to many copies at once; what's left out stays as each copy has it.
// `traded`: got in a trade. `purchasePrice` null: no price. `cardId`: another printing of the card
// (already saved with upsertCard).
export type CopyEdits = { condition?: Condition; finish?: Finish; traded?: boolean; purchasePrice?: number | null; cardId?: string }

type Place = Pick<CollectionEntry, 'binder_id' | 'card_id'>

// Every row of these printings in these binders: an edit can merge copies into others there.
const placesSql = (places: Place[]) => ({
  where: `(binder_id, card_id) IN (VALUES ${places.map(() => '(?, ?)').join(', ')})`,
  args: places.flatMap((p) => [p.binder_id, p.card_id]),
})

// Edits copies. A copy whose new printing, condition or finish matches another entry of that
// printing in its binder (same language too) becomes one with it: quantities add up. Returns the
// undo, which puts back those printings' rows in those binders (the new printing's too) exactly as
// they were.
export async function editEntries(db: SQLiteDatabase, entries: (Place & { id: number })[], edits: CopyEdits) {
  if (entries.length === 0) return async () => undefined
  const newCard = edits.cardId
  const { where, args } = placesSql(newCard ? [...entries, ...entries.map((e) => ({ ...e, card_id: newCard }))] : entries)
  let before: EntryRow[] = []
  await db.withTransactionAsync(async () => {
    before = await db.getAllAsync<EntryRow>(
      `SELECT id, binder_id, card_id, quantity, finish, condition, language, added_at, purchase_price, for_trade, traded
       FROM collection WHERE ${where}`,
      ...args,
    )
    for (const { id } of entries) {
      const e = await db.getFirstAsync<EntryRow>('SELECT * FROM collection WHERE id = ?', id)
      if (!e) continue
      const cardId = newCard ?? e.card_id
      const condition = edits.condition ?? e.condition
      const finish = edits.finish ?? e.finish
      const paid = edits.purchasePrice !== undefined ? edits.purchasePrice : e.purchase_price
      const traded = edits.traded !== undefined ? (edits.traded ? 1 : 0) : e.traded
      const twin =
        cardId === e.card_id && condition === e.condition && finish === e.finish
          ? null
          : await db.getFirstAsync<{ id: number; purchase_price: number | null; for_trade: number; traded: number }>(
              `SELECT id, purchase_price, for_trade, traded FROM collection
               WHERE binder_id = ? AND card_id = ? AND finish = ? AND condition = ? AND language = ? AND id != ?`,
              e.binder_id, cardId, finish, condition, e.language, e.id,
            )
      if (twin) {
        await db.runAsync('DELETE FROM collection WHERE id = ?', e.id)
        await db.runAsync(
          'UPDATE collection SET quantity = quantity + ?, purchase_price = ?, for_trade = ?, traded = ? WHERE id = ?',
          e.quantity,
          edits.purchasePrice !== undefined ? edits.purchasePrice : twin.purchase_price ?? e.purchase_price,
          Math.max(twin.for_trade, e.for_trade),
          edits.traded !== undefined ? traded : Math.max(twin.traded, e.traded),
          twin.id,
        )
      } else {
        await db.runAsync(
          'UPDATE collection SET card_id = ?, condition = ?, finish = ?, purchase_price = ?, traded = ? WHERE id = ?',
          cardId, condition, finish, paid, traded, e.id,
        )
      }
    }
  })
  collectionChanged()
  return async () => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(`DELETE FROM collection WHERE ${where}`, ...args)
      for (const r of before) await insertRow(db, r)
    })
    collectionChanged()
  }
}

// Moves entries to another binder. A printing already there (same finish, condition and language)
// becomes one entry: quantities add up, a price paid and "for trade" are kept.
export async function moveEntries(db: SQLiteDatabase, ids: number[], toId: string) {
  if (ids.length === 0) return
  const list = placeholders(ids.length)
  const twin = `t.binder_id = ? AND t.id != f.id AND t.card_id = f.card_id AND t.finish = f.finish
                AND t.condition = f.condition AND t.language = f.language`
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE collection AS t SET
         quantity = t.quantity + f.quantity,
         purchase_price = COALESCE(t.purchase_price, f.purchase_price),
         for_trade = MAX(t.for_trade, f.for_trade),
         traded = MAX(t.traded, f.traded)
       FROM collection AS f
       WHERE f.id IN (${list}) AND ${twin}`,
      ...ids,
      toId,
    )
    await db.runAsync(
      `DELETE FROM collection AS f WHERE f.id IN (${list}) AND EXISTS (SELECT 1 FROM collection AS t WHERE ${twin})`,
      ...ids,
      toId,
    )
    await db.runAsync(`UPDATE collection SET binder_id = ? WHERE id IN (${list})`, toId, ...ids)
  })
  collectionChanged()
}

export type PricePoint = {
  date: string // YYYY-MM-DD
  price_eur: number | null
  price_eur_foil: number | null
  price_usd: number | null
  price_usd_foil: number | null
}

// The daily snapshots saved for one printing, oldest first (one a day it was opened or refreshed).
export async function getPriceHistory(db: SQLiteDatabase, cardId: string) {
  return db.getAllAsync<PricePoint>(
    'SELECT date, price_eur, price_eur_foil, price_usd, price_usd_foil FROM price_history WHERE card_id = ? ORDER BY date',
    cardId,
  )
}
