import type { ScryfallCard } from '@/db/scryfall'
import { colorWords, identityAllows, identityPhrase } from '@/rules/colors'

// Whether a card can lead a Commander deck, with the texts the Overview facts and the Rules tab's
// commander box show. Based on the Commander rules (CR 903.3): a commander is a legendary creature,
// a legendary Vehicle or Spacecraft with power and toughness, or a card that says it can be your
// commander. Partner-style abilities and Backgrounds allow a second commander.

export type CommanderTone = 'yes' | 'partial' | 'no'
export type CommanderStatus = { tone: CommanderTone; short: string; title: string; text: string }

const PAIRINGS: Record<string, string> = {
  'partner': 'It has partner, so it can share command with another commander that has partner.',
  'partner with': 'It has partner with, so it can share command with the card it names.',
  'friends forever': 'It has friends forever, so it can share command with another friends forever commander.',
  "doctor's companion": "It's a Doctor's companion, so it can share command with a Doctor.",
  'choose a background': 'It can choose a Background: a legendary Background enchantment can be your second commander.',
}

const front = (card: ScryfallCard) => card.card_faces?.[0] ?? card
const frontType = (card: ScryfallCard) => (card.type_line ?? front(card).type_line ?? '').split(' // ')[0]
const allText = (card: ScryfallCard) =>
  card.oracle_text ?? (card.card_faces ?? []).map((f) => f.oracle_text ?? '').join('\n')

export function commanderStatus(card: ScryfallCard): CommanderStatus {
  const identity = card.color_identity ?? []
  const type = frontType(card)
  const legendary = /\bLegendary\b/.test(type)
  const keywords = (card.keywords ?? []).map((k) => k.toLowerCase())
  const pairing = Object.keys(PAIRINGS).find((k) => keywords.includes(k))
  const status = card.legalities?.commander

  if (status === 'banned') {
    return {
      tone: 'no',
      short: 'Banned',
      title: 'Banned in Commander',
      text: "It can't be played in Commander at all: not as your commander, and not in the deck.",
    }
  }
  if (status === 'not_legal') {
    return {
      tone: 'no',
      short: 'Not legal',
      title: "Not allowed in Commander",
      text: "This card isn't part of Commander's card pool (for example a digital-only or joke card).",
    }
  }

  const sayso = /can be your commander/i.test(allText(card))
  const creature = /\bCreature\b/.test(type)
  const vehicle = /\b(Vehicle|Spacecraft)\b/.test(type) && front(card).power != null
  const lead = (legendary && (creature || vehicle)) || sayso

  if (lead) {
    const why = sayso && !(legendary && creature)
      ? 'Its text says it can be your commander.'
      : vehicle && !creature
        ? 'Legendary Vehicles and Spacecraft with power and toughness can lead a deck.'
        : "It's a legendary creature."
    const pair = pairing ? ` ${PAIRINGS[pairing]}` : ''
    return {
      tone: 'yes',
      short: 'Can lead a deck',
      title: 'Can be your commander',
      text: `${why} Color identity is ${identityPhrase(identity)}, so the deck can use ${identityAllows(identity)}.${pair}`,
    }
  }

  if (legendary && /\bBackground\b/.test(type)) {
    return {
      tone: 'partial',
      short: 'Second commander',
      title: 'Can be a second commander',
      text: `A Background can't lead on its own, but it can share command with a creature that has "Choose a Background". It adds ${colorWords(identity)} to the deck's colors.`,
    }
  }

  const fits = identity.length === 0
    ? "It's colorless, so any Commander deck can play it."
    : `It can go in any Commander deck whose commander's color identity includes ${colorWords(identity)}.`

  if (legendary && /\bPlaneswalker\b/.test(type)) {
    return {
      tone: 'no',
      short: "Can't lead a deck",
      title: "Can't be your commander",
      text: `Planeswalkers can only lead a deck if their text says so. ${fits} In Oathbreaker, it can be your oathbreaker.`,
    }
  }

  return {
    tone: 'no',
    short: "Can't lead a deck",
    title: "Can't be your commander",
    text: `Only legendary creatures (and cards that say so) can lead a Commander deck. ${fits}`,
  }
}

// What deciding a commander pair needs to know about a card.
export type PairCard = { name: string; typeLine: string; text: string; keywords: string[] }

const has = (c: PairCard, keyword: string) => c.keywords.some((k) => k.toLowerCase() === keyword)
const frontName = (c: PairCard) => c.name.split(' // ')[0]
const isBackground = (c: PairCard) => /\bLegendary\b/.test(c.typeLine) && /\bBackground\b/.test(c.typeLine)

// Whether two cards can share command (CR 702.124 and the like): both with partner, partner with
// each other, both friends forever, a Doctor's companion and a Doctor, or a "Choose a Background"
// commander and a Background. Anything else: one commander only.
export function canShareCommand(a: PairCard, b: PairCard) {
  const pair = (x: PairCard, y: PairCard) =>
    (has(x, 'partner') && has(y, 'partner')) ||
    (has(x, 'partner with') && x.text.includes(`Partner with ${frontName(y)}`)) ||
    (has(x, 'friends forever') && has(y, 'friends forever')) ||
    (has(x, "doctor's companion") && /\bTime Lord Doctor\b/.test(y.typeLine)) ||
    (has(x, 'choose a background') && isBackground(y))
  return pair(a, b) || pair(b, a)
}
