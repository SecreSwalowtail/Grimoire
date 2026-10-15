// Color math for the binder color picker: hex <-> HSV (what the picker edits) and HSL shades
// (how a binder's cover, spine and zipper are made from the one color picked).

export type Hsv = { h: number; s: number; v: number } // h 0-360, s and v 0-1

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

// "#RRGGBB", any case.
export const isHex = (text: string) => /^#[0-9a-f]{6}$/i.test(text)

export function hexToHsv(hex: string): Hsv {
  const { r, g, b } = hexToRgb(hex)
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const d = max - min
  let h = 0
  if (d > 0) {
    const [R, G, B] = [r / 255, g / 255, b / 255]
    h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToHex({ h, s, v }: Hsv) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

function hexToHsl(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { h: hexToHsv(hex).h, s, l }
}

function hslToHex(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const v = l + c / 2
  return hsvToHex({ h, s: v === 0 ? 0 : c / v, v })
}

// The same hue and saturation at `factor` times the lightness: 0.5 is half as light.
export function shade(hex: string, factor: number) {
  const { h, s, l } = hexToHsl(hex)
  return hslToHex(h, s, clamp01(l * factor))
}
