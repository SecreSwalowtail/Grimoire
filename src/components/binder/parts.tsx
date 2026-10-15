import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { formatEur } from '@/utils/format';

// "All binders  €1,284.60          ▲ €42.10 / this week · 312 cards"
export function ValueSummary({ label, value, cards, change }: { label: string; value: number; cards: number; change: number | null }) {
  const cardsText = `${cards} ${cards === 1 ? 'card' : 'cards'}`
  return (
    <View style={styles.valueRow} accessible accessibilityLabel={`${label} ${formatEur(value)}, ${cardsText}`}>
      <View>
        <Text style={styles.sectionLabel}>{label}</Text>
        <Text style={styles.value}>{formatEur(value)}</Text>
      </View>
      <View style={styles.changeBox}>
        {change != null && (
          <Text style={[styles.change, { color: change >= 0 ? Colors.positive : Colors.negative }]}>
            {change >= 0 ? '▲' : '▼'} {formatEur(Math.abs(change))}
          </Text>
        )}
        <Text style={styles.changeLabel}>
          {change != null ? 'this week · ' : ''}{cardsText}
        </Text>
      </View>
    </View>
  )
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (text: string) => void; placeholder: string }) {
  return (
    <View style={styles.search}>
      <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={20} tintColor={Colors.textSecondary} />
      <TextInput
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
    </View>
  )
}

export function SortButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.iconBtn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <SymbolView name={{ ios: 'arrow.up.arrow.down', android: 'sort' }} size={20} tintColor={Colors.text} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
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
  searchInput: {
    flex: 1,
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
