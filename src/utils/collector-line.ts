// Reads the set code, collector number and language from OCR text of a card's bottom-left corner.
//
// Modern frames (2023+):   "U 0293"        / "MH3 • EN ✒ Eric Peterson"
// Older frames (2015-22):  "123/264 R"     / "DOM • EN ✒ Artist Name"
// OCR often reads "•" as ".", "*", "-" or nothing, confuses O/0 and I/l/1 in numbers,
// and splits the text into lines in odd ways (stray digits on their own line).

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic'

export type CollectorLine = {
  set: string // lower case, as Scryfall uses it
  // Possible collector numbers, most likely first, without leading zeros (as Scryfall uses them).
  collectorNumbers: string[]
  language: string // Scryfall language code
  rarity: Rarity | null // from the rarity letter, if OCR found one
}

// Language codes printed on cards -> Scryfall codes.
export const LANGUAGES: Record<string, string> = {
  EN: 'en', ES: 'es', SP: 'es', FR: 'fr', DE: 'de', IT: 'it', PT: 'pt',
  JP: 'ja', JA: 'ja', KO: 'ko', KR: 'ko', RU: 'ru', CS: 'zhs', CT: 'zht', PH: 'ph',
}

const RARITIES: Record<string, Rarity> = { C: 'common', U: 'uncommon', R: 'rare', M: 'mythic' }

// "MH3 • EN": a 3-5 character set code, an optional separator, then a language code.
const SET_LINE = new RegExp(
  `\\b([A-Z0-9]{3,5})\\s*[•·.*\\-+:]?\\s*(${Object.keys(LANGUAGES).join('|')})\\b`,
)

// A collector number: up to 4 digits, optional letter suffix (e.g. "123s"), optional "/total".
// O and I/l are accepted as digits because OCR mixes them up.
const NUMBER = /(?:^|[^A-Za-z0-9])([0-9OIl]{1,4}[a-z]?)(\s*\/\s*[0-9OIl]{1,4})?(?=$|[^A-Za-z0-9])/g

// A lone rarity letter, e.g. "M" or the "U" in "U 0293".
const RARITY = /(?:^|[^A-Za-z0-9])([CURM])(?=$|[^A-Za-z0-9])/

export function parseCollectorLine(text: string): CollectorLine | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  // Find the set/language line first: it's the most distinctive part.
  const setIndex = lines.findIndex((l) => SET_LINE.test(l.toUpperCase()))
  if (setIndex === -1) return null
  const setLine = lines[setIndex]
  const setMatch = setLine.toUpperCase().match(SET_LINE)!

  // Number and rarity come before the set code: on earlier lines, or earlier on the same line.
  const before = [...lines.slice(0, setIndex), setLine.slice(0, setLine.toUpperCase().indexOf(setMatch[0]))]

  type Candidate = { number: string; score: number }
  const candidates: Candidate[] = []
  let rarity: Rarity | null = null
  before.forEach((line, i) => {
    const r = line.match(RARITY)
    if (r) rarity = RARITIES[r[1]]
    for (const m of line.matchAll(NUMBER)) {
      const digits = m[1].replace(/O/g, '0').replace(/[Il]/g, '1')
      if (!/\d/.test(digits)) continue
      const number = digits.replace(/^0+(?=\d)/, '')
      // Rank: "278/275" style or zero-padded "0293" are almost certainly the number;
      // otherwise longer beats shorter (stray single digits are common), then closer to the set line.
      let score = digits.replace(/[a-z]/g, '').length * 10 + i
      if (m[2]) score += 100
      if (digits.length === 4 && digits.startsWith('0')) score += 50
      candidates.push({ number, score })
    }
  })
  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.score - a.score)
  const collectorNumbers = [...new Set(candidates.map((c) => c.number))]
  return {
    set: setMatch[1].toLowerCase(),
    collectorNumbers,
    language: LANGUAGES[setMatch[2]],
    rarity,
  }
}
