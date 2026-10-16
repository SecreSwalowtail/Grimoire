// Colors from the "Binder" design canvas.
export const Colors = {
  background: '#0E0D0B',
  surface: '#17150F',
  border: 'rgba(237,230,214,0.08)',
  text: '#EDE6D6',
  textSecondary: '#A39B88',
  textMuted: '#8F8877',
  gold: '#D4A64A',
  goldLight: '#E8C06A',
  onGold: '#1A1408',
  positive: '#7FC7A6',
  negative: '#E8866A',
  // Delete and remove actions.
  danger: '#EE8466',
  // Buttons on a sheet, and the selected part of a segmented control.
  surfaceRaised: '#221F17',
  selected: '#2B261C',
}

// Neutral tile for mana symbols Scryfall has no drawing for.
export const MANA_NEUTRAL = '#f6f9fc'
export const MANA_NEUTRAL_BORDER = '#e3e8ee'

// Rarity dots next to set codes.
export const RarityColors: Record<string, string> = {
  mythic: '#E07B3C',
  rare: '#D4A64A',
  uncommon: '#A9B4C2',
  common: '#8F8877',
}

// Fonts from the design, loaded in src/app/_layout.tsx. Each weight is its own family:
// use these instead of fontWeight (Android ignores fontWeight on custom fonts).
export const Fonts = {
  // Cormorant Garamond: screen titles and card names
  serifMedium: 'CormorantGaramond_500Medium',
  // Flavor text on Card detail
  serifItalic: 'CormorantGaramond_500Medium_Italic',
  serif: 'CormorantGaramond_600SemiBold',
  serifBold: 'CormorantGaramond_700Bold',
  // Manrope: everything else
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extraBold: 'Manrope_800ExtraBold',
}
