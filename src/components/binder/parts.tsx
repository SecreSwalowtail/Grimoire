import { useRef, type ReactNode } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'

import { PathIcon } from '@/components/deck/parts'
import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import { plural } from '@/utils/format'
import { useMoney } from '@/utils/money'
import { useSearchBack } from '@/utils/use-search-back'

// "All binders  €1,284.60          ▲ €42.10 / 312 cards"
export function ValueSummary({ label, value, cards, change }: { label: string; value: number; cards: number; change: number | null }) {
  const money = useMoney()
  const cardsText = plural(cards, 'card')
  return (
    <View style={styles.valueRow} accessible accessibilityLabel={`${label} ${money.eur(value)}, ${cardsText}`}>
      <View>
        <Text style={styles.sectionLabel}>{label}</Text>
        <Text style={styles.value}>{money.eur(value)}</Text>
      </View>
      <View style={styles.changeBox}>
        {change != null && (
          <Text style={[styles.change, { color: change >= 0 ? Colors.positive : Colors.negative }]}>
            {change >= 0 ? '▲' : '▼'} {money.eur(Math.abs(change))}
          </Text>
        )}
        <Text style={styles.changeLabel}>
          {cardsText}
        </Text>
      </View>
    </View>
  )
}

// `trailing`: buttons at the field's right end (a binder's Group by).
export function SearchField({
  value,
  onChange,
  placeholder,
  trailing,
}: {
  value: string
  onChange: (text: string) => void
  placeholder: string
  trailing?: ReactNode
}) {
  const input = useRef<TextInput>(null)
  useSearchBack(input)
  return (
    <View style={[styles.search, trailing != null && styles.searchWithTools]}>
      <Icon name={{ ios: 'magnifyingglass', android: 'search' }} size={20} tintColor={Colors.textSecondary} />
      <TextInput
        ref={input}
        style={styles.searchInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {trailing}
    </View>
  )
}

// A small labeled button inside the search field, like the deck's Group by.
export function SearchTool({ icon, label, onPress, accessibilityLabel }: { icon: string; label: string; onPress: () => void; accessibilityLabel: string }) {
  return (
    <TouchableOpacity style={styles.tool} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      <PathIcon d={icon} color={Colors.goldLight} size={15} />
      <Text style={styles.toolLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  )
}

export function SortButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.iconBtn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Icon name={{ ios: 'arrow.up.arrow.down', android: 'sort' }} size={20} tintColor={Colors.text} />
    </TouchableOpacity>
  )
}

// A quiet line at the top of a list saying what holding something in it does.
export function HoldHint({ label }: { label: string }) {
  return (
    <View style={styles.holdHint}>
      <Icon name={{ ios: 'hand.draw', android: 'drag_pan' }} size={14} tintColor={Colors.textMuted} />
      <Text style={styles.holdHintText}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  holdHint: {
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  holdHintText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  value: {
    marginTop: 6,
    fontSize: 34,
    fontFamily: Fonts.extraBold,
    letterSpacing: -0.5,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  changeBox: {
    alignItems: 'flex-end',
    paddingBottom: 5,
  },
  change: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
  },
  changeLabel: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  search: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchWithTools: {
    paddingRight: 4,
  },
  tool: {
    height: 38,
    maxWidth: 120,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: Colors.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toolLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
