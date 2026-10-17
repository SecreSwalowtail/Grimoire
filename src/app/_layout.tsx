import {
  CormorantGaramond_500Medium,
  CormorantGaramond_500Medium_Italic,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond'
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated'

import { FpsMeter } from '@/components/dev/fps-meter'
import { UpdateSheet } from '@/components/update-sheet'
import { migrateDbIfNeeded } from '@/db/schema'
import { loadDeckStore } from '@/utils/deck-store'
import { refreshRates } from '@/utils/money'
import { timed, useFpsMeter } from '@/utils/perf'
import { useSettings } from '@/utils/settings'

// Keep the splash screen up until the fonts are ready, so text never flashes in the system font.
SplashScreen.preventAutoHideAsync()

// The screens render only after this, so the decks are already loaded when Decks opens.
// If the decks can't be read, the rest of the app still opens (Decks starts empty and doesn't
// save, so nothing on disk is overwritten).
async function initDb(db: SQLiteDatabase) {
  await timed('startup: database migration', () => migrateDbIfNeeded(db))
  try {
    await timed('startup: load decks', () => loadDeckStore(db))
  } catch (error) {
    console.warn('Loading decks failed', error)
  }
}

export default function RootLayout() {
  const fpsMeter = useFpsMeter()
  // Settings → Animations off: every Reanimated animation finishes at once (dragging still works).
  const animations = useSettings().animations
  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_500Medium_Italic,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  })

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync()
  }, [fontsLoaded, fontError])

  // Today's exchange rates, for prices in the user's currency (kept a day).
  useEffect(() => {
    refreshRates()
  }, [])

  // On a font error, continue with system fonts rather than staying on the splash screen.
  if (!fontsLoaded && !fontError) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ReducedMotionConfig mode={animations ? ReduceMotion.System : ReduceMotion.Always} />
      <SQLiteProvider databaseName="binder.db" onInit={initDb}>
        <Stack screenOptions={{ headerShown: false, animation: 'none', freezeOnBlur: true }} />
        <UpdateSheet />
        {fpsMeter && <FpsMeter />}
      </SQLiteProvider>
    </GestureHandlerRootView>
  )
}
