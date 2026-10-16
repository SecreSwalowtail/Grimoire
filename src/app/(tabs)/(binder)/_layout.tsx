import { Stack } from 'expo-router'

import { Colors } from '@/constants/theme'

// Binder tab: all binders, and one binder pushed on top of it (the tab bar stays visible).
export default function BinderLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: Colors.background } }} />
}
