import { router } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { PrimaryButton, SectionLabel, Segmented, Sheet } from '@/components/controls'
import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import { getSavedCard, upsertCard } from '@/db/cards'
import type { ScryfallCard } from '@/db/scryfall'
import { copyRule, deckFit, shortName } from '@/rules/formats'
import {
  addDeckCards,
  cardInfoOf,
  cardUse,
  isCommander,
  useDeckStore,
  type Board,
  type Deck,
  type DeckData,
  type DeckFormat,
} from '@/utils/deck-store'
import { plural } from '@/utils/format'

// C6 · Add to deck. Pick the part of the deck (main, sideboard, maybe) and how many copies, then tap
// the decks to put them in (one or several), and the button adds them. Any card can go in any deck:
// what breaks the format's rules is only flagged here (gold), and the deck's Legal tab says how to
// fix it. Afterwards, if Card detail was opened from a deck (its card list, or its + and the Market),
// it goes back to that deck as it was left; otherwise it stays on Card detail.

const BOARDS: { value: Board; label: string }[] = [
  { value: 'main', label: 'Main deck' },
  { value: 'side', label: 'Sideboard' },
  { value: 'maybe', label: 'Maybe' },
]

const IN_BOARD: Record<Board, string> = { main: 'in the deck', side: 'in the sideboard', maybe: 'on the maybe list' }

// What all your decks need at once: the deck plus sideboard of every deck (not the maybe lists).
export function copiesNeeded(data: DeckData, name: string) {
  return data.cards.reduce((n, c) => n + (c.board !== 'maybe' && data.info[c.cardId]?.name === name ? c.quantity : 0), 0)
}

type Row = {
  deck: Deck
  note: string
  noteColor: string
}

type CommanderIdentity = Map<string, { colors: Set<string>; names: string[] }>

// Each deck's commander colors and names (from the commanders' saved data), for decks that have
// one. Read while `visible`.
export function useCommanderIdentity(visible: boolean) {
  const db = useSQLiteContext()
  const store = useDeckStore()
  const commanders = store.cards.filter((c) => isCommander(c, store.decks))
  const commanderKey = commanders.map((c) => `${c.deckId}:${c.cardId}`).join(',')
  const [identity, setIdentity] = useState<CommanderIdentity>(() => new Map())
  useEffect(() => {
    if (!visible) return
    let live = true
    ;(async () => {
      const next: CommanderIdentity = new Map()
      for (const pair of commanderKey ? commanderKey.split(',') : []) {
        const [deckId, cardId] = pair.split(':')
        const saved = await getSavedCard(db, cardId)
        if (!saved) continue
        const entry = next.get(deckId) ?? { colors: new Set<string>(), names: [] }
        for (const c of saved.card.color_identity ?? []) entry.colors.add(c)
        entry.names.push(shortName(saved.card))
        next.set(deckId, entry)
      }
      if (live) setIdentity(next)
    })().catch((e) => console.warn('Failed to read commanders', e))
    return () => {
      live = false
    }
  }, [visible, commanderKey, db])
  return identity
}

export function AddToDeckSheet({
  visible,
  card,
  owned,
  fromDeck,
  onClose,
  onNewDeck,
}: {
  visible: boolean
  card: ScryfallCard
  owned: number
  // The deck Card detail was opened from, if any.
  fromDeck?: string
  onClose: () => void
  onNewDeck: (board: Board) => void
}) {
  const db = useSQLiteContext()
  const store = useDeckStore()
  const [board, setBoard] = useState<Board>('main')
  const [amount, setAmount] = useState(1)
  const [picked, setPicked] = useState<string[]>([])
  const name = card.name
  const identity = useCommanderIdentity(visible)

  // Fresh each time it opens (state adjusted during render).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setAmount(1)
      setPicked([])
    }
  }

  // Counted once per render: this sheet renders with the screen even while it's closed, and
  // counting per deck went through every deck card for every deck (50 decks x 4,000 cards).
  const use = cardUse(name, store)
  const rulesByFormat = new Map<DeckFormat, { fit: ReturnType<typeof deckFit>; rule: ReturnType<typeof copyRule> }>()
  const rulesFor = (format: DeckFormat) => {
    let found = rulesByFormat.get(format)
    if (!found) {
      found = { fit: deckFit(card, format), rule: copyRule(card, format) }
      rulesByFormat.set(format, found)
    }
    return found
  }

  const rows: Row[] = store.decks.map((deck) => {
    const { fit, rule } = rulesFor(deck.format)
    const counts = use.get(deck.id) ?? { main: 0, side: 0, maybe: 0 }
    const here = counts[board]
    // What would break the format's rules: not legal, outside the commander's colors, too many copies.
    const id = identity.get(deck.id)
    const outside = id ? (card.color_identity ?? []).filter((c) => !id.colors.has(c)) : []
    const played = board === 'maybe' ? 0 : counts.main + counts.side + amount
    const warning =
      board === 'maybe' ? null
      : !fit.allowed ? fit.reason ?? 'Not allowed in this format'
      : outside.length ? `Outside ${id!.names.join(' & ')}'s colors`
      : rule.max != null && played > rule.max ? `Over the limit · ${rule.label.toLowerCase()}`
      : null
    const note = warning ?? (here > 0 ? `${here} ${IN_BOARD[board]}` : rule.label)
    const noteColor = warning ? Colors.goldLight : here > 0 ? Colors.positive : Colors.textMuted
    return { deck, note: warning ? `${note} · not legal` : note, noteColor }
  })

  const chosen = rows.filter((r) => picked.includes(r.deck.id))
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id])

  const add = async () => {
    if (chosen.length === 0) {
      onClose()
      return
    }
    await upsertCard(db, card).catch(() => undefined)
    const info = cardInfoOf(card)
    for (const r of chosen) addDeckCards(r.deck.id, card.id, info, board, amount)
    onClose()
    // dismissTo, not navigate: from Card detail (on the root stack) navigate pushes a second copy of
    // the tabs, holding only the deck, so going back from it lands on Binder.
    if (fromDeck && store.decks.some((d) => d.id === fromDeck))
      router.dismissTo({ pathname: '/decks/deck/[deckId]', params: { deckId: fromDeck } })
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">Add to deck</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {shortName(card)} · you own <Text style={styles.strong}>{owned}</Text>
          </Text>
        </View>
        <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Icon name={{ ios: 'xmark', android: 'close' }} size={18} tintColor={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
        <Segmented label="Add to which part of the deck" options={BOARDS} value={board} onChange={setBoard} />

        <View style={styles.options}>
          <View style={styles.option}>
            <Text style={styles.optionTitle}>Copies</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.step}
                onPress={() => setAmount(Math.max(1, amount - 1))}
                disabled={amount <= 1}
                accessibilityRole="button"
                accessibilityLabel="One copy fewer"
              >
                <Text style={[styles.stepLabel, amount <= 1 && styles.stepOff]}>−</Text>
              </TouchableOpacity>
              <Text style={styles.count} accessibilityLiveRegion="polite" accessibilityLabel={plural(amount, 'copy', 'copies')}>
                {amount}
              </Text>
              <TouchableOpacity
                style={styles.step}
                onPress={() => setAmount(Math.min(99, amount + 1))}
                accessibilityRole="button"
                accessibilityLabel="One copy more"
              >
                <Text style={[styles.stepLabel, styles.stepAdd]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <SectionLabel style={styles.label}>{rows.length ? 'Your decks · tap to pick' : 'Your decks'}</SectionLabel>
        {rows.length === 0 ? (
          <Text style={styles.none}>You have no decks yet.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((r, i) => {
              const folder = store.folders.find((f) => f.id === r.deck.folderId)
              const on = picked.includes(r.deck.id)
              return (
                <Pressable
                  key={r.deck.id}
                  style={[styles.row, i > 0 && styles.rowRule, on && styles.rowOn]}
                  onPress={() => toggle(r.deck.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${r.deck.name}, ${r.deck.format}. ${r.note}`}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.deckName} numberOfLines={1}>{r.deck.name}</Text>
                    <Text style={styles.deckMeta} numberOfLines={1}>{r.deck.format} · {folder ? folder.name : 'No folder'}</Text>
                    <Text style={[styles.note, { color: r.noteColor }]} numberOfLines={2}>{r.note}</Text>
                  </View>
                  <View style={[styles.box, styles.roundBox, on && styles.boxOn]}>
                    {on && <Icon name={{ ios: 'checkmark', android: 'check' }} size={14} tintColor={Colors.onGold} weight="bold" />}
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}

        <TouchableOpacity style={styles.newDeck} onPress={() => onNewDeck(board)} accessibilityRole="button">
          <Icon name={{ ios: 'plus', android: 'add' }} size={16} tintColor={Colors.goldLight} weight="bold" />
          <Text style={styles.newDeckLabel}>New deck with this card</Text>
        </TouchableOpacity>
      </ScrollView>

      <PrimaryButton
        label={chosen.length === 0 ? 'Done' : `Add ${plural(amount, 'card')} to ${plural(chosen.length, 'deck')}`}
        onPress={add}
      />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 32,
    lineHeight: 34,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  strong: {
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexShrink: 1,
    marginTop: 16,
  },
  bodyContent: {
    paddingBottom: 16,
  },
  // Copies and the rules checkbox, as two rows of one card.
  options: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
  },
  option: {
    minHeight: 58,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  stepper: {
    height: 42,
    paddingHorizontal: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.40)',
    backgroundColor: 'rgba(212,166,74,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  step: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  stepAdd: {
    color: Colors.goldLight,
  },
  stepOff: {
    color: '#5A5446',
  },
  count: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  box: {
    width: 24,
    height: 24,
    marginRight: 6,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(237,230,214,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBox: {
    borderRadius: 12,
    marginRight: 0,
  },
  boxOn: {
    borderWidth: 0,
    backgroundColor: Colors.gold,
  },
  label: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 2,
  },
  none: {
    marginLeft: 2,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  list: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  row: {
    minHeight: 72,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowRule: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.07)',
  },
  rowOn: {
    backgroundColor: 'rgba(212,166,74,0.12)',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  deckName: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  deckMeta: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  note: {
    fontSize: 12,
    fontFamily: Fonts.bold,
  },
  newDeck: {
    marginTop: 12,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(212,166,74,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  newDeckLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
})
