import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { addToCollection, getCollection, type Condition, type Finish } from '@/db/collection';
import { parseCsv, toCsv } from '@/db/csv';
import { getCardsByIdentifiers, type CardIdentifier, type ScryfallCard } from '@/db/scryfall';

// CSV columns follow Moxfield's collection export, so files move between apps.
const HEADER = ['Count', 'Name', 'Edition', 'Collector Number', 'Foil', 'Condition', 'Language'];

const CONDITION_NAMES: Record<Condition, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese',
  ja: 'Japanese', ko: 'Korean', ru: 'Russian', zhs: 'Chinese Simplified', zht: 'Chinese Traditional',
};

// ---------- Export ----------

// Writes the whole collection to a CSV in the cache folder and opens the share sheet.
export async function exportCollection(db: SQLiteDatabase) {
  const entries = await getCollection(db);
  const rows = entries.map((e) => [
    e.quantity,
    e.name,
    e.set_code,
    e.collector_number,
    e.finish === 'nonfoil' ? '' : e.finish,
    CONDITION_NAMES[e.condition],
    LANGUAGE_NAMES[e.language] ?? e.language,
  ]);

  const file = new File(Paths.cache, `binder-${new Date().toISOString().slice(0, 10)}.csv`);
  file.create({ overwrite: true });
  file.write(toCsv([HEADER, ...rows]));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export binder',
  });
  return { exported: entries.length };
}

// ---------- Import ----------

type ImportRow = {
  line: number; // line in the file, for error messages
  quantity: number;
  name: string;
  set: string;
  number: string;
  finish: Finish;
  condition: Condition;
  language: string;
};

export type ImportResult = {
  canceled: boolean;
  imported: number; // rows added (quantities merge into existing entries)
  failed: { line: number; name: string; reason: string }[];
};

// Lets the user pick a CSV, looks every row up on Scryfall, then adds all matches in one transaction.
export async function importCollection(db: SQLiteDatabase): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled) return { canceled: true, imported: 0, failed: [] };

  const text = await new File(picked.assets[0].uri).text();
  const { rows, failed } = readRows(text);

  // Network first, so the database transaction stays short and all-or-nothing.
  const identifiers: CardIdentifier[] = rows.map((r) =>
    r.set && r.number ? { set: r.set, collector_number: r.number } : { name: r.name },
  );
  const { found } = await getCardsByIdentifiers(identifiers);

  const matches: { row: ImportRow; card: ScryfallCard }[] = [];
  for (const row of rows) {
    const card = findCard(found, row);
    if (card) matches.push({ row, card });
    else failed.push({ line: row.line, name: row.name, reason: 'Card not found on Scryfall' });
  }

  await db.withTransactionAsync(async () => {
    for (const { row, card } of matches) {
      await addToCollection(db, card, {
        quantity: row.quantity,
        finish: row.finish,
        condition: row.condition,
        language: row.language,
      });
    }
  });

  return { canceled: false, imported: matches.length, failed };
}

// The collection endpoint doesn't promise results in request order, so match them back by value.
function findCard(cards: ScryfallCard[], row: ImportRow) {
  if (row.set && row.number) {
    return cards.find(
      (c) => c.set.toLowerCase() === row.set.toLowerCase() && c.collector_number.toLowerCase() === row.number.toLowerCase(),
    );
  }
  const name = row.name.toLowerCase();
  // Double-faced cards are named "Front // Back"; files often only list the front.
  return cards.find((c) => c.name.toLowerCase() === name || c.name.toLowerCase().split(' // ')[0] === name);
}

// Column names vary between apps (Moxfield, Manabox, Deckbox, spreadsheets), so accept aliases.
const COLUMN_ALIASES = {
  quantity: ['count', 'quantity', 'qty', 'amount'],
  name: ['name', 'card name', 'card'],
  set: ['edition', 'set', 'set code', 'edition code'],
  number: ['collector number', 'collector_number', 'card number', 'number', 'cn'],
  finish: ['foil', 'finish', 'printing'],
  condition: ['condition'],
  language: ['language', 'lang'],
};

function readRows(text: string) {
  const [header, ...data] = parseCsv(text);
  const failed: ImportResult['failed'] = [];
  if (!header) return { rows: [] as ImportRow[], failed };

  const names = header.map((h) => h.trim().toLowerCase());
  const col = (key: keyof typeof COLUMN_ALIASES) =>
    names.findIndex((n) => COLUMN_ALIASES[key].includes(n));
  const idx = {
    quantity: col('quantity'),
    name: col('name'),
    set: col('set'),
    number: col('number'),
    finish: col('finish'),
    condition: col('condition'),
    language: col('language'),
  };
  if (idx.name === -1 && (idx.set === -1 || idx.number === -1)) {
    throw new Error('Unrecognised CSV: needs a "Name" column, or "Edition" and "Collector Number" columns');
  }

  const rows: ImportRow[] = [];
  data.forEach((fields, i) => {
    const get = (j: number) => (j === -1 ? '' : (fields[j] ?? '').trim());
    const line = i + 2;
    const name = get(idx.name);
    const set = get(idx.set);
    const number = get(idx.number);
    const quantity = idx.quantity === -1 ? 1 : parseInt(get(idx.quantity), 10);
    if (!name && !(set && number)) {
      failed.push({ line, name: '', reason: 'Missing card name' });
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      failed.push({ line, name, reason: 'Invalid quantity' });
      return;
    }
    rows.push({
      line,
      quantity,
      name,
      set,
      number,
      finish: parseFinish(get(idx.finish)),
      condition: parseCondition(get(idx.condition)),
      language: parseLanguage(get(idx.language)),
    });
  });
  return { rows, failed };
}

function parseFinish(value: string): Finish {
  const v = value.toLowerCase();
  if (v === 'etched') return 'etched';
  if (v === 'foil' || v === 'true' || v === 'yes' || v === '1') return 'foil';
  return 'nonfoil';
}

function parseCondition(value: string): Condition {
  const v = value.toLowerCase().replace(/[^a-z]/g, '');
  if (['lp', 'lightlyplayed', 'excellent', 'ex', 'sp', 'slightlyplayed'].includes(v)) return 'LP';
  if (['mp', 'moderatelyplayed', 'good', 'gd', 'played', 'pl'].includes(v)) return 'MP';
  if (['hp', 'heavilyplayed'].includes(v)) return 'HP';
  if (['dmg', 'damaged', 'poor', 'po'].includes(v)) return 'DMG';
  return 'NM';
}

function parseLanguage(value: string) {
  const v = value.trim().toLowerCase();
  if (!v) return 'en';
  if (LANGUAGE_NAMES[v]) return v;
  const code = Object.keys(LANGUAGE_NAMES).find((k) => LANGUAGE_NAMES[k].toLowerCase() === v);
  return code ?? v;
}
