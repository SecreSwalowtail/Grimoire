import type { ScryfallCard } from '@/db/scryfall'

// Names for printings, finishes and card layouts, for Card detail.

// Promo stamps and special foils, most telling first.
const PROMO_LABELS: [string, string][] = [
  ['serialized', 'Serialized'],
  ['prerelease', 'Prerelease promo'],
  ['promopack', 'Promo pack'],
  ['buyabox', 'Buy-a-Box promo'],
  ['bundle', 'Bundle promo'],
  ['release', 'Release promo'],
  ['judgegift', 'Judge promo'],
  ['fnm', 'FNM promo'],
  ['gameday', 'Game Day promo'],
  ['storechampionship', 'Store Championship promo'],
  ['wizardsplaynetwork', 'WPN promo'],
  ['playtest', 'Playtest card'],
  ['textured', 'Textured foil'],
  ['galaxyfoil', 'Galaxy foil'],
  ['surgefoil', 'Surge foil'],
  ['halofoil', 'Halo foil'],
  ['confettifoil', 'Confetti foil'],
  ['gilded', 'Gilded foil'],
  ['stepandcompleat', 'Step-and-compleat foil'],
  ['oilslick', 'Oil slick foil'],
  ['neonink', 'Neon ink'],
  ['rainbowfoil', 'Rainbow foil'],
  ['doublerainbow', 'Double rainbow foil'],
  ['raisedfoil', 'Raised foil'],
  ['fracturefoil', 'Fracture foil'],
  ['manafoil', 'Mana foil'],
  ['firstplacefoil', 'First place foil'],
  ['datestamped', 'Date-stamped'],
  ['planeswalkerstamped', 'Planeswalker-stamped'],
]

const FRAME_LABELS: [string, string][] = [
  ['showcase', 'Showcase'],
  ['extendedart', 'Extended art'],
  ['etched', 'Etched'],
  ['inverted', 'Inverted'],
  ['shatteredglass', 'Shattered glass'],
]

// "Regular", "Showcase", "Borderless · Textured foil", "Phyrexian"…
export function printingLabel(card: ScryfallCard) {
  const parts: string[] = []
  if (card.lang === 'ph') parts.push('Phyrexian')
  const frame = FRAME_LABELS.find(([key]) => card.frame_effects?.includes(key))
  if (card.border_color === 'borderless') parts.push('Borderless')
  else if (frame) parts.push(frame[1])
  else if (card.full_art) parts.push('Full art')
  const promo = PROMO_LABELS.find(([key]) => card.promo_types?.includes(key))
  if (promo) parts.push(promo[1])
  return parts.slice(0, 2).join(' · ') || 'Regular'
}

export const FINISH_LABEL: Record<string, string> = { nonfoil: 'Non-foil', foil: 'Foil', etched: 'Etched' }

// "Non-foil · Foil", "Foil only", "Etched only".
export function finishesText(finishes: string[] = ['nonfoil']) {
  if (finishes.length === 1) return `${FINISH_LABEL[finishes[0]] ?? finishes[0]} only`
  return finishes.map((f) => FINISH_LABEL[f] ?? f).join(' · ')
}

// What a card's layout means, for layouts that work differently from a normal card.
const LAYOUTS: Record<string, string> = {
  split: 'Split card: two spells on one card. You cast one half, or both if it has fuse.',
  flip: 'Flip card: it turns upside down once its condition is met and becomes its other half.',
  transform: 'Double-faced card: it enters front face up and turns over to its back face when an effect tells it to.',
  modal_dfc: 'Modal double-faced card: when you play it, you choose which face to play.',
  meld: 'Meld card: it combines with one specific other card into a single huge permanent.',
  leveler: 'Level up card: it gets stronger as you put level counters on it.',
  class: 'Class: an enchantment you level up, as a sorcery, to unlock more abilities.',
  case: 'Case: at your end step, if its condition is met, it becomes solved and unlocks its last ability.',
  saga: 'Saga: it gets a lore counter as it enters and after your draw step; each chapter happens in turn, then it\'s sacrificed.',
  adventure: 'Adventure: cast the Adventure spell first; it goes to exile, and later you can cast the creature from there.',
  omen: 'Omen: cast the Omen spell and it\'s shuffled into your library afterwards; or cast the card as a creature.',
  mutate: 'Mutate: it can merge with a non-Human creature you own into one creature.',
  prototype: 'Prototype: it can be cast as a smaller, cheaper version.',
  battle: 'Battle: it enters under an opponent\'s protection; attack it to remove its defense counters and defeat it.',
  reversible_card: 'Reversible card: the same card printed on both sides with different art.',
  art_series: 'Art card: a collectible print of the art, not playable in games.',
  token: 'Token: made by other cards; it isn\'t played as a card from your deck.',
  double_faced_token: 'Double-faced token: a token with two sides.',
  emblem: 'Emblem: a lasting effect in the command zone.',
  planar: 'Planechase card: used in the Planechase variant, not in your deck.',
  scheme: 'Scheme: used by the Archenemy in that variant, not in your deck.',
  vanguard: 'Vanguard: an avatar card for the Vanguard variant.',
  augment: 'Augment card: the top half of an Unstable Host creature.',
  host: 'Host creature: an Unstable creature that augment cards can attach to.',
}

export function layoutText(layout: string | undefined) {
  return layout ? LAYOUTS[layout] ?? null : null
}

// Layouts with a real second face to flip to (both sides have their own image).
export const FLIPPABLE = ['transform', 'modal_dfc', 'meld', 'reversible_card', 'double_faced_token', 'art_series']
