// Color identity names and sentences, for Card detail. Colors are Scryfall letters W U B R G.

const ORDER = ['W', 'U', 'B', 'R', 'G']
const WORDS: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' }

// Players' names for each color group: guilds (2), shards and wedges (3), Nephilim (4).
const GROUP_NAMES: Record<string, string> = {
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', WG: 'Selesnya',
  WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', WR: 'Boros', UG: 'Simic',
  WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', WRG: 'Naya', WUG: 'Bant',
  WBG: 'Abzan', WUR: 'Jeskai', UBG: 'Sultai', WBR: 'Mardu', URG: 'Temur',
  WUBR: 'Yore-Tiller', UBRG: 'Glint-Eye', WBRG: 'Dune-Brood', WURG: 'Ink-Treader', WUBG: 'Witch-Maw',
}

// ['B', 'W'] -> ['W', 'B'] (the usual WUBRG order).
export function sortColors(colors: string[]) {
  return ORDER.filter((c) => colors.includes(c))
}

// "white, blue and black"
export function colorWords(colors: string[]) {
  const words = sortColors(colors).map((c) => WORDS[c])
  if (words.length <= 1) return words[0] ?? 'colorless'
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

// "Black", "Rakdos (black and red)", "Five-color", "Colorless".
export function identityName(colors: string[]) {
  const sorted = sortColors(colors)
  if (sorted.length === 0) return 'Colorless'
  if (sorted.length === 1) return WORDS[sorted[0]].charAt(0).toUpperCase() + WORDS[sorted[0]].slice(1)
  if (sorted.length === 5) return 'Five-color'
  return GROUP_NAMES[sorted.join('')] ?? colorWords(sorted)
}

// "mono-black", "Rakdos (black and red)", "five-color", "colorless": for use mid-sentence.
export function identityPhrase(colors: string[]) {
  const sorted = sortColors(colors)
  if (sorted.length === 0) return 'colorless'
  if (sorted.length === 1) return `mono-${WORDS[sorted[0]]}`
  if (sorted.length === 5) return 'five-color'
  return `${GROUP_NAMES[sorted.join('')]} (${colorWords(sorted)})`
}

// What a commander with this identity allows: "only black and colorless cards".
export function identityAllows(colors: string[]) {
  const sorted = sortColors(colors)
  if (sorted.length === 0) return 'only colorless cards'
  if (sorted.length === 5) return 'cards of any color'
  return `only ${sorted.map((c) => WORDS[c]).join(', ')} and colorless cards`
}
