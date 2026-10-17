import type { SQLiteDatabase } from 'expo-sqlite'

import { BINDER_PRESETS, ensureBinder, FIRST_BINDER_SQL } from '@/db/binders'
import { upsertCard } from '@/db/cards'
import { cardImage, searchCards, type ScryfallCard } from '@/db/scryfall'
import { collectionChanged } from '@/db/version'
import {
  addTestDecks,
  cardInfoOf,
  FOLDER_COLORS,
  FORMATS,
  resetDeckStore,
  type Board,
  type CardInfo,
  type Deck,
  type DeckCard,
  type FolderColor,
} from '@/utils/deck-store'

// Test data for the performance pass (Settings → Developer tools): ~2,000 real cards from
// Scryfall spread over your first binder and 3 test binders (about 1 in 5 foil, 30 days of price
// history), and 50 decks of 100-200 cards in 5 folders. Everything added is tracked in the
// `dev_seed` table (decks by their "seed-" ids), so seeding twice is caught. Developer tools →
// Clear database erases everything (yours too).

const CARD_COUNT = 2000
const DECKS = 50
const FOLDERS = 5
const HISTORY_DAYS = 30
const PREFIX = 'seed-'
const BINDERS = [
  { name: 'Trade Binder', color: BINDER_PRESETS.oxblood.hex },
  { name: 'Commander Pool', color: BINDER_PRESETS.plum.hex },
  { name: 'Bulk Rares', color: BINDER_PRESETS.slate.hex },
]

type SeedProgress = (text: string) => void

const random = (n: number) => Math.floor(Math.random() * n)
const pick = <T,>(list: readonly T[]) => list[random(list.length)]
const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)

async function ensureTable(db: SQLiteDatabase) {
  await db.execAsync('CREATE TABLE IF NOT EXISTS dev_seed (kind TEXT NOT NULL, ref TEXT NOT NULL)')
}

export async function hasTestData(db: SQLiteDatabase) {
  await ensureTable(db)
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM dev_seed')
  return (row?.n ?? 0) > 0
}

export async function seedTestData(db: SQLiteDatabase, progress: SeedProgress) {
  await ensureTable(db)

  // 1. Real printings, newest first, without basic lands (they'd be a tenth of the list).
  const cards: ScryfallCard[] = []
  for (let page = 1; cards.length < CARD_COUNT && page <= 16; page++) {
    progress(`Fetching cards from Scryfall… ${cards.length} / ${CARD_COUNT}`)
    const res = await searchCards('game:paper lang:en -t:basic', { order: 'released', dir: 'desc', unique: 'prints', page })
    cards.push(...res.data.filter((c) => cardImage(c) != null))
    if (!res.has_more) break
  }
  const seeded = cards.slice(0, CARD_COUNT)

  // 2. Into the binder. ON CONFLICT DO NOTHING: a copy you already own is left alone (and not
  // recorded, so removing test data never touches it).
  await ensureBinder(db)
  const first = await db.getFirstAsync<{ id: string }>(`SELECT ${FIRST_BINDER_SQL} AS id`)
  const binderIds = [first?.id ?? 'default', ...BINDERS.map((_, i) => `${PREFIX}binder-${i}`)]
  await db.withTransactionAsync(async () => {
    for (const [i, b] of BINDERS.entries()) {
      await db.runAsync(
        'INSERT OR IGNORE INTO binders (id, name, color, position) VALUES (?, ?, ?, (SELECT MAX(position) + 1 FROM binders))',
        binderIds[i + 1], b.name, b.color,
      )
    }
    for (const [i, card] of seeded.entries()) {
      if (i % 100 === 0) progress(`Adding to your binder… ${i} / ${seeded.length}`)
      await upsertCard(db, card)
      const finishes = card.finishes ?? ['nonfoil']
      const foil = finishes.includes('foil') && (!finishes.includes('nonfoil') || Math.random() < 0.2)
      const finish = foil ? 'foil' : finishes.includes('nonfoil') ? 'nonfoil' : finishes[0]
      const result = await db.runAsync(
        `INSERT INTO collection (binder_id, card_id, quantity, finish, condition, language, added_at)
         VALUES (?, ?, ?, ?, ?, 'en', ?)
         ON CONFLICT (binder_id, card_id, finish, condition, language) DO NOTHING`,
        pick(binderIds),
        card.id,
        1 + random(3),
        finish,
        pick(['NM', 'NM', 'NM', 'LP', 'MP']),
        Date.now() - i * 60000,
      )
      if (result.changes > 0) await db.runAsync("INSERT INTO dev_seed (kind, ref) VALUES ('entry', ?)", String(result.lastInsertRowId))
    }
  })

  // 3. Price history: a random walk back from today's price, only for cards that had none.
  progress('Writing price history…')
  const fresh = await db.getAllAsync<{ card_id: string; price_eur: number | null; price_eur_foil: number | null }>(
    `SELECT id AS card_id, price_eur, price_eur_foil FROM cards
     WHERE id IN (${seeded.map(() => '?').join(',')})
       AND NOT EXISTS (SELECT 1 FROM price_history h WHERE h.card_id = cards.id AND h.date < ?)`,
    ...seeded.map((c) => c.id),
    day(0),
  )
  const rows: string[] = []
  for (const card of fresh) {
    let eur = card.price_eur
    let foil = card.price_eur_foil
    for (let d = 1; d <= HISTORY_DAYS; d++) {
      eur = eur == null ? null : Math.max(0.02, eur * (1 + (Math.random() - 0.5) * 0.06))
      foil = foil == null ? null : Math.max(0.02, foil * (1 + (Math.random() - 0.5) * 0.06))
      rows.push(`('${card.card_id}', '${day(d)}', ${eur?.toFixed(2) ?? 'NULL'}, ${foil?.toFixed(2) ?? 'NULL'}, NULL, NULL)`)
    }
  }
  // Ids and dates are Scryfall UUIDs and ISO dates, safe to write into the statement.
  for (let i = 0; i < rows.length; i += 500) {
    await db.execAsync(
      `INSERT OR IGNORE INTO price_history (card_id, date, price_eur, price_eur_foil, price_usd, price_usd_foil) VALUES ${rows.slice(i, i + 500).join(',')}`,
    )
  }
  for (let i = 0; i < fresh.length; i += 500) {
    await db.execAsync(
      `INSERT INTO dev_seed (kind, ref) VALUES ${fresh.slice(i, i + 500).map((c) => `('history', '${c.card_id}')`).join(',')}`,
    )
  }

  // 4. Folders and decks of 100-200 cards (Commander decks: singletons).
  progress('Building decks…')
  const colors = Object.keys(FOLDER_COLORS) as FolderColor[]
  const folders = Array.from({ length: FOLDERS }, (_, i) => ({
    id: `${PREFIX}folder-${i}`,
    name: `Test folder ${i + 1}`,
    color: colors[i % colors.length],
    sort: 'custom' as const,
    pinned: false,
  }))
  const info: Record<string, CardInfo> = {}
  for (const card of seeded) info[card.id] = cardInfoOf(card)
  const decks: Deck[] = []
  const deckCards: DeckCard[] = []
  for (let i = 0; i < DECKS; i++) {
    const id = `${PREFIX}deck-${i}`
    const format = pick(FORMATS)
    decks.push({ id, name: `Test deck ${i + 1}`, format, folderId: Math.random() < 0.6 ? pick(folders).id : null })
    const target = 100 + random(101)
    const used = new Set<string>()
    let total = 0
    const add = (board: Board, max: number) => {
      const card = pick(seeded)
      if (used.has(`${card.id}${board}`)) return
      used.add(`${card.id}${board}`)
      const quantity = format === 'Commander' ? 1 : 1 + random(max)
      total += quantity
      deckCards.push({ id: `${id}|${card.id}|${board}`, deckId: id, cardId: card.id, board, quantity })
    }
    while (total < target - 20) add('main', 4)
    for (let k = 0; k < 10; k++) add('side', 2)
    for (let k = 0; k < 5; k++) add('maybe', 1)
  }
  addTestDecks({ folders, decks, cards: deckCards, info })
  collectionChanged()
  progress(`Done: ${seeded.length} cards, ${DECKS} decks with ${deckCards.length} card rows.`)
}

// Erases everything the app has saved: binders (back to one empty "My binder"), decks and
// folders, saved cards, price history and test data. Children go before the tables they point at,
// so the foreign keys hold. VACUUM then gives the space back.
export async function clearDatabase(db: SQLiteDatabase) {
  await ensureTable(db)
  await db.withTransactionAsync(async () => {
    for (const table of ['deck_cards', 'decks', 'deck_folders', 'collection', 'wishlist', 'price_history', 'cards', 'dev_seed']) {
      await db.runAsync(`DELETE FROM ${table}`)
    }
    // New copies always need somewhere to go.
    await db.runAsync('DELETE FROM binders')
    await db.runAsync("INSERT INTO binders (id, name, color, position) VALUES ('default', 'My binder', 'gold', 0)")
  })
  await db.execAsync('VACUUM')
  resetDeckStore()
  collectionChanged()
}
