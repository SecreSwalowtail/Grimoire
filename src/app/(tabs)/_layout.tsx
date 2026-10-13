import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { getScanMode, pressCapture, useScanMode } from '@/utils/capture-button';

export default function TabLayout() {
  // In Bulk mode the Scan tab keeps its normal button: cards are captured automatically.
  const showShutter = useScanMode() === 'single'
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.label,
        sceneStyle: { backgroundColor: Colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Binder',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'books.vertical', android: 'menu_book' }} size={24} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'tag', android: 'sell' }} size={24} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          // Raised gold button in the middle of the tab bar, as in the design.
          // On the Scan tab (Single mode) it turns into the shutter, labelled "Capture".
          tabBarIcon: ({ focused }) =>
            focused && showShutter ? (
              <View style={styles.shutter}>
                <View style={styles.shutterInner} />
              </View>
            ) : (
              <View style={styles.scanButton}>
                <SymbolView name={{ ios: 'viewfinder', android: 'document_scanner' }} size={26} tintColor={Colors.onGold} />
              </View>
            ),
          tabBarLabel: ({ focused, color }) => (
            <Text style={[styles.label, { color }, focused && styles.labelActive]}>
              {focused && showShutter ? 'Capture' : 'Scan'}
            </Text>
          ),
          tabBarAccessibilityLabel: 'Scan',
        }}
        listeners={({ navigation }) => ({
          // Pressing the tab while already on it takes a picture (Single mode only).
          tabPress: () => {
            if (navigation.isFocused() && getScanMode() === 'single') pressCapture()
          },
        })}
      />
      <Tabs.Screen
        name="decks"
        options={{
          title: 'Decks',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'rectangle.stack', android: 'stacks' }} size={24} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'gearshape', android: 'settings' }} size={24} tintColor={color} />
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.background,
    borderTopColor: Colors.border,
  },
  label: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
  },
  labelActive: {
    fontFamily: Fonts.extraBold,
  },
  shutter: {
    width: 62,
    height: 62,
    marginTop: -32,
    borderRadius: 31,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 0 4px rgba(212,166,74,0.25)',
  },
  shutterInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5EEDD',
    borderWidth: 3,
    borderColor: Colors.onGold,
  },
  scanButton: {
    width: 58,
    height: 58,
    marginTop: -28,
    borderRadius: 20,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
