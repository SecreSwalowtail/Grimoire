import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';

// Placeholder screen: dark background + title. Replace per screen.
export function ScreenTemplate({ title }: { title: string }) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.title}>{title}</Text>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  title: {
    marginTop: 16,
    fontSize: 42,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
})
