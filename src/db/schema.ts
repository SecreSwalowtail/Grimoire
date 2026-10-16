import type { SQLiteDatabase } from 'expo-sqlite'

const DATABASE_VERSION = 8

// Passed to <SQLiteProvider onInit>. Runs on every launch: creates the tables on first launch,
// and applies migrations for users who already have an older database.
// Never edit a released step - add a new `if (version === N)` block and bump DATABASE_VERSION.
export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  // Foreign keys are off by default for every new connection, so enable them on every launch.
  await db.execAsync('PRAGMA foreign_keys = ON')

  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  let version = result?.user_version ?? 0
  // A development build briefly had version 6 without its step, so version 6 also gets the binders
  // whenever their table is missing.
  const hasBinders = await db.getFirstAsync("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'binders'")
  if (version >= DATABASE_VERSION && hasBinders) return

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
    `)
    version = 1
  }

  // Version 2 could end up set without its tables (a half-applied edit during development), so
  // version 3 creates the deck tables whenever they are missing.
  if (version === 1 || version === 2) {
    await db.execAsync(`
      -- Decks tab. Ids are made by the app (see utils/deck-store.ts); position is the order the
      -- user sees (creation order, copies right after their originals).
      CREATE TABLE IF NOT EXISTS deck_folders (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,                   -- key of FOLDER_COLORS, e.g. 'gold'
        sort TEXT NOT NULL DEFAULT 'custom' CHECK (sort IN ('custom', 'name', 'value')),
        pinned INTEGER NOT NULL DEFAULT 0,     -- 0 / 1
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        format TEXT NOT NULL,                  -- one of FORMATS, e.g. 'Modern'
        folder_id TEXT REFERENCES deck_folders (id) ON DELETE SET NULL,
        position INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS decks_folder ON decks (folder_id);
    `)
    version = 3
  }

  if (version === 3) {
    await db.execAsync(`
      -- Mana value, for a deck's average.
      ALTER TABLE cards ADD COLUMN cmc REAL;

      -- What a copy cost (per copy, in EUR) and whether it's up for trade.
      ALTER TABLE collection ADD COLUMN purchase_price REAL;
      ALTER TABLE collection ADD COLUMN for_trade INTEGER NOT NULL DEFAULT 0;

      -- The cards in each deck, per part of the deck. Kept in step by utils/deck-store.ts.
      CREATE TABLE IF NOT EXISTS deck_cards (
        deck_id TEXT NOT NULL REFERENCES decks (id),
        card_id TEXT NOT NULL REFERENCES cards (id),
        board TEXT NOT NULL CHECK (board IN ('main', 'side', 'maybe')),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        position INTEGER NOT NULL,
        PRIMARY KEY (deck_id, card_id, board)
      );
      CREATE INDEX IF NOT EXISTS deck_cards_card ON deck_cards (card_id);
    `)
    version = 4
  }

  if (version === 4) {
    await db.execAsync(`
      -- The whole Scryfall card as JSON, so Card detail opens owned and recently seen cards from the
      -- phone instead of waiting for Scryfall (and works offline).
      ALTER TABLE cards ADD COLUMN data TEXT;
    `)
    version = 5
  }

  if (version === 5 || (version === 6 && !hasBinders)) {
    // SQLite can't change a UNIQUE constraint in place, so the collection table is rebuilt: the same
    // printing can now be owned in several binders. Everything owned so far goes into the first
    // binder. One transaction, so a failure leaves the old table as it was.
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        -- Binder tab. Like deck folders: ids made by the app, position is the user's order.
        CREATE TABLE binders (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          color TEXT NOT NULL,                 -- "#RRGGBB", or a BINDER_PRESETS name, e.g. 'gold'
          position INTEGER NOT NULL
        );
        INSERT INTO binders (id, name, color, position) VALUES ('default', 'My binder', 'gold', 0);

        CREATE TABLE collection_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          binder_id TEXT NOT NULL DEFAULT 'default' REFERENCES binders (id),
          card_id TEXT NOT NULL REFERENCES cards (id),
          quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
          finish TEXT NOT NULL DEFAULT 'nonfoil' CHECK (finish IN ('nonfoil', 'foil', 'etched')),
          condition TEXT NOT NULL DEFAULT 'NM' CHECK (condition IN ('NM', 'LP', 'MP', 'HP', 'DMG')),
          language TEXT NOT NULL DEFAULT 'en',
          added_at INTEGER NOT NULL,
          purchase_price REAL,
          for_trade INTEGER NOT NULL DEFAULT 0,
          UNIQUE (binder_id, card_id, finish, condition, language)
        );
        INSERT INTO collection_new (id, card_id, quantity, finish, condition, language, added_at, purchase_price, for_trade)
          SELECT id, card_id, quantity, finish, condition, language, added_at, purchase_price, for_trade FROM collection;
        DROP TABLE collection;
        ALTER TABLE collection_new RENAME TO collection;
        CREATE INDEX collection_card ON collection (card_id);
        CREATE INDEX collection_binder ON collection (binder_id);
      `)
    })
    version = 6
  }

  if (version === 6) {
    await db.execAsync(`
      -- The deck's commander(s): a card of the main deck marked as such (two for partners).
      ALTER TABLE deck_cards ADD COLUMN commander INTEGER NOT NULL DEFAULT 0;
    `)
    version = 7
  }

  if (version === 7) {
    await db.execAsync(`
      -- Copies got in a trade (as opposed to bought or opened).
      ALTER TABLE collection ADD COLUMN traded INTEGER NOT NULL DEFAULT 0;
    `)
    version = 8
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`)
}
