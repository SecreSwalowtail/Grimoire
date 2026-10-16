// Reads the set code, collector number and language from OCR text of a card's bottom-left corner.
//
// Modern frames (2023+):   "U 0293"        / "MH3 • EN ✒ Eric Peterson"
// Older frames (2015-22):  "123/264 R"     / "DOM • EN ✒ Artist Name"
// OCR often reads "•" as ".", "*", "-", ">" or nothing, confuses O/0 and I/l/1, glues the rarity
// letter to the number ("RO022") and the set code to the language ("WHOEN"), drops letters
// ("FDN T" for "FDN • IT"), splits one line into pieces, and the strip may hold flavor text too.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic'

export type CollectorLine = {
  set: string // lower case, as Scryfall uses it
  // Possible collector numbers, most likely first, without leading zeros (as Scryfall uses them).
  collectorNumbers: string[]
  language: string // Scryfall language code ('en' when it couldn't be read)
  rarity: Rarity | null // from the rarity letter, if OCR found one
}

// Language codes printed on cards -> Scryfall codes.
export const LANGUAGES: Record<string, string> = {
  EN: 'en', ES: 'es', SP: 'es', FR: 'fr', DE: 'de', IT: 'it', PT: 'pt',
  JP: 'ja', JA: 'ja', KO: 'ko', KR: 'ko', RU: 'ru', CS: 'zhs', CT: 'zht', PH: 'ph',
}

const RARITIES: Record<string, Rarity> = { C: 'common', U: 'uncommon', R: 'rare', M: 'mythic' }

// An OCR line and where it was found, as ML Kit gives it.
export type OcrLine = { text: string; frame?: { left: number; top: number; width: number; height: number } }

// OCR lines -> rows of text, top to bottom: pieces side by side (ML Kit sometimes splits one printed
// line into several) are joined left to right. Without positions, the lines stay in their order.
export function ocrRows(lines: OcrLine[]): string[] {
  if (lines.some((l) => !l.frame)) return lines.map((l) => l.text)
  const placed = lines.map((l) => ({ text: l.text, ...l.frame!, mid: l.frame!.top + l.frame!.height / 2 }))
  placed.sort((a, b) => a.mid - b.mid)
  const rows: (typeof placed)[] = []
  for (const piece of placed) {
    const row = rows[rows.length - 1]
    // The same row: its middle is within the previous piece's height.
    const prev = row?.[row.length - 1]
    if (prev && Math.abs(piece.mid - prev.mid) < Math.min(prev.height, piece.height) * 0.6) row.push(piece)
    else rows.push([piece])
  }
  return rows.map((row) => row.sort((a, b) => a.left - b.left).map((p) => p.text).join(' '))
}

// OCR's usual mix-ups inside a set code.
const SWAPS: [RegExp, string][] = [
  [/0/g, 'O'],
  [/O/g, '0'],
  [/1/g, 'I'],
  [/I/g, '1'],
  [/5/g, 'S'],
  [/8/g, 'B'],
  [/N/g, 'M'],
  [/M/g, 'N'],
]

// A set code that exists (any of the OCR swaps), lower case. Without a set list, any 3-5 character
// code with a letter passes.
function knownSet(code: string, sets: Set<string> | null): string | null {
  if (!/^[A-Z0-9]{3,5}$/.test(code) || !/[A-Z]/.test(code)) return null
  if (!sets) return code.toLowerCase()
  for (const candidate of [code, ...SWAPS.map(([from, to]) => code.replace(from, to))]) {
    if (sets.has(candidate.toLowerCase())) return candidate.toLowerCase()
  }
  return null
}

type SetMatch = { set: string; language: string | null; at: number }

// The set (and language) on a row: "MH3 • EN", "MH3EN", "FDN T" (language unreadable). The code
// is one of the first tokens of the row; the artist's name follows, which is ignored.
function findSet(row: string, sets: Set<string> | null): SetMatch | null {
  const upper = row.toUpperCase()
  // Separators OCR turns the bullet and the artist's brush into.
  const tokens = upper
    .replace(/[•·*>|+:]/g, ' ')
    .replace(/([A-Z0-9])[.-](\s|[A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
  for (let i = 0; i < Math.min(tokens.length, 3); i++) {
    const token = tokens[i]
    const next = tokens[i + 1] ?? ''
    // Set codes are printed in capitals: "One of them…" in flavor text is no set line.
    if (!row.includes(token.slice(0, 3))) continue
    const at = upper.indexOf(token)
    // "MH3 EN"
    if (LANGUAGES[next]) {
      const set = knownSet(token, sets)
      if (set) return { set, language: LANGUAGES[next], at }
    }
    // "WHOEN": the code with the language glued on.
    for (const lang of Object.keys(LANGUAGES)) {
      if (token.length > lang.length + 2 && token.endsWith(lang)) {
        const set = knownSet(token.slice(0, -lang.length), sets)
        if (set) return { set, language: LANGUAGES[lang], at }
      }
    }
    if (sets) {
      // "VOWENLLN": code and language glued to the start of the artist's name.
      for (let len = 3; len <= 5; len++) {
        const lang = Object.keys(LANGUAGES).find((l) => token.slice(len).startsWith(l))
        const set = lang && token.length > len + lang.length ? knownSet(token.slice(0, len), sets) : null
        if (lang && set) return { set, language: LANGUAGES[lang], at }
      }
      // "TSRN": a real code with a scrap of the language glued on (the row's first token only).
      if (i === 0 && !knownSet(token, sets)) {
        for (let len = 3; len <= 5; len++) {
          const set = token.length - len >= 1 && token.length - len <= 2 ? knownSet(token.slice(0, len), sets) : null
          if (set) return { set, language: null, at }
        }
      }
    }
    // "FDN ITNATHANIEL": the language glued to the artist's name (only with the set list).
    if (sets) {
      const lang = Object.keys(LANGUAGES).find((l) => next.startsWith(l) && next.length > l.length + 2)
      const set = lang ? knownSet(token, sets) : null
      if (lang && set) return { set, language: LANGUAGES[lang], at }
    }
    // "FDN T": a real set code with something unreadable after it. Only with the set list (a
    // bare word is too weak a sign otherwise), and only as the row's first token.
    if (sets && i === 0 && next.length <= 2) {
      const set = knownSet(token, sets)
      if (set) return { set, language: null, at }
    }
  }
  return null
}

type Candidate = { number: string; score: number }

const digits = (s: string) => s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1')
const trimZeros = (s: string) => s.replace(/^0+(?=\d)/, '')

// Collector numbers and the rarity on a row above the set (or before it on the same row).
// `near`: 0 for the closest row, higher further away.
function findNumbers(row: string, near: number): { candidates: Candidate[]; rarity: Rarity | null } {
  const candidates: Candidate[] = []
  let rarity: Rarity | null = null
  // "R 0022", "RO022", "U0247", "P0034": the rarity letter (P: promo), then a zero-padded number
  // (modern frames). A lowercase o is a 0 too ("M 024o").
  for (const m of row.matchAll(/(?:^|[^A-Za-z0-9])([CURMSLTP])\s*([0-9OoIl]{3,4})(?=$|[^0-9])/g)) {
    if (RARITIES[m[1]]) rarity = RARITIES[m[1]]
    candidates.push({ number: trimZeros(digits(m[2])), score: 200 - near })
  }
  // "225/277 R" (older frames).
  for (const m of row.matchAll(/(?:^|[^A-Za-z0-9])([0-9OIl]{1,4}[a-z]?)\s*\/\s*[0-9OIl]{1,4}(?:\s*([CURMSLTP])\b)?/g)) {
    const r = m[2] && RARITIES[m[2]]
    if (r) rarity = r
    candidates.push({ number: trimZeros(digits(m[1])), score: 190 - near })
  }
  // A lone rarity letter.
  const lone = row.match(/(?:^|[^A-Za-z0-9])([CURM])(?=$|[^A-Za-z0-9])/)
  if (lone && !rarity) rarity = RARITIES[lone[1]]
  // Any other number: longer beats shorter (stray single digits are common), zero-padded beats both.
  // Never the set's total after a "/" ("/287" when the number before it wasn't read).
  for (const m of row.matchAll(/(?:^|[^A-Za-z0-9/])([0-9OIl]{1,4}[a-z]?)(?=$|[^A-Za-z0-9])/g)) {
    const d = digits(m[1])
    if (!/\d/.test(d)) continue
    let score = d.replace(/[a-z]/g, '').length * 10 - near
    if (d.length === 4 && d.startsWith('0')) score += 50
    candidates.push({ number: trimZeros(d), score })
  }
  return { candidates, rarity }
}

// `rows`: the OCR text in rows, top to bottom (see ocrRows). `sets`: Scryfall's set codes (lower
// case), to tell a set line from rules or flavor text; without it any 3-5 character code passes.
export function parseCollectorLine(rows: string[] | string, sets: Set<string> | null = null): CollectorLine | null {
  const lines = (typeof rows === 'string' ? rows.split(/\r?\n/) : rows).map((l) => l.trim()).filter(Boolean)

  // The set line is the most distinctive part; the collector info sits at the bottom, so look
  // from the bottom up. Number and rarity are on the rows just above it, or before it on its row.
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = findSet(lines[i], sets)
    if (!match) continue
    const sources = [lines[i].slice(0, match.at), lines[i - 1] ?? '', lines[i - 2] ?? '']
    const candidates: Candidate[] = []
    let rarity: Rarity | null = null
    sources.forEach((row, near) => {
      const found = findNumbers(row, near)
      candidates.push(...found.candidates)
      rarity ??= found.rarity
    })
    if (candidates.length === 0) continue
    candidates.sort((a, b) => b.score - a.score)
    return {
      set: match.set,
      collectorNumbers: [...new Set(candidates.map((c) => c.number))],
      language: match.language ?? 'en',
      rarity,
    }
  }
  return null
}
