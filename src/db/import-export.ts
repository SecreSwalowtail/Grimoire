import * as DocumentPicker from 'expo-document-picker'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import type { SQLiteDatabase } from 'expo-sqlite'

import { addToCollection, getCollection, type Condition, type Finish } from '@/db/collection'
import { parseCsv, toCsv } from '@/db/csv'
import { parseDeckList } from '@/db/deck-import'
import { getCardsByIdentifiers, type CardIdentifier, type ScryfallCard } from '@/db/scryfall'
import { toEurFrom } from '@/utils/money'

// CSV columns follow Moxfield's collection export, so files move between apps.
const HEADER = ['Count', 'Name', 'Edition', 'Collector Number', 'Foil', 'Condition', 'Language']

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

// Writes the whole collection to a CSV in the cache folder and opens the share sheet.
export async function exportCollection(db: SQLiteDatabase) {
  const entries = await getCollection(db)
  const rows = entries.map((e) => [
    e.quantity,
    e.name,
    e.set_code,
    e.collector_number,
    e.finish === 'nonfoil' ? '' : e.finish,
    CONDITION_NAMES[e.condition],
    LANGUAGE_NAMES[e.language] ?? e.language,
  ])

  const file = new File(Paths.cache, `binder-${new Date().toISOString().slice(0, 10)}.csv`)
  file.create({ overwrite: true })
  file.write(toCsv([HEADER, ...rows]))

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device')
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export binder',
  })
  return { exported: entries.length }
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
