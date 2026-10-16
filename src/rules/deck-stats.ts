import type { ScryfallCard } from '@/db/scryfall'
import { hasCommander, type Board, type CardInfo, type DeckFormat } from '@/utils/deck-store'

export { hasCommander }

// Everything the deck screen shows about its cards: grouping, filtering and the Stats tab.
// Each copy counts (a 4-of is 4 cards), and the stats look at the main deck only.

export type Color = 'W' | 'U' | 'B' | 'R' | 'G'
export const WUBRG: Color[] = ['W', 'U', 'B', 'R', 'G']
export const COLOR_NAME: Record<Color, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' }
// For bars and dots on the dark background.
export const COLOR_HEX: Record<Color | 'C', string> = {
  W: '#E9DFBF',
  U: '#5F8AC0',
  B: '#A592AE',
  R: '#D8553A',
  G: '#7FB06A',
  C: '#B3AB9C',
}

// One card in the deck, with what the screen needs to know about it. `card` is the full Scryfall
// card when it's saved on the phone; without it, costs and produced mana are unknown.
export type DeckLine = {
  cardId: string
  board: Board
  quantity: number
  name: string
  typeLine: string
  type: CardType
  cmc: number
  price: number | null
  image: string | null
  manaCost: string
  colors: Color[]
  rarity: string | null
  set: string | null
  setName: string | null
  produced: string[]
  text: string
  keywords: string[]
  // Copies you own of this card (any printing), across binders.
  owned: number
  commander: boolean
  // The full card, when it's saved on the phone (legality, color identity, copy rules).
  card: ScryfallCard | null
}

export type CardType =
  | 'Creature'
  | 'Planeswalker'
  | 'Battle'
  | 'Instant'
  | 'Sorcery'
  | 'Artifact'
  | 'Enchantment'
  | 'Land'
  | 'Other'

// The order types are listed in, with how they look.
export const TYPES: { type: CardType; plural: string; color: string; icon: string }[] = [
  { type: 'Creature', plural: 'Creatures', color: '#D4A64A', icon: 'M7 20c0-4 2-6 5-6s5 2 5 6M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z' },
  { type: 'Planeswalker', plural: 'Planeswalkers', color: '#B98AB0', icon: 'M12 3v18M8 7h8M7 12h10' },
  { type: 'Battle', plural: 'Battles', color: '#D98A5E', icon: 'M5 19L19 5M14 5h5v5M5 5l5 5M14 14l5 5' },
  { type: 'Instant', plural: 'Instants', color: '#5F8AC0', icon: 'M13 3L5 13.5h6L10 21l8-10.5h-6z' },
  { type: 'Sorcery', plural: 'Sorceries', color: '#C2553E', icon: 'M12 3c3 4 6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 9 7 12 3z' },
  { type: 'Artifact', plural: 'Artifacts', color: '#A7B4C2', icon: 'M12 3l7 4v10l-7 4-7-4V7z' },
  { type: 'Enchantment', plural: 'Enchantments', color: '#7FB06A', icon: 'M12 3l2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z' },
  { type: 'Land', plural: 'Lands', color: '#8C8475', icon: 'M3 19l6-9 4 5 3-4 5 8z' },
  { type: 'Other', plural: 'Other', color: '#6E685C', icon: 'M5 12h14' },
]
export const TYPE_INFO = Object.fromEntries(TYPES.map((t) => [t.type, t])) as Record<CardType, (typeof TYPES)[number]>

const front = (typeLine: string) => typeLine.split(' // ')[0]

// The type a card is listed under: lands first (an artifact land is a land), then creatures (an
// artifact creature is a creature), then the rest.
export function primaryType(typeLine: string): CardType {
  const t = front(typeLine)
  for (const type of ['Land', 'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'] as const) {
    if (new RegExp(`\\b${type}\\b`).test(t)) return type
  }
  return 'Other'
}

// "Legendary Creature — Human Wizard" -> ['Human', 'Wizard'].
export function subtypes(typeLine: string) {
  const after = front(typeLine).split(' — ')[1]
  return after ? after.trim().split(/\s+/) : []
}

export function lineFrom(
  cardId: string,
  board: Board,
  quantity: number,
  info: CardInfo,
  card: ScryfallCard | null,
  owned: number,
  commander = false,
): DeckLine {
  const face = card?.card_faces?.[0]
  const typeLine = card?.type_line ?? info.typeLine ?? ''
  const colors = ((card?.colors ?? face?.colors ?? []) as string[]).filter((c): c is Color => WUBRG.includes(c as Color))
  return {
    cardId,
    board,
    quantity,
    name: info.name,
    typeLine,
    type: primaryType(typeLine),
    cmc: card?.cmc ?? info.cmc ?? 0,
    price: info.priceEur ?? info.priceEurFoil,
    image: info.image,
    manaCost: card?.mana_cost ?? face?.mana_cost ?? '',
    colors,
    rarity: card?.rarity ?? null,
    set: card?.set ?? null,
    setName: card?.set_name ?? null,
    produced: card?.produced_mana ?? [],
    text: card?.oracle_text ?? (card?.card_faces ?? []).map((f) => f.oracle_text ?? '').join('\n'),
    keywords: card?.keywords ?? [],
    owned,
    commander,
    card,
  }
}

// ---- Mana symbols ----

// The colored and generic mana in a cost. Hybrid symbols count half for each color; Phyrexian and
// "2/W" count as their color.
export function pips(cost: string) {
  const colored: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  let generic = 0
  for (const [, sym] of cost.matchAll(/\{([^}]+)\}/g)) {
    if (/^\d+$/.test(sym)) {
      generic += Number(sym)
      continue
    }
    const parts = sym.split('/').filter((p): p is Color => WUBRG.includes(p as Color))
    for (const p of parts) colored[p] += 1 / parts.length
  }
  return { colored, generic }
}

// "{2}{B}{R}" -> ['2', 'B', 'R'] (the first face of split cards).
export const costSymbols = (cost: string) => [...cost.split(' // ')[0].matchAll(/\{([^}]+)\}/g)].map((m) => m[1])

export const colorKey = (colors: Color[]) => WUBRG.filter((c) => colors.includes(c)).join('')
// ['B', 'R'] -> "Black-Red".
export const colorsName = (colors: Color[]) =>
  colors.length === 0 ? 'Colorless' : WUBRG.filter((c) => colors.includes(c)).map((c) => COLOR_NAME[c]).join('-')

// ---- Grouping ----

export type GroupBy = 'types' | 'mv' | 'colors' | 'rarity' | 'set' | 'none'

export const GROUP_OPTIONS: { value: GroupBy; label: string; hint: string; icon: string }[] = [
  { value: 'mv', label: 'Mana value', hint: '0, 1, 2 … 7+', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5h4a2 2 0 0 1 0 4h-3v3h5' },
  { value: 'types', label: 'Types', hint: 'Creature, Instant…', icon: 'M4 5h16v4H4zM4 11.5h16v3.5H4zM4 17h16v3.5H4z' },
  { value: 'colors', label: 'Colors', hint: 'Black, Red, Multi…', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M3 12h18' },
  { value: 'rarity', label: 'Rarity', hint: 'Mythic, Rare…', icon: 'M12 3l2.6 6.4L21 10l-5 4.4 1.5 6.6L12 17.6 6.5 21 8 14.4 3 10l6.4-.6z' },
  { value: 'set', label: 'Set', hint: 'By expansion', icon: 'M4 6.5L12 3l8 3.5-8 3.5zM4 12l8 3.5 8-3.5M4 17.5L12 21l8-3.5' },
  { value: 'none', label: 'No group', hint: 'One flat list', icon: 'M5 7h14M5 12h14M5 17h14' },
]

export type GroupHead =
  | { kind: 'commander' }
  | { kind: 'type'; type: CardType }
  | { kind: 'mv'; mv: number }
  | { kind: 'colors'; colors: Color[] }
  | { kind: 'rarity'; rarity: string }
  | { kind: 'text'; text: string }

// What grouping reads from a card: deck lines, or a binder's cards (see binder/card-grid.tsx).
export type Groupable = Pick<DeckLine, 'commander' | 'type' | 'cmc' | 'colors' | 'rarity' | 'set' | 'setName' | 'quantity' | 'price'>

export type Group<L extends Groupable = DeckLine> = { key: string; name: string; head: GroupHead; lines: L[]; count: number; value: number }

const RARITIES = ['mythic', 'rare', 'uncommon', 'common']
const mvBucket = (cmc: number) => Math.min(Math.floor(cmc), 7)

// The lines in groups, in the order the groups are listed (lines keep their order within a group).
// Lands stay together whatever the grouping (they have no mana value or color of their own).
export function groupLines<L extends Groupable>(lines: L[], by: GroupBy): Group<L>[] {
  const map = new Map<string, Omit<Group<L>, 'count' | 'value'> & { order: number }>()
  const add = (key: string, name: string, head: GroupHead, order: number, line: L) => {
    const g = map.get(key) ?? { key, name, head, lines: [], order }
    g.lines.push(line)
    map.set(key, g)
  }
  const land = (l: L) => add('land', 'Lands', { kind: 'type', type: 'Land' }, 1000, l)
  const commanders = lines.filter((l) => l.commander).length
  for (const l of lines) {
    // The commander leads, whatever the grouping.
    if (l.commander) add('commander', commanders > 1 ? 'Commanders' : 'Commander', { kind: 'commander' }, -1, l)
    else if (by === 'none') add('all', 'All cards', { kind: 'text', text: '' }, 0, l)
    else if (by === 'types') {
      const i = TYPES.findIndex((t) => t.type === l.type)
      add(l.type, TYPES[i].plural, { kind: 'type', type: l.type }, i, l)
    } else if (l.type === 'Land') land(l)
    else if (by === 'mv') {
      const mv = mvBucket(l.cmc)
      add(`mv${mv}`, mv === 7 ? 'Mana value 7+' : `Mana value ${mv}`, { kind: 'mv', mv }, mv, l)
    } else if (by === 'colors') {
      const key = colorKey(l.colors)
      // Mono colors in WUBRG order, then multicolor, then colorless.
      const order = l.colors.length === 1 ? WUBRG.indexOf(l.colors[0]) : l.colors.length === 0 ? 900 : 100 + l.colors.length * 10
      add(`c${key}`, colorsName(l.colors), { kind: 'colors', colors: l.colors }, order, l)
    } else if (by === 'rarity') {
      const r = l.rarity ?? 'unknown'
      const i = RARITIES.indexOf(r)
      add(r, r === 'unknown' ? 'Unknown' : r.charAt(0).toUpperCase() + r.slice(1), { kind: 'rarity', rarity: r }, i < 0 ? 50 : i, l)
    } else {
      add(`s${l.set ?? '?'}`, l.setName ?? 'Unknown set', { kind: 'text', text: (l.set ?? '?').toUpperCase() }, 0, l)
    }
  }
  const groups = [...map.values()].map((g) => ({
    ...g,
    count: g.lines.reduce((n, l) => n + l.quantity, 0),
    value: g.lines.reduce((n, l) => n + l.quantity * (l.price ?? 0), 0),
  }))
  // Sets: biggest first.
  return groups.sort(
    (a, b) => (a.order < 0 ? -1 : b.order < 0 ? 1 : by === 'set' ? b.count - a.count : a.order - b.order) || a.name.localeCompare(b.name),
  )
}

// ---- Filtering ----

export type Ownership = 'all' | 'owned' | 'missing'
export type DeckFilters = { types: CardType[]; colors: (Color | 'M' | 'C')[]; mvs: number[]; own: Ownership }
export const NO_FILTERS: DeckFilters = { types: [], colors: [], mvs: [], own: 'all' }

export const activeFilters = (f: DeckFilters) => f.types.length + f.colors.length + f.mvs.length + (f.own === 'all' ? 0 : 1)

// Copies of this line the collection doesn't cover (every board asks for its own copies).
export const missingCopies = (l: DeckLine) => Math.max(0, l.quantity - l.owned)

// Types, colors and mana values each match any of their picks; all picked kinds must match.
export function filterLines(lines: DeckLine[], f: DeckFilters, query = '') {
  const q = query.trim().toLowerCase()
  return lines.filter((l) => {
    if (q && !l.name.toLowerCase().includes(q)) return false
    if (f.types.length && !f.types.includes(l.type)) return false
    if (f.mvs.length && (l.type === 'Land' || !f.mvs.includes(mvBucket(l.cmc)))) return false
    if (f.colors.length) {
      const multi = l.colors.length > 1
      const ok = f.colors.some((c) => (c === 'M' ? multi : c === 'C' ? l.colors.length === 0 : l.colors.includes(c)))
      if (!ok) return false
    }
    if (f.own === 'owned' && missingCopies(l) > 0) return false
    if (f.own === 'missing' && missingCopies(l) === 0) return false
    return true
  })
}

// ---- Deck size ----

const SINGLETON_SIZE: Partial<Record<DeckFormat, number>> = {
  Commander: 100,
  'Pauper Commander': 100,
  'Duel Commander': 100,
  PreDH: 100,
  Gladiator: 100,
  Brawl: 100,
  Oathbreaker: 60,
  'Standard Brawl': 60,
  'Competitive Brawl': 60,
}

// The deck size the format asks for (exactly that many), or null (at least 60, no exact size).
export const exactSize = (format: DeckFormat) => SINGLETON_SIZE[format] ?? null

// What makes a card able to lead a deck: a legendary creature (or planeswalker for Oathbreaker), or
// rules text that says it can be your commander.
export const canBeCommander = (l: DeckLine) =>
  (/\bLegendary\b/.test(l.typeLine) && /\b(Creature|Planeswalker)\b/.test(l.typeLine)) || /can be your commander/i.test(l.text)

// ---- Stats ----

const sum = (lines: DeckLine[]) => lines.reduce((n, l) => n + l.quantity, 0)

// Each copy as its own entry, for medians and pip totals.
function copies(lines: DeckLine[]) {
  return lines.flatMap((l) => Array.from({ length: l.quantity }, () => l))
}

export function manaValueStats(lines: DeckLine[]) {
  const spells = lines.filter((l) => l.type !== 'Land')
  const values = copies(spells).map((l) => l.cmc).sort((a, b) => a - b)
  const n = values.length
  const average = n ? values.reduce((a, b) => a + b, 0) / n : null
  const median = n ? (n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2) : null
  const curve = Array.from({ length: 8 }, (_, mv) => {
    const here = spells.filter((l) => mvBucket(l.cmc) === mv)
    const creatures = here.filter((l) => l.type === 'Creature')
    return { mv, creatures: sum(creatures), other: sum(here) - sum(creatures), lines: here }
  })
  return { average, median, spells: n, curve }
}

export function manaCostStats(lines: DeckLine[]) {
  const spells = lines.filter((l) => l.type !== 'Land')
  const colored: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  let generic = 0
  for (const l of spells) {
    const p = pips(l.manaCost)
    for (const c of WUBRG) colored[c] += p.colored[c] * l.quantity
    generic += p.generic * l.quantity
  }
  const totalColored = WUBRG.reduce((n, c) => n + colored[c], 0)
  const spellCount = sum(spells)

  // Spells by color: each mono color, multicolor, colorless.
  const byColor = [
    ...WUBRG.map((c) => ({ key: c as Color | 'M' | 'C', label: COLOR_NAME[c], n: sum(spells.filter((l) => l.colors.length === 1 && l.colors[0] === c)) })),
    { key: 'M' as const, label: 'Multicolor', n: sum(spells.filter((l) => l.colors.length > 1)) },
    { key: 'C' as const, label: 'Colorless', n: sum(spells.filter((l) => l.colors.length === 0)) },
  ].filter((b) => b.n > 0)

  // Costs asking for two or more colored mana, grouped by what they ask: {B}{B}, {B}{R}…
  const heavy = new Map<string, DeckLine[]>()
  for (const l of spells) {
    const p = pips(l.manaCost)
    const sig = WUBRG.flatMap((c) => Array<Color>(Math.floor(p.colored[c])).fill(c)).join('')
    if (sig.length >= 2) heavy.set(sig, [...(heavy.get(sig) ?? []), l])
  }
  const heaviest = [...heavy.entries()]
    .map(([sig, ls]) => ({ sig, n: sum(ls), lines: ls }))
    .sort((a, b) => b.sig.length - a.sig.length || b.n - a.n)
    .slice(0, 4)

  return { colored, totalColored, generic, spellCount, byColor, heaviest }
}

const TREASURE = /\btreasure tokens?\b/i

export function productionStats(lines: DeckLine[]) {
  const lands = lines.filter((l) => l.type === 'Land')
  const sources = lines.filter((l) => l.produced.length > 0)
  const rocks = sources.filter((l) => l.type === 'Artifact')
  const treasure = lines.filter((l) => l.type !== 'Land' && TREASURE.test(l.text))

  // How many sources make each color (a dual land counts for both).
  const make: Record<Color | 'C', number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
  for (const l of sources) for (const m of l.produced) if (m in make) make[m as Color | 'C'] += l.quantity

  // Lands by what they make.
  const outputs = new Map<string, { label: string; colors: Color[]; kind: 'mono' | 'multi' | 'any' | 'colorless' | 'none'; n: number }>()
  for (const l of lands) {
    const colors = WUBRG.filter((c) => l.produced.includes(c))
    const key = colors.length === 5 ? 'any' : colors.length ? colorKey(colors) : l.produced.includes('C') ? 'C' : 'none'
    const prev = outputs.get(key)
    if (prev) {
      prev.n += l.quantity
      continue
    }
    outputs.set(key, {
      label:
        key === 'any' ? 'Any color'
        : key === 'C' ? 'Colorless'
        : key === 'none' ? 'Other (fetch, utility)'
        : colors.length === 1 ? COLOR_NAME[colors[0]]
        : `${colorsName(colors)} ${colors.length === 2 ? 'duals' : 'lands'}`,
      colors,
      kind: key === 'any' ? 'any' : key === 'C' ? 'colorless' : key === 'none' ? 'none' : colors.length === 1 ? 'mono' : 'multi',
      n: l.quantity,
    })
  }
  const landOutputs = [...outputs.values()].sort((a, b) => b.n - a.n)

  return { lands: sum(lands), rocks: sum(rocks), treasure: sum(treasure), make, landOutputs }
}

export function typeStats(lines: DeckLine[]) {
  return TYPES.map((t) => ({ ...t, n: sum(lines.filter((l) => l.type === t.type)) })).filter((t) => t.n > 0)
}

export type SubtypeTab = 'creature' | 'land' | 'artifact' | 'other'
const SUBTYPE_TYPES: Record<SubtypeTab, CardType[]> = {
  creature: ['Creature'],
  land: ['Land'],
  artifact: ['Artifact'],
  other: ['Enchantment', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Other'],
}

// The most common subtypes among one kind of card (top 7, then "Other"), and the cards with none.
export function subtypeStats(lines: DeckLine[], tab: SubtypeTab) {
  const here = lines.filter((l) => SUBTYPE_TYPES[tab].includes(l.type))
  const counts = new Map<string, number>()
  let none = 0
  for (const l of here) {
    const subs = subtypes(l.typeLine)
    if (!subs.length) none += l.quantity
    for (const s of subs) counts.set(s, (counts.get(s) ?? 0) + l.quantity)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const rows = sorted.slice(0, 7).map(([label, n]) => ({ label, n, rest: false }))
  const restN = sorted.slice(7).reduce((n, [, c]) => n + c, 0)
  if (restN) rows.push({ label: 'Other', n: restN, rest: true })
  if (none) rows.push({ label: 'No type', n: none, rest: true })
  return { cards: sum(here), rows }
}

// The deck's colors: from its spells' colors and lands' output.
export function deckColors(lines: DeckLine[]) {
  return WUBRG.filter((c) => lines.some((l) => l.colors.includes(c)))
}
