import type { Condition, Finish } from '@/db/collection'

// Card conditions as graded by Cardmarket and most stores, with how to tell them apart.
export const CONDITIONS: { code: Condition; name: string; hint: string }[] = [
  { code: 'NM', name: 'Near Mint', hint: 'looks unplayed, maybe tiny flaws' },
  { code: 'LP', name: 'Lightly Played', hint: 'light edge or surface wear' },
  { code: 'MP', name: 'Moderately Played', hint: 'visible wear, still sleeve-playable' },
  { code: 'HP', name: 'Heavily Played', hint: 'heavy wear, creases possible' },
  { code: 'DMG', name: 'Damaged', hint: 'tears, water damage or writing' },
]

// The languages the copy sheet offers (Scryfall codes), most printed first.
export const COPY_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ja', name: 'Japanese' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'it', name: 'Italian' },
  { code: 'es', name: 'Spanish' },
  { code: 'pt', name: 'Portuguese' },
]

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', ja: 'Japanese', de: 'German', fr: 'French', it: 'Italian', es: 'Spanish', pt: 'Portuguese',
  ru: 'Russian', ko: 'Korean', zhs: 'Simplified Chinese', zht: 'Traditional Chinese', he: 'Hebrew',
  la: 'Latin', grc: 'Ancient Greek', ar: 'Arabic', sa: 'Sanskrit', ph: 'Phyrexian',
}

export const conditionName = (code: string) => CONDITIONS.find((c) => c.code === code)?.name ?? code

export const FINISH_NAME: Record<Finish, string> = { nonfoil: 'Non-foil', foil: 'Foil', etched: 'Etched foil' }
