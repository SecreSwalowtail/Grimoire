import Constants from 'expo-constants';

// Scryfall API: https://scryfall.com/docs/api
// Rules: send User-Agent + Accept on every request, and respect rate limits
// (/cards/collection: 2/s, most others: 10/s). A 429 blocks the app for 30s.

const API = 'https://api.scryfall.com';
const HEADERS = {
  'User-Agent': `Grimoire/${Constants.expoConfig?.version ?? '1.0.0'}`,
  Accept: 'application/json',
};

export type ImageUris = { small?: string; normal?: string; large?: string; art_crop?: string };

// One side of a double-faced card, or one half of a split / adventure / flip card.
export type CardFace = {
  name: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  flavor_text?: string;
  artist?: string;
  watermark?: string;
  printed_name?: string;
  image_uris?: ImageUris;
};

// 'legal' | 'not_legal' | 'banned' | 'restricted', per format key ('standard', 'commander'…).
export type Legality = 'legal' | 'not_legal' | 'banned' | 'restricted';

export type ScryfallCard = {
  id: string;
  oracle_id?: string;
  name: string;
  printed_name?: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  lang: string;
  layout?: string;
  released_at?: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  legalities?: Record<string, Legality>;
  games?: string[];
  reserved?: boolean;
  finishes?: string[];
  frame_effects?: string[];
  promo_types?: string[];
  border_color?: string;
  full_art?: boolean;
  artist?: string;
  flavor_text?: string;
  watermark?: string;
  image_uris?: ImageUris;
  card_faces?: CardFace[];
  prices: { eur: string | null; eur_foil: string | null; usd: string | null; usd_foil: string | null; usd_etched?: string | null; tix?: string | null };
  purchase_uris?: { cardmarket?: string; tcgplayer?: string; cardhoarder?: string };
  scryfall_uri?: string;
};

export type Ruling = { source: string; published_at: string; comment: string };

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

// Cards already fetched this session, by id, so Card detail opens at once from a list.
const cache = new Map<string, ScryfallCard>();

export function rememberCard(card: ScryfallCard) {
  cache.set(card.id, card);
}

export function cachedCard(id: string) {
  return cache.get(id) ?? null;
}

// One printing by its Scryfall id. Returns null if Scryfall doesn't know it.
export async function getCard(id: string) {
  try {
    const card = await throttled('default', () => request<ScryfallCard>(`/cards/${encodeURIComponent(id)}`));
    rememberCard(card);
    return card;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Scryfall 404')) return null;
    throw e;
  }
}

// Every printing of a card (newest first), up to 175 a page. `page` starts at 1.
export async function getPrintings(oracleId: string, page = 1) {
  const query = `q=${encodeURIComponent(`oracleid:${oracleId}`)}&unique=prints&order=released&dir=desc&include_extras=true&page=${page}`;
  try {
    const res = await throttled('default', () => request<SearchResult>(`/cards/search?${query}`));
    res.data.forEach(rememberCard);
    return res;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Scryfall 404')) return { data: [], total_cards: 0, has_more: false };
    throw e;
  }
}

// Official rulings (Wizards' and Scryfall's notes), oldest first.
export async function getRulings(id: string) {
  const res = await throttled('default', () => request<{ data: Ruling[] }>(`/cards/${encodeURIComponent(id)}/rulings`));
  return res.data;
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

// The art alone (no frame), for the Card detail backdrop.
export function cardArt(card: ScryfallCard, face = 0) {
  return card.card_faces?.[face]?.image_uris?.art_crop ?? card.image_uris?.art_crop ?? null;
}

// The full card image of one face: double-faced cards have an image per face.
export function faceImage(card: ScryfallCard, face = 0) {
  const own = card.card_faces?.[face]?.image_uris;
  return own?.large ?? own?.normal ?? card.image_uris?.large ?? card.image_uris?.normal ?? null;
}

export function cardColors(card: ScryfallCard) {
  return card.colors ?? card.card_faces?.[0]?.colors ?? [];
}
