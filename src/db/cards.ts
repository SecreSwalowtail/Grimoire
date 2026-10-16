import type { SQLiteDatabase } from 'expo-sqlite';

import { cardColors, cardImage, type ScryfallCard } from '@/db/scryfall';
import { collectionChanged } from '@/db/version';

const price = (value: string | null) => (value == null ? null : Number(value));
const today = () => new Date().toISOString().slice(0, 10);

// Insert or refresh a card from Scryfall (with its full data, for Card detail), and record today's
// price snapshot. If you own the card and its price moved, the Binder will reload.
export async function upsertCard(db: SQLiteDatabase, card: ScryfallCard) {
  const now = Date.now();
  const prices = [
    price(card.prices.eur),
    price(card.prices.eur_foil),
    price(card.prices.usd),
    price(card.prices.usd_foil),
  ];
  const before = await db.getFirstAsync<{ price_eur: number | null; price_eur_foil: number | null; owned: number }>(
    'SELECT price_eur, price_eur_foil, EXISTS (SELECT 1 FROM collection WHERE card_id = cards.id) AS owned FROM cards WHERE id = ?',
    card.id,
  );
  await db.runAsync(
    `INSERT INTO cards (id, name, set_code, set_name, collector_number, rarity, lang, type_line, colors, image_uri,
                        price_eur, price_eur_foil, price_usd, price_usd_foil, cmc, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name, set_code = excluded.set_code, set_name = excluded.set_name,
       collector_number = excluded.collector_number, rarity = excluded.rarity, lang = excluded.lang,
       type_line = excluded.type_line, colors = excluded.colors, image_uri = excluded.image_uri,
       price_eur = excluded.price_eur, price_eur_foil = excluded.price_eur_foil,
       price_usd = excluded.price_usd, price_usd_foil = excluded.price_usd_foil,
       cmc = excluded.cmc, data = excluded.data, updated_at = excluded.updated_at`,
    card.id, card.name, card.set, card.set_name, card.collector_number, card.rarity, card.lang,
    card.type_line ?? null, JSON.stringify(cardColors(card)), cardImage(card), ...prices, card.cmc ?? null,
    JSON.stringify(card), now,
  );
  await db.runAsync(
    `INSERT INTO price_history (card_id, date, price_eur, price_eur_foil, price_usd, price_usd_foil)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (card_id, date) DO UPDATE SET
       price_eur = excluded.price_eur, price_eur_foil = excluded.price_eur_foil,
       price_usd = excluded.price_usd, price_usd_foil = excluded.price_usd_foil`,
    card.id, today(), ...prices,
  );
  if (before?.owned && (before.price_eur !== prices[0] || before.price_eur_foil !== prices[1])) collectionChanged();
}

// What decks need to know about saved cards, with their full data (null when never saved with it).
export async function getCardRows(db: SQLiteDatabase, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    type_line: string | null;
    cmc: number | null;
    price_eur: number | null;
    price_eur_foil: number | null;
    image_uri: string | null;
    data: string | null;
  }>(
    `SELECT id, name, type_line, cmc, price_eur, price_eur_foil, image_uri, data FROM cards
     WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ...ids,
  );
  return rows.map(({ data, ...row }) => {
    let card: ScryfallCard | null = null;
    try {
      card = data ? (JSON.parse(data) as ScryfallCard) : null;
    } catch {}
    return { ...row, card };
  });
}

// A card saved on the phone, with when it was last refreshed. Null if it was never saved with its
// full data (cards saved before the app kept it get it the next time they're opened).
export async function getSavedCard(db: SQLiteDatabase, id: string) {
  const row = await db.getFirstAsync<{ data: string | null; updated_at: number }>('SELECT data, updated_at FROM cards WHERE id = ?', id);
  if (!row?.data) return null;
  try {
    return { card: JSON.parse(row.data) as ScryfallCard, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}
