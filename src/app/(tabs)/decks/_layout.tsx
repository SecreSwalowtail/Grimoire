import { Stack } from 'expo-router'

import { Colors } from '@/constants/theme'

// Decks tab: the decks list, and folders pushed on top of it (the tab bar stays visible).
export default function DecksLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none', freezeOnBlur: true, contentStyle: { backgroundColor: Colors.background } }} />
}
