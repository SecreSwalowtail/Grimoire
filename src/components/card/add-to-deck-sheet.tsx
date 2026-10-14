import { SymbolView } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { PrimaryButton, Segmented, Sheet } from '@/components/controls';
import { Colors, Fonts } from '@/constants/theme';
import { upsertCard } from '@/db/cards';
import type { ScryfallCard } from '@/db/scryfall';
import { copyRule, deckFit, shortName } from '@/rules/formats';
import {
  cardInfoOf,
  cardUse,
  setDeckCardCount,
  useDeckStore,
  type Board,
  type Deck,
  type DeckFormat,
  type DeckData,
} from '@/utils/deck-store';
import { formatEur } from '@/utils/format';

// C6 · Add to deck. Pick the part of the deck (main, sideboard, maybe), then set how many copies
// each deck holds. A deck counts every printing of the card; "+" adds the printing on show, "−"
// takes from it first. Decks whose format doesn't allow the card come last, greyed out.

const BOARDS: { value: Board; label: string }[] = [
  { value: 'main', label: 'Main deck' },
  { value: 'side', label: 'Sideboard' },
  { value: 'maybe', label: 'Maybe' },
]

const IN_BOARD: Record<Board, string> = { main: 'In this deck', side: 'In the sideboard', maybe: 'On the maybe list' }

// Copies of this card (any printing) in one part of a deck, per printing id.
function copiesIn(data: DeckData, deckId: string, board: Board, name: string) {
  return data.cards.filter((c) => c.deckId === deckId && c.board === board && data.info[c.cardId]?.name === name)
}

// What all your decks need at once: the deck plus sideboard of every deck (not the maybe lists).
export function copiesNeeded(data: DeckData, name: string) {
  return data.cards.reduce((n, c) => n + (c.board !== 'maybe' && data.info[c.cardId]?.name === name ? c.quantity : 0), 0)
}

export function AddToDeckSheet({
  visible,
  card,
  owned,
  cheapest,
  onClose,
  onNewDeck,
}: {
  visible: boolean
  card: ScryfallCard
  owned: number
  // Lowest EUR price among the card's printings, for the "buy the rest" note.
  cheapest: number | null
  onClose: () => void
  onNewDeck: (board: Board) => void
}) {
  const db = useSQLiteContext()
  const store = useDeckStore()
  const [board, setBoard] = useState<Board>('main')
  const name = card.name

  // Counted once per render: this sheet renders with the screen even while it's closed, and
  // counting per deck went through every deck card for every deck (50 decks x 4,000 cards).
  const use = cardUse(name, store)
  const formatRules = new Map<DeckFormat, { fit: ReturnType<typeof deckFit>; rule: ReturnType<typeof copyRule> }>()
  const rulesFor = (format: DeckFormat) => {
    let found = formatRules.get(format)
    if (!found) {
      found = { fit: deckFit(card, format), rule: copyRule(card, format) }
      formatRules.set(format, found)
    }
    return found
  }
  const rows = store.decks
    .map((deck) => ({ deck, ...rulesFor(deck.format), counts: use.get(deck.id) ?? { main: 0, side: 0, maybe: 0 } }))
    .sort((a, b) => Number(b.fit.allowed) - Number(a.fit.allowed))

  const change = async (deck: Deck, by: number) => {
    const here = copiesIn(store, deck.id, board, name)
    if (by > 0) {
      await upsertCard(db, card).catch(() => undefined)
      const mine = here.find((c) => c.cardId === card.id)
      setDeckCardCount(deck.id, card.id, cardInfoOf(card), board, (mine?.quantity ?? 0) + 1)
      return
    }
    // Take from the printing on show first, then from any other.
    const from = here.find((c) => c.cardId === card.id) ?? here[0]
    if (from) setDeckCardCount(deck.id, from.cardId, store.info[from.cardId], board, from.quantity - 1)
  }

  const needed = [...use.values()].reduce((sum, c) => sum + c.main + c.side, 0)
  const short = needed - owned

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
          <SymbolView name={{ ios: 'xmark', android: 'close' }} size={18} tintColor={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.boards}>
        <Segmented label="Add to which part of the deck" options={BOARDS} value={board} onChange={setBoard} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
        <Text style={styles.label}>Your decks · legal first</Text>
        {rows.length === 0 ? (
          <Text style={styles.none}>You have no decks yet.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map(({ deck, fit, rule, counts }, i) => {
              const folder = store.folders.find((f) => f.id === deck.folderId)
              const n = counts[board]
              // The copy limit covers the deck and its sideboard together.
              const played = board === 'maybe' ? n : counts.main + counts.side
              const atMax = board !== 'maybe' && rule.max != null && played >= rule.max
              let note = rule.label
              let noteColor: string = Colors.textMuted
              if (!fit.allowed) note = fit.reason ?? 'Not allowed in this format'
              else if (n > 0 && board !== 'maybe' && n > owned) {
                note = `Needs ${n} · you own ${owned} · ${n - owned} short`
                noteColor = Colors.goldLight
              } else if (n > 0) {
                note = `${IN_BOARD[board]} · ${n} ${n === 1 ? 'copy' : 'copies'}`
                noteColor = Colors.positive
              }
              return (
                <View key={deck.id} style={[styles.row, i > 0 && styles.rowRule, !fit.allowed && styles.rowOff]}>
                  <View style={styles.rowText}>
                    <Text style={styles.deckName} numberOfLines={1}>{deck.name}</Text>
                    <Text style={styles.deckMeta} numberOfLines={1}>{deck.format} · {folder ? `in ${folder.name}` : 'No folder'}</Text>
                    <Text style={[styles.note, { color: noteColor }]} numberOfLines={2}>{note}</Text>
                  </View>
                  {fit.allowed ? (
                    <View style={[styles.stepper, n > 0 && styles.stepperOn]}>
                      <TouchableOpacity
                        style={styles.step}
                        onPress={() => change(deck, -1)}
                        disabled={n === 0}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove one from ${deck.name}`}
                      >
                        <Text style={[styles.stepLabel, n === 0 && styles.stepOff]}>−</Text>
                      </TouchableOpacity>
                      <Text style={[styles.count, n === 0 && styles.countOff]} accessibilityLiveRegion="polite">{n}</Text>
                      <TouchableOpacity
                        style={styles.step}
                        onPress={() => change(deck, 1)}
                        disabled={atMax}
                        accessibilityRole="button"
                        accessibilityLabel={`Add one to ${deck.name}`}
                      >
                        <Text style={[styles.stepLabel, styles.stepAdd, atMax && styles.stepOff]}>+</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.notLegal}>
                      <Text style={styles.notLegalLabel}>Not legal</Text>
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        )}

        <TouchableOpacity style={styles.newDeck} onPress={() => onNewDeck(board)} accessibilityRole="button">
          <SymbolView name={{ ios: 'plus', android: 'add' }} size={16} tintColor={Colors.goldLight} weight="bold" />
          <Text style={styles.newDeckLabel}>New deck with this card</Text>
        </TouchableOpacity>
      </ScrollView>

      {short > 0 && (
        <TouchableOpacity
          style={styles.short}
          onPress={() => card.purchase_uris?.cardmarket && Linking.openURL(card.purchase_uris.cardmarket)}
          disabled={!card.purchase_uris?.cardmarket}
          accessibilityRole="link"
        >
          <SymbolView name={{ ios: 'exclamationmark.circle', android: 'error' }} size={18} tintColor={Colors.goldLight} />
          <Text style={styles.shortText}>
            Your decks need {needed} · you own {owned}. {short} more{cheapest != null ? ` from ${formatEur(cheapest * short)}` : ''}.
          </Text>
          {card.purchase_uris?.cardmarket && <Text style={styles.buy}>Buy</Text>}
        </TouchableOpacity>
      )}
      <PrimaryButton label="Done" onPress={onClose} />
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
  boards: {
    marginTop: 16,
  },
  body: {
    flexShrink: 1,
    marginTop: 18,
  },
  bodyContent: {
    paddingBottom: 16,
  },
  label: {
    marginBottom: 8,
    marginLeft: 2,
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
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
    minHeight: 76,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowRule: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.07)',
  },
  rowOff: {
    opacity: 0.55,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
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
  stepper: {
    height: 44,
    paddingHorizontal: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepperOn: {
    borderColor: 'rgba(212,166,74,0.40)',
    backgroundColor: 'rgba(212,166,74,0.10)',
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
    minWidth: 18,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  countOff: {
    color: Colors.textMuted,
  },
  notLegal: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: 'rgba(237,230,214,0.08)',
    justifyContent: 'center',
  },
  notLegalLabel: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.textSecondary,
  },
  newDeck: {
    marginTop: 10,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
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
  short: {
    marginBottom: 10,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.32)',
    backgroundColor: 'rgba(212,166,74,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shortText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.text,
  },
  buy: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
})
