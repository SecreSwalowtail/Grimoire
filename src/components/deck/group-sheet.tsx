import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SectionLabel, Sheet, SheetHeader } from '@/components/controls';
import { PathIcon } from '@/components/deck/parts';
import { Colors, Fonts } from '@/constants/theme';
import { GROUP_OPTIONS, groupLines, type DeckLine, type GroupBy } from '@/rules/deck-stats';

// D2 · Group by: how the deck's cards are grouped, with a preview of the groups this deck would
// get. "Group all" uses the choice for every deck.
export function GroupSheet({
  visible,
  value,
  lines,
  onApply,
  onClose,
}: {
  visible: boolean
  value: GroupBy
  lines: DeckLine[]
  onApply: (by: GroupBy, everyDeck: boolean) => void
  onClose: () => void
}) {
  const [pick, setPick] = useState(value)
  const [all, setAll] = useState(false)

  // Start from the deck's grouping each time it opens (state adjusted during render).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setPick(value)
      setAll(false)
    }
  }

  const preview = groupLines(lines, pick)
  const shown = preview.slice(0, 5)
  const label = GROUP_OPTIONS.find((o) => o.value === pick)!.label

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title="Group by" onClose={onClose} />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
        <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Group cards by">
          {GROUP_OPTIONS.map((o) => {
            const on = o.value === pick
            return (
              <Pressable
                key={o.value}
                style={[styles.option, on && styles.optionOn]}
                onPress={() => setPick(o.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <View style={[styles.icon, on && styles.iconOn]}>
                  <PathIcon d={o.icon} color={on ? Colors.onGold : '#CFC7B4'} size={18} />
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{o.label}</Text>
                  <Text style={styles.optionHint} numberOfLines={1}>{o.hint}</Text>
                </View>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.preview}>
          <SectionLabel>Preview</SectionLabel>
          <View style={styles.chips}>
            {shown.map((g) => (
              <View key={g.key} style={styles.chip}>
                <Text style={styles.chipLabel} numberOfLines={1}>{g.name}</Text>
                <Text style={styles.chipCount}>{g.count}</Text>
              </View>
            ))}
            {preview.length > shown.length && (
              <View style={styles.chip}>
                <Text style={styles.chipLabel}>+{preview.length - shown.length} more</Text>
              </View>
            )}
            {preview.length === 0 && <Text style={styles.none}>No cards yet.</Text>}
          </View>
        </View>

        <Pressable
          style={styles.all}
          onPress={() => setAll(!all)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: all }}
        >
          <View style={[styles.box, all && styles.boxOn]}>
            {all && <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={14} tintColor={Colors.onGold} weight="bold" />}
          </View>
          <View style={styles.optionText}>
            <Text style={styles.allTitle}>Group all</Text>
            <Text style={styles.allHint}>Use this grouping in every deck</Text>
          </View>
        </Pressable>
      </ScrollView>
      <PrimaryButton
        label={pick === 'none' ? 'Show as one list' : `Group by ${label.toLowerCase()}`}
        onPress={() => {
          onApply(pick, all)
          onClose()
        }}
      />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    marginTop: 18,
  },
  bodyContent: {
    paddingBottom: 20,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    width: '48%',
    flexGrow: 1,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.10)',
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOn: {
    backgroundColor: Colors.gold,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  optionHint: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  preview: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
  },
  chips: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    height: 28,
    maxWidth: '100%',
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: Colors.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: '#CFC7B4',
  },
  chipCount: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  none: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  all: {
    marginTop: 12,
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(237,230,214,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    borderWidth: 0,
    backgroundColor: Colors.gold,
  },
  allTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  allHint: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
})
