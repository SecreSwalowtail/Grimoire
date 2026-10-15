import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { upsertCard } from '@/db/cards';
import { getCardsByIdentifiers, type CardIdentifier, type ScryfallCard } from '@/db/scryfall';
import { commanderStatus } from '@/rules/commander';
import { addDeckCards, cardInfoOf, type Board } from '@/utils/deck-store';

// Decklists exported as text. Manabox writes "// SECTION" headers, then one "N Card Name" line per
// card, sometimes with "(SET) 123" after the name and "*F*" for foils.

export type DeckListRow = {
  line: number
  quantity: number
  name: string
  set: string | null
  number: string | null
  board: Board
  commander: boolean
}

// Sections that aren't the main deck. Commanders are main-deck cards marked as commander.
const SECTION_BOARD: Record<string, Board> = {
  sideboard: 'side',
  side: 'side',
  maybeboard: 'maybe',
  maybe: 'maybe',
  considering: 'maybe',
}

export function parseDeckList(text: string) {
  const rows: DeckListRow[] = []
  const skipped: { line: number; text: string }[] = []
  let board: Board = 'main'
  let commander = false
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    // A blank line ends the commander section (Manabox lists the commander, a blank line, then the deck).
    if (!line) {
      commander = false
      return
    }
    const section = /^(?:\/\/\s*)?([A-Za-z ]+?):?$/.exec(line)
    if (line.startsWith('//') || (section && !/^\d/.test(line))) {
      const name = (section?.[1] ?? line.replace(/^\/\/\s*/, '')).trim().toLowerCase()
      board = SECTION_BOARD[name] ?? 'main'
      commander = name === 'commander' || name === 'commanders'
      return
    }
    const m = /^(\d+)x?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)\s+(\S+))?(?:\s+\*[A-Z]+\*)*$/.exec(line)
    if (!m) {
      skipped.push({ line: i + 1, text: line })
      return
    }
    rows.push({ line: i + 1, quantity: Number(m[1]), name: m[2].trim(), set: m[3]?.toLowerCase() ?? null, number: m[4] ?? null, board, commander })
  })
  return { rows, skipped }
}

// The card a row asked for: by set and number when the file gives them, else by name (double-faced
// cards are often listed by their front face).
function findCard(cards: ScryfallCard[], row: DeckListRow) {
  if (row.set && row.number) {
    const exact = cards.find((c) => c.set === row.set && c.collector_number.toLowerCase() === row.number!.toLowerCase())
    if (exact) return exact
  }
  const name = row.name.toLowerCase()
  return cards.find((c) => c.name.toLowerCase() === name || c.name.toLowerCase().split(' // ')[0] === name)
}

export type DeckImportResult = {
  canceled: boolean
  fileName: string | null
  cards: number // different cards added
  copies: number
  failed: { line: number; name: string; reason: string }[]
}

// Lets the user pick a decklist file, looks its cards up on Scryfall, saves them on the phone and
// adds them to the deck (on top of what it holds).
export async function importDeckList(db: SQLiteDatabase, deckId: string): Promise<DeckImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['text/plain', '*/*'], copyToCacheDirectory: true })
  if (picked.canceled) return { canceled: true, fileName: null, cards: 0, copies: 0, failed: [] }
  const asset = picked.assets[0]
  const text = await new File(asset.uri).text()
  const { rows, skipped } = parseDeckList(text)
  const failed = skipped.map((s) => ({ line: s.line, name: s.text, reason: "Couldn't read this line" }))
  if (!rows.length) return { canceled: false, fileName: asset.name, cards: 0, copies: 0, failed }

  // Each card once in the request, even if the list names it in several sections.
  const identifiers = new Map<string, CardIdentifier>()
  for (const r of rows) {
    const id: CardIdentifier = r.set && r.number ? { set: r.set, collector_number: r.number } : { name: r.name }
    identifiers.set(JSON.stringify(id), id)
  }
  const { found } = await getCardsByIdentifiers([...identifiers.values()])

  const matches: { row: DeckListRow; card: ScryfallCard }[] = []
  for (const row of rows) {
    const card = findCard(found, row)
    if (card) matches.push({ row, card })
    else failed.push({ line: row.line, name: row.name, reason: 'Not found on Scryfall' })
  }

  await db.withTransactionAsync(async () => {
    for (const card of new Map(matches.map((m) => [m.card.id, m.card])).values()) await upsertCard(db, card)
  })
  let copies = 0
  for (const { row, card } of matches) {
    // Only a card that can lead (or a Background) is marked, whatever the file says.
    const leads = row.commander && commanderStatus(card).tone !== 'no'
    if (addDeckCards(deckId, card.id, cardInfoOf(card), row.board, row.quantity, leads)) copies += row.quantity
  }
  return { canceled: false, fileName: asset.name, cards: new Set(matches.map((m) => m.card.id)).size, copies, failed }
}
