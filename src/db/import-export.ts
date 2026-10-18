import * as DocumentPicker from 'expo-document-picker'
import { Directory, File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import type { SQLiteDatabase } from 'expo-sqlite'

import { getBinders, type Binder } from '@/db/binders'
import { addToCollection, getCollection, type CollectionEntry, type Condition, type Finish } from '@/db/collection'
import { parseCsv, toCsv } from '@/db/csv'
import { parseDeckList } from '@/db/deck-import'
import { getCardsByIdentifiers, type CardIdentifier, type ScryfallCard } from '@/db/scryfall'
import { getDeckStore, type Board, type Deck } from '@/utils/deck-store'
import { toEurFrom } from '@/utils/money'

// CSV columns follow Moxfield's collection export, plus the Scryfall id (the exact printing, which
// Manabox reads), the price paid and the binder, so files move between apps.
const HEADER = ['Count', 'Name', 'Edition', 'Collector Number', 'Foil', 'Condition', 'Language', 'Purchase Price', 'Purchase Price Currency', 'Scryfall ID']

const CONDITION_NAMES: Record<Condition, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese',
  ja: 'Japanese', ko: 'Korean', ru: 'Russian', zhs: 'Chinese Simplified', zht: 'Chinese Traditional',
}

// ---------- Export ----------

// Copies as CSV. `binders`: adds a "Binder Name" column (Manabox's name for it), for files holding
// several binders.
function collectionCsv(entries: CollectionEntry[], binders?: Binder[]) {
  const binderName = new Map(binders?.map((b) => [b.id, b.name]))
  const rows = entries.map((e) => {
    const row: (string | number)[] = [
      e.quantity,
      e.name,
      e.set_code,
      e.collector_number,
      e.finish === 'nonfoil' ? '' : e.finish,
      CONDITION_NAMES[e.condition],
      LANGUAGE_NAMES[e.language] ?? e.language,
      e.purchase_price ?? '',
      e.purchase_price == null ? '' : 'EUR',
      e.card_id,
    ]
    return binders ? [binderName.get(e.binder_id) ?? '', ...row] : row
  })
  return toCsv([binders ? ['Binder Name', ...HEADER] : HEADER, ...rows])
}

const BOARD_SECTIONS: [Board, string][] = [['main', 'Deck'], ['side', 'Sideboard'], ['maybe', 'Maybeboard']]

// A deck as text, in Arena's layout ("Commander", "Deck", "Sideboard" sections; one
// "N Card Name (SET) 123" line per printing), which Manabox, Moxfield, Archidekt and Arena read.
async function deckText(db: SQLiteDatabase, deck: Deck) {
  const { cards, info } = getDeckStore()
  const lines = cards.filter((c) => c.deckId === deck.id && c.quantity > 0)
  const ids = [...new Set(lines.map((c) => c.cardId))]
  const printings = new Map<string, { set_code: string; collector_number: string }>()
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500)
    const rows = await db.getAllAsync<{ id: string; set_code: string; collector_number: string }>(
      `SELECT id, set_code, collector_number FROM cards WHERE id IN (${batch.map(() => '?').join(',')})`,
      batch,
    )
    for (const r of rows) printings.set(r.id, r)
  }
  const line = (cardId: string, quantity: number) => {
    const name = info[cardId]?.name ?? 'Unknown card'
    const p = printings.get(cardId)
    return p ? `${quantity} ${name} (${p.set_code.toUpperCase()}) ${p.collector_number}` : `${quantity} ${name}`
  }

  const sections: string[] = []
  const commanders = lines.filter((c) => c.commander)
  if (commanders.length) sections.push(['Commander', ...commanders.map((c) => line(c.cardId, c.quantity))].join('\n'))
  for (const [board, title] of BOARD_SECTIONS) {
    const part = lines.filter((c) => c.board === board && !c.commander)
    if (part.length) sections.push([title, ...part.map((c) => line(c.cardId, c.quantity))].join('\n'))
  }
  return sections.join('\n\n') + '\n'
}

// A name that's safe as a file name on any phone or computer.
const fileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Untitled'
const today = () => new Date().toISOString().slice(0, 10)

// Writes `text` to a file in the cache folder and opens the share sheet for it.
async function share(name: string, text: string, kind: 'csv' | 'txt', title: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device')
  const file = new File(Paths.cache, `${fileName(name)}.${kind}`)
  file.create({ overwrite: true })
  file.write(text)
  await Sharing.shareAsync(
    file.uri,
    kind === 'csv'
      ? { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: title }
      : { mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: title },
  )
}

// Every card in every binder, as one CSV (with the binder of each), through the share sheet.
export async function exportCollection(db: SQLiteDatabase) {
  const [entries, binders] = await Promise.all([getCollection(db), getBinders(db)])
  await share(`Collection ${today()}`, collectionCsv(entries, binders), 'csv', 'Export collection')
  return { exported: entries.length }
}

// One binder's cards as a CSV, through the share sheet.
export async function exportBinder(db: SQLiteDatabase, binder: Binder) {
  const entries = (await getCollection(db)).filter((e) => e.binder_id === binder.id)
  await share(binder.name, collectionCsv(entries), 'csv', `Export ${binder.name}`)
}

// One deck as a text decklist, through the share sheet.
export async function exportDeck(db: SQLiteDatabase, deckId: string) {
  const deck = getDeckStore().decks.find((d) => d.id === deckId)
  if (!deck) throw new Error('Deck not found')
  await share(deck.name, await deckText(db, deck), 'txt', `Export ${deck.name}`)
}

export const isPickerCanceled = (e: unknown) => e instanceof Error && /cancel/i.test(e.message)

// Everything, into a folder the user picks: "Grimoire <date>" holding Collection.csv (all binders),
// a CSV per binder in "Binders" and a decklist per deck in "Decks". Null when the picker was
// closed.
export async function exportEverything(db: SQLiteDatabase) {
  let parent: Directory
  try {
    parent = await Directory.pickDirectoryAsync()
  } catch (e) {
    if (isPickerCanceled(e)) return null
    throw e
  }
  const [entries, binders] = await Promise.all([getCollection(db), getBinders(db)])
  const { decks } = getDeckStore()

  const taken = new Set(parent.list().map((item) => item.name))
  let folderName = `Grimoire ${today()}`
  for (let n = 2; taken.has(folderName); n++) folderName = `Grimoire ${today()} (${n})`
  const root = parent.createDirectory(folderName)

  // Same-named binders or decks get " (2)", " (3)"… rather than overwriting each other.
  const writeAll = (dir: Directory, files: { name: string; text: string }[], kind: 'csv' | 'txt') => {
    const used = new Set<string>()
    for (const { name, text } of files) {
      let base = fileName(name)
      for (let n = 2; used.has(base.toLowerCase()); n++) base = `${fileName(name)} (${n})`
      used.add(base.toLowerCase())
      dir.createFile(`${base}.${kind}`, kind === 'csv' ? 'text/csv' : 'text/plain').write(text)
    }
  }

  writeAll(root, [{ name: 'Collection', text: collectionCsv(entries, binders) }], 'csv')
  if (binders.length) {
    writeAll(
      root.createDirectory('Binders'),
      binders.map((b) => ({ name: b.name, text: collectionCsv(entries.filter((e) => e.binder_id === b.id)) })),
      'csv',
    )
  }
  if (decks.length) {
    const texts = []
    for (const deck of decks) texts.push({ name: deck.name, text: await deckText(db, deck) })
    writeAll(root.createDirectory('Decks'), texts, 'txt')
  }
  return { folder: folderName, cards: entries.length, binders: binders.length, decks: decks.length }
}

// ---------- Import ----------

type ImportRow = {
  line: number // line in the file, for error messages
  quantity: number
  name: string
  set: string
  number: string
  // The exact printing, when the file names it (Manabox's CSV does).
  scryfallId: string
  finish: Finish
  condition: Condition
  language: string
  // Per copy, in euros (null: not given).
  paid: number | null
}

export type ImportResult = {
  canceled: boolean
  fileName: string | null
  imported: number // rows added (quantities merge into existing entries)
  copies: number
  failed: { line: number; name: string; reason: string }[]
}

// Lets the user pick a collection file (a CSV, or a text list: "N Card Name (SET) 123 *F*", as
// Manabox exports both), looks every row up on Scryfall, then adds all matches in one transaction,
// to `binderId` (the first binder when left out). `onProgress`: cards looked up so far, of how many.
export async function importCollection(
  db: SQLiteDatabase,
  binderId?: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
  if (picked.canceled) return { canceled: true, fileName: null, imported: 0, copies: 0, failed: [] }
  const asset = picked.assets[0]

  const text = await new File(asset.uri).text()
  const { rows, failed } = looksLikeCsv(text) ? readRows(text) : readTextRows(text)

  // Network first, so the database transaction stays short and all-or-nothing. Each printing once.
  const identifiers = new Map<string, CardIdentifier>()
  for (const r of rows) {
    const id: CardIdentifier = r.scryfallId
      ? { id: r.scryfallId }
      : r.set && r.number
        ? { set: r.set, collector_number: r.number }
        : { name: r.name }
    identifiers.set(JSON.stringify(id), id)
  }
  const { found } = await getCardsByIdentifiers([...identifiers.values()], onProgress)

  const matches: { row: ImportRow; card: ScryfallCard }[] = []
  for (const row of rows) {
    const card = findCard(found, row)
    if (card) matches.push({ row, card })
    else failed.push({ line: row.line, name: row.name, reason: 'Card not found on Scryfall' })
  }

  await db.withTransactionAsync(async () => {
    for (const { row, card } of matches) {
      await addToCollection(db, card, {
        binderId,
        quantity: row.quantity,
        finish: row.finish,
        condition: row.condition,
        language: row.language,
        purchasePrice: row.paid,
      })
    }
  })

  const copies = matches.reduce((n, m) => n + m.row.quantity, 0)
  return { canceled: false, fileName: asset.name, imported: matches.length, copies, failed }
}

// The collection endpoint doesn't promise results in request order, so match them back by value.
function findCard(cards: ScryfallCard[], row: ImportRow) {
  if (row.scryfallId) {
    const exact = cards.find((c) => c.id === row.scryfallId)
    if (exact) return exact
  }
  if (row.set && row.number) {
    return cards.find(
      (c) => c.set.toLowerCase() === row.set.toLowerCase() && c.collector_number.toLowerCase() === row.number.toLowerCase(),
    )
  }
  const name = row.name.toLowerCase()
  // Double-faced cards are named "Front // Back"; files often only list the front.
  return cards.find((c) => c.name.toLowerCase() === name || c.name.toLowerCase().split(' // ')[0] === name)
}

// A CSV starts with a header naming a card column; a text list starts with a count.
function looksLikeCsv(text: string) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const names = (parseCsv(first)[0] ?? []).map((h) => h.trim().toLowerCase())
  return names.length > 1 && names.some((n) => COLUMN_ALIASES.name.includes(n) || COLUMN_ALIASES.scryfallId.includes(n))
}

// A text list: one "N Card Name (SET) 123" line per printing, "*F*" / "*E*" for foil / etched.
function readTextRows(text: string) {
  const { rows, skipped } = parseDeckList(text)
  const failed: ImportResult['failed'] = skipped.map((s) => ({ line: s.line, name: s.text, reason: "Couldn't read this line" }))
  return {
    rows: rows.map(
      (r): ImportRow => ({
        line: r.line,
        quantity: r.quantity,
        name: r.name,
        set: r.set ?? '',
        number: r.number ?? '',
        scryfallId: '',
        finish: r.finish,
        condition: 'NM',
        language: 'en',
        paid: null,
      }),
    ),
    failed,
  }
}

// Column names vary between apps (Manabox, Deckbox, spreadsheets…), so accept aliases.
const COLUMN_ALIASES = {
  quantity: ['count', 'quantity', 'qty', 'amount'],
  name: ['name', 'card name', 'card'],
  set: ['edition', 'set', 'set code', 'edition code'],
  number: ['collector number', 'collector_number', 'card number', 'number', 'cn'],
  scryfallId: ['scryfall id', 'scryfall_id', 'scryfallid'],
  finish: ['foil', 'finish', 'printing'],
  condition: ['condition'],
  language: ['language', 'lang'],
  paid: ['purchase price', 'purchase_price', 'price paid', 'paid'],
  currency: ['purchase price currency', 'currency'],
}

function readRows(text: string) {
  const [header, ...data] = parseCsv(text)
  const failed: ImportResult['failed'] = []
  if (!header) return { rows: [] as ImportRow[], failed }

  const names = header.map((h) => h.trim().toLowerCase())
  const col = (key: keyof typeof COLUMN_ALIASES) =>
    names.findIndex((n) => COLUMN_ALIASES[key].includes(n))
  const idx = {
    quantity: col('quantity'),
    name: col('name'),
    set: col('set'),
    number: col('number'),
    scryfallId: col('scryfallId'),
    finish: col('finish'),
    condition: col('condition'),
    language: col('language'),
    paid: col('paid'),
    currency: col('currency'),
  }
  if (idx.name === -1 && idx.scryfallId === -1 && (idx.set === -1 || idx.number === -1)) {
    throw new Error('Unrecognised CSV: needs a "Name" column, or "Edition" and "Collector Number" columns')
  }

  const rows: ImportRow[] = []
  data.forEach((fields, i) => {
    const get = (j: number) => (j === -1 ? '' : (fields[j] ?? '').trim())
    const line = i + 2
    const name = get(idx.name)
    const set = get(idx.set)
    const number = get(idx.number)
    const scryfallId = get(idx.scryfallId)
    const quantity = idx.quantity === -1 ? 1 : parseInt(get(idx.quantity), 10)
    if (!name && !scryfallId && !(set && number)) {
      failed.push({ line, name: '', reason: 'Missing card name' })
      return
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      failed.push({ line, name, reason: 'Invalid quantity' })
      return
    }
    rows.push({
      line,
      quantity,
      name,
      set,
      number,
      scryfallId,
      finish: parseFinish(get(idx.finish)),
      condition: parseCondition(get(idx.condition)),
      language: parseLanguage(get(idx.language)),
      paid: parsePaid(get(idx.paid), get(idx.currency)),
    })
  })
  return { rows, failed }
}

function parseFinish(value: string): Finish {
  const v = value.toLowerCase()
  if (v === 'etched') return 'etched'
  if (v === 'foil' || v === 'true' || v === 'yes' || v === '1') return 'foil'
  return 'nonfoil'
}

// What a copy cost, in euros (to the cent). Nothing, or 0, is no price.
function parsePaid(value: string, currency: string) {
  const amount = Number(value.replace(',', '.'))
  if (!value || !Number.isFinite(amount) || amount <= 0) return null
  const eur = toEurFrom(amount, currency)
  return eur == null ? null : Math.round(eur * 100) / 100
}

function parseCondition(value: string): Condition {
  const v = value.toLowerCase().replace(/[^a-z]/g, '')
  if (['lp', 'lightlyplayed', 'excellent', 'ex', 'sp', 'slightlyplayed'].includes(v)) return 'LP'
  if (['mp', 'moderatelyplayed', 'good', 'gd', 'played', 'pl'].includes(v)) return 'MP'
  if (['hp', 'heavilyplayed'].includes(v)) return 'HP'
  if (['dmg', 'damaged', 'poor', 'po'].includes(v)) return 'DMG'
  return 'NM'
}

function parseLanguage(value: string) {
  const v = value.trim().toLowerCase()
  if (!v) return 'en'
  if (LANGUAGE_NAMES[v]) return v
  const code = Object.keys(LANGUAGE_NAMES).find((k) => LANGUAGE_NAMES[k].toLowerCase() === v)
  return code ?? v
}
