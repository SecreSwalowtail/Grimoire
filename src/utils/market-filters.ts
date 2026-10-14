import { LANGUAGES } from '@/utils/collector-line';

// State of the Market filter sheet. Only the UI uses it so far: searches don't apply it yet.

export type FilterTab = 'format' | 'colors' | 'cost' | 'set' | 'language'

export type LegalStatus = 'legal' | 'restricted' | 'banned'
export type ColorMatch = 'exact' | 'atmost' | 'including'
export type CostMatch = 'exact' | 'contains' | 'mv'

export type MarketFilters = {
  formats: string[] // keys from FORMATS
  formatStatus: LegalStatus
  formatsMatchAll: boolean
  colors: string[] // W U B R G C
  colorMatch: ColorMatch
  colorIdentity: boolean
  colorCount: [number, number] // min and max number of colors, 0-5
  cost: string[] // mana symbols, e.g. ['2', 'G', 'W']
  costMatch: CostMatch
  sets: { code: string; name: string; year: string; size: number }[]
  exactPrint: boolean
  rarities: string[] // Scryfall rarities
  legendaryOnly: boolean
  languages: string[] // Scryfall language codes; empty = any
}

export const DEFAULT_FILTERS: MarketFilters = {
  formats: [],
  formatStatus: 'legal',
  formatsMatchAll: true,
  colors: [],
  colorMatch: 'atmost',
  colorIdentity: false,
  colorCount: [0, 5],
  cost: [],
  costMatch: 'exact',
  sets: [],
  exactPrint: true,
  rarities: [],
  legendaryOnly: false,
  languages: [],
}

// Which tabs have something set: they get a gold dot, and count towards the Filters badge.
export function activeTabs(f: MarketFilters): Record<FilterTab, boolean> {
  return {
    format: f.formats.length > 0,
    colors: f.colors.length > 0 || f.colorCount[0] > 0 || f.colorCount[1] < 5,
    cost: f.cost.length > 0,
    set: f.sets.length > 0 || f.rarities.length > 0 || f.legendaryOnly,
    language: f.languages.length > 0,
  }
}

export function activeFilterCount(f: MarketFilters) {
  return Object.values(activeTabs(f)).filter(Boolean).length
}

// The sheet's Reset button resets only the tab that is open.
export function resetTab(f: MarketFilters, tab: FilterTab): MarketFilters {
  const d = DEFAULT_FILTERS
  switch (tab) {
    case 'format':
      return { ...f, formats: d.formats, formatStatus: d.formatStatus, formatsMatchAll: d.formatsMatchAll }
    case 'colors':
      return { ...f, colors: d.colors, colorMatch: d.colorMatch, colorIdentity: d.colorIdentity, colorCount: d.colorCount }
    case 'cost':
      return { ...f, cost: d.cost, costMatch: d.costMatch }
    case 'set':
      return { ...f, sets: d.sets, exactPrint: d.exactPrint, rarities: d.rarities, legendaryOnly: d.legendaryOnly }
    case 'language':
      return { ...f, languages: d.languages }
  }
}

// A collector number as printed on cards: "293", "0293", "#293", "123/264", "7e".
// Cards also print a rarity letter next to it, before ("U 0293", 2023+ frames) or after
// ("123/264 R", older frames). It's accepted on either side and ignored.
const RARITY = '[CURMSLBTP]'
const NUMBER_PART = `(?:${RARITY}\\s+)?#?0*(\\d+[a-z]?)(?:\\s*\\/\\s*\\d+)?(?:\\s+${RARITY})?`
const NUMBER = new RegExp(`^${NUMBER_PART}$`, 'i')
// The set code may come with the printed language code ("MH3 • EN"), which is ignored too.
const SEP = '[\\s#:•·.-]+'
const SET_PART = `([a-z0-9]{2,6})(?:${SEP}(?:${Object.keys(LANGUAGES).join('|')}))?`
// Set code first: "MH3 293", "MH3 U 0293", "MH3 EN U 0293", "ltr #246", "DMU-107".
const SET_NUMBER = new RegExp(`^${SET_PART}${SEP}${NUMBER_PART}$`, 'i')
// Number first, as read off older frames line by line: "196/274 C M21", "196/274 C M21 • EN".
const NUMBER_SET = new RegExp(`^${NUMBER_PART}${SEP}${SET_PART}$`, 'i')

// Shown before a search: new cards (no reprints) from sets of the last three months, meant to be
// ordered by EDHREC rank. Scryfall has no price trends, so Commander popularity stands in for "trending".
export function trendingQuery() {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return `date>=${since} not:reprint game:paper`
}

// Search box text -> Scryfall query matching the name, rules text or type line, or the
// collector number (in any set, or in one set when a set code is given). An unknown set
// code just matches nothing, so "Island 5" still finds cards named that way.
export function textQuery(text: string) {
  const phrase = text.replace(/"/g, '').trim()
  const terms = [`"${phrase}"`, `o:"${phrase}"`, `t:"${phrase}"`]
  const number = phrase.match(NUMBER)
  const setNumber = phrase.match(SET_NUMBER)
  const numberSet = phrase.match(NUMBER_SET)
  const inSet = (set: string, cn: string) => `(s:${set.toLowerCase()} cn:"${cn.toLowerCase()}")`
  if (number) terms.push(`cn:"${number[1].toLowerCase()}"`)
  else if (setNumber) terms.push(inSet(setNumber[1], setNumber[2]))
  else if (numberSet) terms.push(inSet(numberSet[2], numberSet[1]))
  return `(${terms.join(' or ')})`
}
