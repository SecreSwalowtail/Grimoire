import type { SQLiteDatabase } from 'expo-sqlite';

import { FIRST_BINDER_SQL } from '@/db/binders';
import { upsertCard } from '@/db/cards';
import type { ScryfallCard } from '@/db/scryfall';
import { collectionChanged } from '@/db/version';

export type Finish = 'nonfoil' | 'foil' | 'etched';
export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

export type CopyOptions = {
  // Binder the copies go in; the first binder (in the user's order) when not given.
  binderId?: string;
  quantity?: number;
  finish?: Finish;
  condition?: Condition;
  language?: string;
  // Price paid per copy, in EUR.
  purchasePrice?: number | null;
  forTrade?: boolean;
};

export type CollectionEntry = {
  id: number;
  binder_id: string;
  card_id: string;
  quantity: number;
  finish: Finish;
  condition: Condition;
  language: string;
  added_at: number;
  purchase_price: number | null;
  for_trade: number;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  colors: string;
  image_uri: string | null;
  price_eur: number | null;
  price_eur_foil: number | null;
  price_usd: number | null;
  price_usd_foil: number | null;
};

// Add copies of a card. If the same card + finish + condition + language is already in the binder,
// the quantity is increased instead (keeping its price paid if it has one). Saves/refreshes the
// card data too.
// Not wrapped in a transaction: call it inside db.withTransactionAsync() when adding many.
export async function addToCollection(db: SQLiteDatabase, card: ScryfallCard, options: CopyOptions = {}) {
  await upsertCard(db, card);
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
  );
  collectionChanged();
  return result.lastInsertRowId;
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
  collectionChanged();
}

// Change the quantity of an entry; 0 or less removes it.
export async function setQuantity(db: SQLiteDatabase, entryId: number, quantity: number) {
  if (quantity <= 0) {
    await db.runAsync('DELETE FROM collection WHERE id = ?', entryId);
  } else {
    await db.runAsync('UPDATE collection SET quantity = ? WHERE id = ?', quantity, entryId);
  }
  collectionChanged();
}

// Price of one copy of an entry in EUR, using the foil price for foil/etched copies.
// Falls back to the other price when Scryfall only has one (e.g. foil-only printings).
export function entryPrice(entry: Pick<CollectionEntry, 'finish' | 'price_eur' | 'price_eur_foil'>) {
  return entry.finish === 'nonfoil'
    ? entry.price_eur ?? entry.price_eur_foil
    : entry.price_eur_foil ?? entry.price_eur
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

const ENTRY_COLUMNS = `collection.*, cards.name, cards.set_code, cards.set_name, cards.collector_number, cards.rarity,
            cards.colors, cards.image_uri, cards.price_eur, cards.price_eur_foil, cards.price_usd, cards.price_usd_foil`;

export async function getCollection(db: SQLiteDatabase) {
  return db.getAllAsync<CollectionEntry>(
    `SELECT ${ENTRY_COLUMNS}
     FROM collection JOIN cards ON cards.id = collection.card_id
     ORDER BY collection.added_at DESC`,
  );
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
  );
}

export type EntryChanges = {
  // Moves the copy to this binder.
  binderId: string;
  quantity: number;
  finish: Finish;
  condition: Condition;
  language: string;
  purchasePrice: number | null;
  forTrade: boolean;
};

// Edit a copy (and move it to another binder). If it now matches another entry of the same printing
// in that binder (same finish, condition and language), the two become one: quantities add up, the
// other's price paid is kept if this has none.
export async function updateEntry(db: SQLiteDatabase, entryId: number, changes: EntryChanges) {
  await db.withTransactionAsync(async () => {
    const entry = await db.getFirstAsync<{ card_id: string }>('SELECT card_id FROM collection WHERE id = ?', entryId);
    if (!entry) return;
    const twin = await db.getFirstAsync<{ id: number; quantity: number; purchase_price: number | null }>(
      `SELECT id, quantity, purchase_price FROM collection
       WHERE binder_id = ? AND card_id = ? AND finish = ? AND condition = ? AND language = ? AND id != ?`,
      changes.binderId, entry.card_id, changes.finish, changes.condition, changes.language, entryId,
    );
    if (twin) {
      await db.runAsync('DELETE FROM collection WHERE id = ?', entryId);
      await db.runAsync(
        'UPDATE collection SET quantity = ?, purchase_price = ?, for_trade = ? WHERE id = ?',
        twin.quantity + changes.quantity, changes.purchasePrice ?? twin.purchase_price, changes.forTrade ? 1 : 0, twin.id,
      );
    } else {
      await db.runAsync(
        `UPDATE collection SET binder_id = ?, quantity = ?, finish = ?, condition = ?, language = ?, purchase_price = ?,
           for_trade = ?
         WHERE id = ?`,
        changes.binderId,
        changes.quantity, changes.finish, changes.condition, changes.language, changes.purchasePrice, changes.forTrade ? 1 : 0, entryId,
      );
    }
  });
  collectionChanged();
}

export async function removeEntry(db: SQLiteDatabase, entryId: number) {
  await db.runAsync('DELETE FROM collection WHERE id = ?', entryId);
  collectionChanged();
}

export type PricePoint = {
  date: string; // YYYY-MM-DD
  price_eur: number | null;
  price_eur_foil: number | null;
  price_usd: number | null;
  price_usd_foil: number | null;
};

// The daily snapshots saved for one printing, oldest first (one a day it was opened or refreshed).
export async function getPriceHistory(db: SQLiteDatabase, cardId: string) {
  return db.getAllAsync<PricePoint>(
    'SELECT date, price_eur, price_eur_foil, price_usd, price_usd_foil FROM price_history WHERE card_id = ? ORDER BY date',
    cardId,
  );
}
