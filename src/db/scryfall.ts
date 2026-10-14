import Constants from 'expo-constants';

// Scryfall API: https://scryfall.com/docs/api
// Rules: send User-Agent + Accept on every request, and respect rate limits
// (/cards/collection: 2/s, most others: 10/s). A 429 blocks the app for 30s.

const API = 'https://api.scryfall.com';
const HEADERS = {
  'User-Agent': `Grimoire/${Constants.expoConfig?.version ?? '1.0.0'}`,
  Accept: 'application/json',
};

export type ScryfallCard = {
  id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  lang: string;
  type_line?: string;
  mana_cost?: string;
  colors?: string[];
  image_uris?: { normal?: string; small?: string };
  card_faces?: { colors?: string[]; mana_cost?: string; image_uris?: { normal?: string; small?: string } }[];
  prices: { eur: string | null; eur_foil: string | null; usd: string | null; usd_foil: string | null };
};

export type CardIdentifier = { set: string; collector_number: string } | { name: string };

// Serialise requests and keep a minimum gap between them, per rate-limit group.
let queue: Promise<unknown> = Promise.resolve();
const lastCall: Record<string, number> = {};
function throttled<T>(group: 'collection' | 'default', fn: () => Promise<T>): Promise<T> {
  const gap = group === 'collection' ? 500 : 100;
  const run = queue.then(async () => {
    const wait = (lastCall[group] ?? 0) + gap - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall[group] = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...HEADERS, ...init?.headers } });
  if (res.status === 429) throw new Error('Scryfall rate limit hit (429) - wait 30 seconds before retrying');
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(`Scryfall ${res.status}: ${body?.details ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// One card by set code + collector number (what the OCR strip reads). Returns null if not found.
export async function getCardBySetNumber(set: string, collectorNumber: string, lang?: string) {
  const path = `/cards/${encodeURIComponent(set.toLowerCase())}/${encodeURIComponent(collectorNumber)}${lang ? `/${lang}` : ''}`;
  try {
    return await throttled('default', () => request<ScryfallCard>(path));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Scryfall 404')) return null;
    throw e;
  }
}

// Many cards at once (75 per request). Returns found cards and the identifiers that matched nothing.
export async function getCardsByIdentifiers(identifiers: CardIdentifier[]) {
  const found: ScryfallCard[] = [];
  const notFound: CardIdentifier[] = [];
  for (let i = 0; i < identifiers.length; i += 75) {
    const batch = identifiers.slice(i, i + 75);
    const res = await throttled('collection', () =>
      request<{ data: ScryfallCard[]; not_found: CardIdentifier[] }>('/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch }),
      }),
    );
    found.push(...res.data);
    notFound.push(...res.not_found);
  }
  return { found, notFound };
}

// 'edhrec' = popularity in Commander decks (most played first when ascending).
export type SearchOrder = 'name' | 'cmc' | 'power' | 'toughness' | 'eur' | 'released' | 'edhrec';

export type SearchOptions = {
  order: SearchOrder;
  dir: 'asc' | 'desc';
  unique: 'cards' | 'prints'; // one row per card, or one per printing
};

export type SearchResult = { data: ScryfallCard[]; total_cards: number; has_more: boolean };

// First page (up to 175 cards) of a search in Scryfall's syntax: https://scryfall.com/docs/syntax
// Scryfall answers "no cards" with a 404; that comes back here as an empty result.
export async function searchCards(q: string, options: SearchOptions): Promise<SearchResult> {
  const params = { q, ...options };
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  try {
    return await throttled('default', () => request<SearchResult>(`/cards/search?${query}`));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Scryfall 404')) return { data: [], total_cards: 0, has_more: false };
    throw e;
  }
}

// Double-faced cards keep their image and colors on the faces instead of the card.
export function cardImage(card: ScryfallCard) {
  return card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null;
}

// Small image (146 × 204) for list thumbnails.
export function cardThumb(card: ScryfallCard) {
  return card.image_uris?.small ?? card.card_faces?.[0]?.image_uris?.small ?? null;
}

// "{2}{G}{W}". Double-faced cards only have it on the faces: the front's is used.
export function cardManaCost(card: ScryfallCard) {
  return card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? '';
}

export function cardColors(card: ScryfallCard) {
  return card.colors ?? card.card_faces?.[0]?.colors ?? [];
}
