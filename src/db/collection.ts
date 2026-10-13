import type { SQLiteDatabase } from 'expo-sqlite';

import { upsertCard } from '@/db/cards';
import type { ScryfallCard } from '@/db/scryfall';

export type Finish = 'nonfoil' | 'foil' | 'etched';
export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

export type CopyOptions = {
  quantity?: number;
  finish?: Finish;
  condition?: Condition;
  language?: string;
};

export type CollectionEntry = {
  id: number;
  card_id: string;
  quantity: number;
  finish: Finish;
  condition: Condition;
  language: string;
  added_at: number;
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

// Add copies of a card. If the same card + finish + condition + language is already owned,
// the quantity is increased instead. Saves/refreshes the card data too.
// Not wrapped in a transaction: call it inside db.withTransactionAsync() when adding many.
export async function addToCollection(db: SQLiteDatabase, card: ScryfallCard, options: CopyOptions = {}) {
  await upsertCard(db, card);
  const result = await db.runAsync(
    `INSERT INTO collection (card_id, quantity, finish, condition, language, added_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (card_id, finish, condition, language) DO UPDATE SET quantity = quantity + excluded.quantity`,
    card.id,
    options.quantity ?? 1,
    options.finish ?? 'nonfoil',
    options.condition ?? 'NM',
    options.language ?? card.lang ?? 'en',
    Date.now(),
  );
  return result.lastInsertRowId;
}

// Undo an addToCollection(): take one copy back off, removing the entry if it was the last.
// Pass the same card id and options that were added.
export async function removeOneCopy(db: SQLiteDatabase, cardId: string, options: CopyOptions = {}) {
  const key = [cardId, options.finish ?? 'nonfoil', options.condition ?? 'NM', options.language ?? 'en']
  const where = 'card_id = ? AND finish = ? AND condition = ? AND language = ?'
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM collection WHERE ${where} AND quantity <= 1`, ...key)
    await db.runAsync(`UPDATE collection SET quantity = quantity - 1 WHERE ${where} AND quantity > 1`, ...key)
  })
}

// Change the quantity of an entry; 0 or less removes it.
export async function setQuantity(db: SQLiteDatabase, entryId: number, quantity: number) {
  if (quantity <= 0) {
    await db.runAsync('DELETE FROM collection WHERE id = ?', entryId);
  } else {
    await db.runAsync('UPDATE collection SET quantity = ? WHERE id = ?', quantity, entryId);
  }
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
  return db.getAllAsync<{ card_id: string; price_eur: number | null; price_eur_foil: number | null }>(
    `SELECT h.card_id, h.price_eur, h.price_eur_foil
     FROM price_history h
     WHERE h.card_id IN (SELECT card_id FROM collection)
       AND h.date = (SELECT MAX(date) FROM price_history
                     WHERE card_id = h.card_id AND date <= date('now', ?))`,
    `-${days} days`,
  )
}

export async function getCollection(db: SQLiteDatabase) {
  return db.getAllAsync<CollectionEntry>(
    `SELECT collection.*, cards.name, cards.set_code, cards.set_name, cards.collector_number, cards.rarity,
            cards.colors, cards.image_uri, cards.price_eur, cards.price_eur_foil, cards.price_usd, cards.price_usd_foil
     FROM collection JOIN cards ON cards.id = collection.card_id
     ORDER BY collection.added_at DESC`,
  );
}
