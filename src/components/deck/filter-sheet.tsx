import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { Chip, PrimaryButton, SectionLabel, Segmented, Sheet, SheetHeader } from '@/components/controls'
import { ManaSymbol } from '@/components/mana-symbol'
import { Colors, Fonts } from '@/constants/theme'
import {
  activeFilters,
  COLOR_NAME,
  deckColors,
  filterLines,
  NO_FILTERS,
  TYPES,
  type CardType,
  type Color,
  type DeckFilters,
  type DeckLine,
  type Ownership,
} from '@/rules/deck-stats'
import { plural } from '@/utils/format'

const MVS = [0, 1, 2, 3, 4, 5, 6, 7]
const OWN: { value: Ownership; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'owned', label: 'Owned' },
  { value: 'missing', label: 'Missing' },
]

const flip = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

// D3 · Filter the deck's cards: types (with how many of each), colors (the deck's own, plus multi
// and colorless), mana value, and whether your binders hold them. The button shows how many cards
// the filters leave. Nothing applies until it's pressed.
export function FilterSheet({
  visible,
  value,
  lines,
  onApply,
  onClose,
}: {
  visible: boolean
  value: DeckFilters
  lines: DeckLine[]
  onApply: (filters: DeckFilters) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(value)
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) setDraft(value)
  }
  const set = (patch: Partial<DeckFilters>) => setDraft({ ...draft, ...patch })

  const types = TYPES.map((t) => ({ ...t, n: lines.filter((l) => l.type === t.type).reduce((n, l) => n + l.quantity, 0) })).filter((t) => t.n > 0)
  const colors: { key: Color | 'M' | 'C'; label: string }[] = [
    ...deckColors(lines).map((c) => ({ key: c, label: COLOR_NAME[c] })),
    { key: 'M', label: 'Multi' },
    { key: 'C', label: 'None' },
  ]
  const left = filterLines(lines, draft).reduce((n, l) => n + l.quantity, 0)
  const total = lines.reduce((n, l) => n + l.quantity, 0)
  const active = activeFilters(draft)

  return (
    <Sheet visible={visible} onClose={onClose} fullHeight>
      <SheetHeader title="Filter" onClose={onClose} onReset={() => setDraft(NO_FILTERS)} />
      <ScrollView showsVerticalScrollIndicator={false} style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
        <SectionLabel style={styles.label}>Card type</SectionLabel>
        <View style={styles.wrap}>
          {types.map((t) => (
            <Chip
              key={t.type}
              label={`${t.type} ${t.n}`}
              selected={draft.types.includes(t.type)}
              onPress={() => set({ types: flip<CardType>(draft.types, t.type) })}
            />
          ))}
        </View>

        <SectionLabel style={styles.label}>Color</SectionLabel>
        <View style={styles.wrap}>
          {colors.map((c) => {
            const on = draft.colors.includes(c.key)
            return (
              <Pressable
                key={c.key}
                style={[styles.color, on && styles.on]}
                onPress={() => set({ colors: flip(draft.colors, c.key) })}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={c.label}
              >
                {c.key === 'M' ? (
                  <View style={styles.multi} />
                ) : (
                  <ManaSymbol symbol={c.key} size={16} />
                )}
                <Text style={[styles.colorLabel, on && styles.onLabel]}>{c.label}</Text>
              </Pressable>
            )
          })}
        </View>

        <SectionLabel style={styles.label}>Mana value</SectionLabel>
        <View style={styles.mvs}>
          {MVS.map((mv) => {
            const on = draft.mvs.includes(mv)
            return (
              <Pressable
                key={mv}
                style={[styles.mv, on && styles.on]}
                onPress={() => set({ mvs: flip(draft.mvs, mv) })}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Mana value ${mv === 7 ? '7 or more' : mv}`}
              >
                <Text style={[styles.mvLabel, on && styles.onLabel]}>{mv === 7 ? '7+' : mv}</Text>
              </Pressable>
            )
          })}
        </View>

        <SectionLabel style={styles.label}>In your collection</SectionLabel>
        <Segmented label="In your collection" options={OWN} value={draft.own} onChange={(own) => set({ own })} />
      </ScrollView>
      <PrimaryButton
        label={active ? `Show ${plural(left, 'card')} · ${plural(active, 'filter')}` : `Show all ${total} cards`}
        onPress={() => {
          onApply(draft)
          onClose()
        }}
      />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    marginTop: 4,
  },
  bodyContent: {
    paddingBottom: 24,
  },
  label: {
    marginTop: 20,
    marginBottom: 10,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  color: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  on: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.14)',
  },
  colorLabel: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: '#CFC7B4',
  },
  onLabel: {
    color: '#F0D8A0',
  },
  // Gold for "more than one color", like multicolor card frames.
  multi: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.gold,
  },
  mvs: {
    flexDirection: 'row',
    gap: 6,
  },
  mv: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mvLabel: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: '#CFC7B4',
  },
})
