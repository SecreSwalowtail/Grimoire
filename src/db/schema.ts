import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 1;

// Passed to <SQLiteProvider onInit>. Runs on every launch: creates the tables on first launch,
// and applies migrations for users who already have an older database.
// Never edit a released step - add a new `if (version === N)` block and bump DATABASE_VERSION.
export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  // Foreign keys are off by default for every new connection, so enable them on every launch.
  await db.execAsync('PRAGMA foreign_keys = ON');

  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = result?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      -- Local copy of Scryfall data for every card the user has touched (owned, wishlisted, imported).
      CREATE TABLE cards (
        id TEXT PRIMARY KEY NOT NULL,          -- Scryfall card id
        name TEXT NOT NULL,
        set_code TEXT NOT NULL,
        set_name TEXT NOT NULL,
        collector_number TEXT NOT NULL,
        rarity TEXT NOT NULL,
        lang TEXT NOT NULL,
        type_line TEXT,
        colors TEXT NOT NULL DEFAULT '[]',     -- JSON array, e.g. ["U","R"]
        image_uri TEXT,
        price_eur REAL,
        price_eur_foil REAL,
        price_usd REAL,
        price_usd_foil REAL,
        updated_at INTEGER NOT NULL            -- ms since epoch
      );
      CREATE INDEX cards_set_number ON cards (set_code, collector_number);
      CREATE INDEX cards_name ON cards (name);

      -- What the user owns. One row per card + finish + condition + language.
      CREATE TABLE collection (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id TEXT NOT NULL REFERENCES cards (id),
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        finish TEXT NOT NULL DEFAULT 'nonfoil' CHECK (finish IN ('nonfoil', 'foil', 'etched')),
        condition TEXT NOT NULL DEFAULT 'NM' CHECK (condition IN ('NM', 'LP', 'MP', 'HP', 'DMG')),
        language TEXT NOT NULL DEFAULT 'en',
        added_at INTEGER NOT NULL,
        UNIQUE (card_id, finish, condition, language)
      );
      CREATE INDEX collection_card ON collection (card_id);

      CREATE TABLE wishlist (
        card_id TEXT PRIMARY KEY NOT NULL REFERENCES cards (id),
        target_price REAL,
        added_at INTEGER NOT NULL
      );

      -- One price snapshot per card per day; Scryfall only gives today's price.
      CREATE TABLE price_history (
        card_id TEXT NOT NULL REFERENCES cards (id),
        date TEXT NOT NULL,                    -- YYYY-MM-DD
        price_eur REAL,
        price_eur_foil REAL,
        price_usd REAL,
        price_usd_foil REAL,
        PRIMARY KEY (card_id, date)
      );
    `);
    version = 1;
  }

  // if (version === 1) {
  //   await db.execAsync(`ALTER TABLE ...`);
  //   version = 2;
  // }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
