import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import { useModalAnimation } from '@/utils/motion'

export type CardSort = 'recent' | 'price' | 'priceAsc' | 'name'

export const CARD_SORTS: { value: CardSort; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'price', label: 'Price: high to low' },
  { value: 'priceAsc', label: 'Price: low to high' },
  { value: 'name', label: 'Name: A to Z' },
]

// Small dropdown under a header button: a Binder's sort, the Market's price source. `title`: its heading.
export function SortMenu<T extends string>({
  visible,
  top,
  title = 'Sort by',
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean
  top: number
  title?: string
  options: { value: T; label: string }[]
  value: T
  onSelect: (value: T) => void
  onClose: () => void
}) {
  const modalAnimation = useModalAnimation()
  return (
    <Modal visible={visible} transparent animationType={modalAnimation} onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={`Close ${title.toLowerCase()} menu`} />
      <View style={[styles.menu, { top }]} accessibilityRole="menu">
        <Text style={styles.heading}>{title}</Text>
        {options.map((option) => {
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
              {selected && <Icon name={{ ios: 'checkmark', android: 'check' }} size={16} tintColor={Colors.goldLight} />}
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
