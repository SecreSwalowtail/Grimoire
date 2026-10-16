import type { Legality, ScryfallCard } from '@/db/scryfall'
import type { DeckFormat } from '@/utils/deck-store'

// Formats as Scryfall names them (keys of card.legalities), in the order the Rules tab lists them.
export type FormatInfo = { key: string; label: string }

// Played with paper cards (and on Magic Online).
export const PAPER_FORMATS: FormatInfo[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'pioneer', label: 'Pioneer' },
  { key: 'modern', label: 'Modern' },
  { key: 'legacy', label: 'Legacy' },
  { key: 'vintage', label: 'Vintage' },
  { key: 'commander', label: 'Commander' },
  { key: 'oathbreaker', label: 'Oathbreaker' },
  { key: 'pauper', label: 'Pauper' },
  { key: 'paupercommander', label: 'Pauper Commander' },
  { key: 'penny', label: 'Penny Dreadful' },
  { key: 'duel', label: 'Duel Commander' },
  { key: 'predh', label: 'PreDH' },
  { key: 'premodern', label: 'Premodern' },
  { key: 'oldschool', label: 'Old School' },
  { key: 'future', label: 'Future Standard' },
]

// Played on MTG Arena.
export const ARENA_FORMATS: FormatInfo[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'alchemy', label: 'Alchemy' },
  { key: 'explorer', label: 'Explorer' },
  { key: 'historic', label: 'Historic' },
  { key: 'timeless', label: 'Timeless' },
  { key: 'brawl', label: 'Brawl' },
  { key: 'standardbrawl', label: 'Standard Brawl' },
  { key: 'competitivebrawl', label: 'Competitive Brawl' },
  { key: 'gladiator', label: 'Gladiator' },
]

// The formats this card has a ruling for, in list order (Scryfall drops retired formats).
export function formatsFor(card: ScryfallCard, list: FormatInfo[]) {
  return list.filter((f) => card.legalities?.[f.key] != null)
}

export const LEGALITY_LABEL: Record<Legality, string> = {
  legal: 'Legal',
  not_legal: 'Not legal',
  banned: 'Banned',
  restricted: 'Restricted',
}

// What each status means, for screen readers and the Rules tab.
export const LEGALITY_HINT: Record<Legality, string> = {
  legal: 'Can be played in this format.',
  not_legal: "Isn't part of this format's card pool.",
  banned: "Is in this format's card pool, but banned.",
  restricted: 'Allowed, but only one copy per deck.',
}

// Legal in a format counts restricted too: it can be played, just one copy.
export const isPlayable = (status: Legality | undefined) => status === 'legal' || status === 'restricted'

// The decks' formats as Scryfall keys; Casual has no card pool.
export const DECK_FORMAT_KEY: Record<DeckFormat, string | null> = {
  Commander: 'commander',
  Standard: 'standard',
  Modern: 'modern',
  Pioneer: 'pioneer',
  Pauper: 'pauper',
  Legacy: 'legacy',
  Vintage: 'vintage',
  Oathbreaker: 'oathbreaker',
  'Pauper Commander': 'paupercommander',
  'Duel Commander': 'duel',
  PreDH: 'predh',
  Premodern: 'premodern',
  'Old School': 'oldschool',
  'Penny Dreadful': 'penny',
  'Future Standard': 'future',
  Alchemy: 'alchemy',
  Explorer: 'explorer',
  Historic: 'historic',
  Timeless: 'timeless',
  Brawl: 'brawl',
  'Standard Brawl': 'standardbrawl',
  'Competitive Brawl': 'competitivebrawl',
  Gladiator: 'gladiator',
  Casual: null,
}

// One copy of each card (basic lands aside): Commander and the formats built like it.
const SINGLETON = new Set<DeckFormat>([
  'Commander',
  'Oathbreaker',
  'Pauper Commander',
  'Duel Commander',
  'PreDH',
  'Brawl',
  'Standard Brawl',
  'Competitive Brawl',
  'Gladiator',
])

// One copy of each card (basics and "any number" cards aside).
export const isSingleton = (format: DeckFormat) => SINGLETON.has(format)

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
}

const frontType = (card: ScryfallCard) => (card.type_line ?? card.card_faces?.[0]?.type_line ?? '').split(' // ')[0]
const allText = (card: ScryfallCard) =>
  card.oracle_text ?? (card.card_faces ?? []).map((f) => f.oracle_text ?? '').join('\n')

// The name players use: a double-faced or adventure card goes by its front face ("Bonecrusher
// Giant"); split cards keep both halves ("Fire // Ice").
export function shortName(card: ScryfallCard) {
  const halves = card.layout === 'split' || card.layout === 'aftermath'
  return halves ? card.name : card.card_faces?.[0]?.name ?? card.name
}

// Whether a card can go in a deck of this format, and why not.
export type DeckFit = { allowed: boolean; reason: string | null }

export function deckFit(card: ScryfallCard, format: DeckFormat): DeckFit {
  const key = DECK_FORMAT_KEY[format]
  if (key == null) return { allowed: true, reason: null }
  const status = card.legalities?.[key]
  if (status === 'banned') return { allowed: false, reason: `Banned in ${format}` }
  if (!isPlayable(status)) return { allowed: false, reason: `${shortName(card)} isn’t legal in ${format}` }
  return { allowed: true, reason: null }
}

// How many copies one deck may hold. `max` null: any number.
export type CopyRule = { max: number | null; label: string }

export function copyRule(card: ScryfallCard, format: DeckFormat): CopyRule {
  const text = allText(card)
  if (/\bBasic\b/.test(frontType(card)) && /\bLand\b/.test(frontType(card))) {
    return { max: null, label: 'Basic land · any number' }
  }
  if (/A deck can have any number of cards named/i.test(text)) {
    return { max: null, label: 'Any number · its own rule' }
  }
  const upTo = /A deck can have up to (\w+) cards named/i.exec(text)
  if (upTo) {
    const n = NUMBER_WORDS[upTo[1].toLowerCase()] ?? Number(upTo[1])
    if (n) return { max: n, label: `Up to ${n} copies · its own rule` }
  }
  if (SINGLETON.has(format)) return { max: 1, label: 'Singleton · 1 copy max' }
  if (format === 'Casual') return { max: null, label: 'Casual · no copy limit' }
  const key = DECK_FORMAT_KEY[format]
  if (key && card.legalities?.[key] === 'restricted') return { max: 1, label: 'Restricted · 1 copy max' }
  return { max: 4, label: 'Up to 4 copies' }
}
