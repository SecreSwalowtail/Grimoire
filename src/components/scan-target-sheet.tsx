import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { SectionLabel, Segmented, Sheet, SheetHeader } from '@/components/controls'
import { deckMeta } from '@/components/decks/deck-row'
import { CheckBox, RadioDot } from '@/components/decks/parts'
import { Colors, Fonts } from '@/constants/theme'
import { binderSpine, type Binder } from '@/db/binders'
import { useDeckStore, type Board, type Deck } from '@/utils/deck-store'
import { setScanTarget, useScanTarget, type ScanTarget } from '@/utils/scan-target'

const BOARDS: { value: Board; label: string }[] = [
  { value: 'main', label: 'Main deck' },
  { value: 'side', label: 'Sideboard' },
  { value: 'maybe', label: 'Maybe' },
]

const BOARD_SHORT: Record<Board, string> = { main: '', side: ' · Sideboard', maybe: ' · Maybe' }

// The decks scans go into that still exist.
export function scanDecks(target: ScanTarget, decks: Deck[]) {
  return target.decks ? decks.filter((d) => target.deckIds.includes(d.id)) : []
}

// "Main binder", "Main binder + Izzet Wizards", "3 decks · Sideboard": where scans go, for the
// Scan screen's button and its toast. "Pick decks" when they only go into decks and none is picked.
export function scanTargetLabel(target: ScanTarget, binders: Binder[], decks: Deck[]) {
  const parts: string[] = []
  if (target.binder) {
    const binder = binders.find((b) => b.id === target.binderId) ?? binders[0]
    parts.push(binder?.name ?? 'Binder')
  }
  const into = scanDecks(target, decks)
  if (into.length) parts.push(`${into.length === 1 ? into[0].name : `${into.length} decks`}${BOARD_SHORT[target.board]}`)
  return parts.join(' + ') || 'Pick decks'
}

type Into = 'binder' | 'decks' | 'both'

const INTO: { value: Into; label: string }[] = [
  { value: 'binder', label: 'Binder' },
  { value: 'decks', label: 'Decks' },
  { value: 'both', label: 'Both' },
]

// Where scanned cards go: a binder (which one), decks (which ones, and which part), or both.
// Changes apply at once.
export function ScanTargetSheet({ visible, binders, onClose }: { visible: boolean; binders: Binder[]; onClose: () => void }) {
  const target = useScanTarget()
  const store = useDeckStore()
  const { decks } = store
  const picked = scanDecks(target, decks).map((d) => d.id)
  const binderId = binders.some((b) => b.id === target.binderId) ? target.binderId : (binders[0]?.id ?? null)
  const into: Into = target.binder && target.decks ? 'both' : target.decks ? 'decks' : 'binder'

  const set = (patch: Partial<ScanTarget>) => setScanTarget({ ...target, ...patch })
  const toggleDeck = (id: string) => set({ deckIds: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id] })

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title="Scan into" onClose={onClose} />
      <ScrollView showsVerticalScrollIndicator={false} style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
        <Segmented
          label="Scan into"
          options={INTO}
          value={into}
          onChange={(next) => set({ binder: next !== 'decks', decks: next !== 'binder' })}
        />

        {target.binder && <SectionLabel style={styles.gap}>Binder</SectionLabel>}
        {target.binder &&
          binders.map((b) => (
            <Option
              key={b.id}
              selected={b.id === binderId}
              onPress={() => set({ binderId: b.id })}
              role="radio"
              label={b.name}
              icon={<View style={[styles.spine, { experimental_backgroundImage: binderSpine(b.color) }]} />}
            />
          ))}

        {target.decks && <SectionLabel style={styles.gap}>Decks</SectionLabel>}
        {target.decks && decks.length === 0 && <Text style={styles.note}>No decks yet. Make one in Decks first.</Text>}
        {target.decks && decks.length > 0 && picked.length === 0 && <Text style={styles.note}>Pick the decks scans go into.</Text>}
        {target.decks && decks.length > 0 && (
          <>
            <View style={styles.boards}>
              <Segmented label="Part of the deck" options={BOARDS} value={target.board} onChange={(board) => set({ board })} />
            </View>
            {decks.map((d) => (
              <Option
                key={d.id}
                selected={picked.includes(d.id)}
                onPress={() => toggleDeck(d.id)}
                role="checkbox"
                label={d.name}
                meta={deckMeta(d, store)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </Sheet>
  )
}

function Option({
  selected,
  onPress,
  role,
  label,
  meta,
  icon,
}: {
  selected: boolean
  onPress: () => void
  role: 'radio' | 'checkbox'
  label: string
  meta?: string
  icon?: ReactNode
}) {
  return (
    <Pressable
      style={[styles.option, selected && styles.optionOn]}
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
    >
      {icon}
      <View style={styles.optionText}>
        <Text style={styles.optionLabel} numberOfLines={1}>{label}</Text>
        {meta != null && <Text style={styles.optionMeta} numberOfLines={1}>{meta}</Text>}
      </View>
      {role === 'radio' ? <RadioDot selected={selected} /> : <CheckBox checked={selected} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    marginTop: 8,
  },
  bodyContent: {
    gap: 8,
    paddingBottom: 24,
  },
  gap: {
    marginTop: 14,
    marginLeft: 2,
  },
  boards: {
    marginBottom: 4,
  },
  note: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.goldLight,
  },
  option: {
    minHeight: 56,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  optionOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.08)',
  },
  spine: {
    width: 14,
    height: 32,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  optionMeta: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
})
