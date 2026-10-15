import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { SectionLabel } from '@/components/controls';
import { Colors, Fonts } from '@/constants/theme';
import { FOLDER_COLORS, withAlpha, type FolderColor } from '@/utils/deck-store';

// Pieces shared by the Decks screens and sheets.

const FOLDER_PATH = 'M2 6a2.5 2.5 0 0 1 2.5-2.5h6l2.6 3h10.4A2.5 2.5 0 0 1 26 9v10a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 2 19z'

// Folder outline in the folder's color, filled with a tint of it.
export function FolderIcon({ color, width = 28, fill = 0.18 }: { color: string; width?: number; fill?: number }) {
  return (
    <Svg width={width} height={(width * 24) / 28} viewBox="0 0 28 24" fill="none">
      <Path d={FOLDER_PATH} fill={withAlpha(color, fill)} stroke={color} strokeWidth={1.75} strokeLinejoin="round" />
    </Svg>
  )
}

// Stand-in "card art" until decks hold cards: a neutral card-back gradient.
const CARD_BACK = 'radial-gradient(circle at 50% 25%, #857C6C, #2D2A24 60%, #100F0D)'

// Three fanned cards, the deck's thumbnail. `large` is the Deck options header version.
export function DeckThumb({ large }: { large?: boolean }) {
  const s = large ? THUMB_LARGE : THUMB
  return (
    <View style={s.box}>
      <View style={[s.card, s.back]} />
      <View style={[s.card, s.middle]} />
      <View style={[s.card, s.front]} />
    </View>
  )
}

// Small card fan for folder cards on the Decks screen.
export function FolderFan() {
  return (
    <View style={styles.fan}>
      <View style={[styles.fanCard, { left: 4, top: 4, transform: [{ rotate: '-12deg' }] }]} />
      <View style={[styles.fanCard, { left: 15, top: 0 }]} />
      <View style={[styles.fanCard, { left: 27, top: 4, transform: [{ rotate: '12deg' }] }]} />
    </View>
  )
}

// "Deck deleted · Undo" bar above the tab bar. Hides itself after a few seconds.
export function UndoToast({
  message,
  onUndo,
  onHide,
  bottom = 16,
}: {
  message: string
  onUndo: () => void
  onHide: () => void
  bottom?: number
}) {
  // Keep the latest onHide without restarting the timer on every render.
  const hide = useRef(onHide)
  useEffect(() => {
    hide.current = onHide
  })
  useEffect(() => {
    const timer = setTimeout(() => hide.current(), 5000)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <View style={[styles.toast, { bottom }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <SymbolView name={{ ios: 'trash', android: 'delete' }} size={18} tintColor={Colors.textSecondary} />
      <Text style={styles.toastText} numberOfLines={1}>{message}</Text>
      <TouchableOpacity
        style={styles.undo}
        onPress={() => {
          onUndo()
          onHide()
        }}
        accessibilityRole="button"
      >
        <Text style={styles.undoLabel}>Undo</Text>
      </TouchableOpacity>
    </View>
  )
}

// Labelled text field. `accent` gives it the gold border the design uses for the field to fill in.
export function NameField({
  label,
  value,
  onChange,
  placeholder,
  accent,
  icon,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  accent?: boolean
  icon?: ReactNode
}) {
  return (
    <View style={styles.field}>
      <SectionLabel style={styles.fieldLabel}>{label}</SectionLabel>
      <View style={[styles.input, accent && styles.inputAccent]}>
        {icon}
        <TextInput
          style={styles.inputText}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          accessibilityLabel={label}
          autoCorrect={false}
          returnKeyType="done"
        />
      </View>
    </View>
  )
}

// The six folder colors (or the binder colors) as round swatches, the picked one ringed in its own color.
export function ColorPicker<K extends string = FolderColor>({
  value,
  onChange,
  colors = FOLDER_COLORS as Record<K, { label: string; hex: string }>,
  label: groupLabel = 'Folder color',
}: {
  value: K
  onChange: (value: K) => void
  colors?: Record<K, { label: string; hex: string }>
  label?: string
}) {
  return (
    <View style={styles.colors} accessibilityRole="radiogroup" accessibilityLabel={groupLabel}>
      {(Object.keys(colors) as K[]).map((key) => {
        const { label, hex } = colors[key]
        const selected = key === value
        return (
          <Pressable
            key={key}
            style={[styles.colorRing, selected && { borderColor: hex }]}
            onPress={() => onChange(key)}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: selected }}
          >
            <View style={[styles.colorDot, { backgroundColor: hex }]} />
          </Pressable>
        )
      })}
    </View>
  )
}

// Square checkbox (New folder's deck list) or round one (Organize), gold when checked.
export function CheckBox({ checked, round }: { checked: boolean; round?: boolean }) {
  return (
    <View style={[styles.box, round && styles.boxRound, checked && styles.boxChecked]}>
      {checked && <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={round ? 13 : 14} tintColor={Colors.onGold} weight="bold" />}
    </View>
  )
}

// Radio circle with a dot in `color` when selected.
export function RadioDot({ selected, color = Colors.gold, style }: { selected: boolean; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.radio, selected && { borderWidth: 2, borderColor: color }, style]}>
      {selected && <View style={[styles.radioDot, { backgroundColor: color }]} />}
    </View>
  )
}

const cardShadow = { boxShadow: '0 0 0 1px rgba(237,230,214,0.12)' }

const THUMB = StyleSheet.create({
  box: { width: 50, height: 56 },
  card: { position: 'absolute', width: 32, height: 46, borderRadius: 5, experimental_backgroundImage: CARD_BACK, ...cardShadow },
  back: { left: 0, top: 6, transform: [{ rotate: '-9deg' }] },
  middle: { left: 9, top: 3, transform: [{ rotate: '-2deg' }] },
  front: { left: 18, top: 6, transform: [{ rotate: '7deg' }], boxShadow: '0 0 0 1px rgba(237,230,214,0.16), 0 6px 14px rgba(0,0,0,0.4)' },
})

const THUMB_LARGE = StyleSheet.create({
  box: { width: 60, height: 66 },
  card: { position: 'absolute', width: 38, height: 54, borderRadius: 6, experimental_backgroundImage: CARD_BACK, ...cardShadow },
  back: { left: 0, top: 8, transform: [{ rotate: '-10deg' }] },
  middle: { left: 11, top: 4, transform: [{ rotate: '-2deg' }] },
  front: { left: 22, top: 8, transform: [{ rotate: '8deg' }], boxShadow: '0 0 0 1px rgba(237,230,214,0.16), 0 8px 18px rgba(0,0,0,0.45)' },
})

const styles = StyleSheet.create({
  fan: {
    width: 52,
    height: 34,
    marginRight: 2,
  },
  fanCard: {
    position: 'absolute',
    width: 22,
    height: 30,
    borderRadius: 4,
    experimental_backgroundImage: CARD_BACK,
    boxShadow: '0 0 0 1px rgba(237,230,214,0.14)',
  },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 56,
    paddingLeft: 16,
    paddingRight: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: Colors.selected,
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toastText: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  undo: {
    height: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  undoLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    marginLeft: 2,
  },
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.14)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inputAccent: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
  },
  inputText: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  colors: {
    flexDirection: 'row',
    gap: 12,
  },
  colorRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(237,230,214,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxRound: {
    borderRadius: 12,
    borderColor: 'rgba(237,230,214,0.28)',
  },
  boxChecked: {
    borderWidth: 0,
    backgroundColor: Colors.gold,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(237,230,214,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
})
