import Storage from 'expo-sqlite/kv-store'
import { useSyncExternalStore } from 'react'

import type { Condition } from '@/db/collection'
import type { PriceSource } from '@/utils/card-prices'
import { createListeners } from '@/utils/listeners'

// The user's settings (Settings screen), kept on the phone and read synchronously at start.

type Settings = {
  // The currency prices show in; null: from the phone's language (see money.ts).
  currency: string | null
  // Whose prices the Market and Card detail show first.
  priceSource: PriceSource
  // Off: no animations or card effects anywhere (dragging still works), for slower phones.
  animations: boolean
  // Light taps of the phone (card changes, price chart).
  haptics: boolean
  // The condition scanned cards are added in.
  scanCondition: Condition
}

const DEFAULTS: Settings = {
  currency: null,
  priceSource: 'cardmarket',
  animations: true,
  haptics: true,
  scanCondition: 'NM',
}

const KEY = 'settings'

function load(): Settings {
  try {
    const saved = Storage.getItemSync(KEY)
    return saved ? { ...DEFAULTS, ...(JSON.parse(saved) as Partial<Settings>) } : DEFAULTS
  } catch (e) {
    console.warn('Failed to read settings', e)
    return DEFAULTS
  }
}

let settings: Settings = load()
const changes = createListeners()

export const getSettings = () => settings

export function setSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch }
  changes.notify()
  try {
    Storage.setItemSync(KEY, JSON.stringify(settings))
  } catch (e) {
    console.warn('Failed to save settings', e)
  }
}

export const subscribeSettings = changes.subscribe

export const useSettings = () => useSyncExternalStore(subscribeSettings, getSettings)
