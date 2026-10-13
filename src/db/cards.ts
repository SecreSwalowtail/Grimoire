import type { SQLiteDatabase } from 'expo-sqlite';

import { cardColors, cardImage, type ScryfallCard } from '@/db/scryfall';

const price = (value: string | null) => (value == null ? null : Number(value));
const today = () => new Date().toISOString().slice(0, 10);

// Insert or refresh a card from Scryfall, and record today's price snapshot.
export async function upsertCard(db: SQLiteDatabase, card: ScryfallCard) {
  const now = Date.now();
  const prices = [
    price(card.prices.eur),
    price(card.prices.eur_foil),
    price(card.prices.usd),
    price(card.prices.usd_foil),
  ];
  await db.runAsync(
    `INSERT INTO cards (id, name, set_code, set_name, collector_number, rarity, lang, type_line, colors, image_uri,
                        price_eur, price_eur_foil, price_usd, price_usd_foil, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name, set_code = excluded.set_code, set_name = excluded.set_name,
       collector_number = excluded.collector_number, rarity = excluded.rarity, lang = excluded.lang,
       type_line = excluded.type_line, colors = excluded.colors, image_uri = excluded.image_uri,
       price_eur = excluded.price_eur, price_eur_foil = excluded.price_eur_foil,
       price_usd = excluded.price_usd, price_usd_foil = excluded.price_usd_foil,
       updated_at = excluded.updated_at`,
    card.id, card.name, card.set, card.set_name, card.collector_number, card.rarity, card.lang,
    card.type_line ?? null, JSON.stringify(cardColors(card)), cardImage(card), ...prices, now,
  );
  await db.runAsync(
    `INSERT INTO price_history (card_id, date, price_eur, price_eur_foil, price_usd, price_usd_foil)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (card_id, date) DO UPDATE SET
       price_eur = excluded.price_eur, price_eur_foil = excluded.price_eur_foil,
       price_usd = excluded.price_usd, price_usd_foil = excluded.price_usd_foil`,
    card.id, today(), ...prices,
  );
}
