import { SymbolView } from 'expo-symbols';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

export type SortOption = 'recent' | 'price' | 'name'

const OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'price', label: 'Price: high to low' },
  { value: 'name', label: 'Name: A to Z' },
]

// Small dropdown under the Binder header's sort button.
export function SortMenu({
  visible,
  top,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean
  top: number
  value: SortOption
  onSelect: (value: SortOption) => void
  onClose: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sort menu" />
      <View style={[styles.menu, { top }]} accessibilityRole="menu">
        <Text style={styles.heading}>Sort by</Text>
        {OPTIONS.map((option) => {
          const selected = option.value === value
          return (
            <Pressable
              key={option.value}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={() => {
                onSelect(option.value)
                onClose()
              }}
              accessibilityRole="menuitem"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
              {selected && <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={16} tintColor={Colors.goldLight} />}
            </Pressable>
          )
        })}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    right: 20,
    width: 220,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
  },
  heading: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 4,
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  item: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemPressed: {
    backgroundColor: 'rgba(237,230,214,0.06)',
  },
  label: {
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  labelSelected: {
    fontFamily: Fonts.bold,
    color: Colors.goldLight,
  },
})
