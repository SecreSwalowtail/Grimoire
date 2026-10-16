import { SymbolView } from 'expo-symbols';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useCommanderIdentity } from '@/components/card/add-to-deck-sheet';
import { PrimaryButton, SectionLabel, Segmented, Sheet } from '@/components/controls';
import { Colors, Fonts } from '@/constants/theme';
import { getCardRows } from '@/db/cards';
import type { CollectionEntry } from '@/db/collection';
import type { ScryfallCard } from '@/db/scryfall';
import { copyRule, deckFit } from '@/rules/formats';
import { addCardsToDecks, useDeckStore, type Board, type CardInfo, type DeckFormat, type Undo } from '@/utils/deck-store';

// Add to deck, for the cards picked in a binder's edit mode: the part of the deck, one copy of each
// card or every copy picked, then tap the decks to put them in (one or several). Like Card detail's
// Add to deck, cards that break a format's rules still go in: they're only counted here (gold), and
// the deck's Legal tab says how to fix it. The cards stay in the binder.

const BOARDS: { value: Board; label: string }[] = [
  { value: 'main', label: 'Main deck' },
  { value: 'side', label: 'Sideboard' },
  { value: 'maybe', label: 'Maybe' },
]

const IN_BOARD: Record<Board, string> = { main: 'in the deck', side: 'in the sideboard', maybe: 'on the maybe list' }

// One copy of each card, or every copy picked.
export type Copies = 'one' | 'all'

type Saved = { info: CardInfo; card: ScryfallCard | null }

// The picked printings, once each (a printing can be in a binder in several finishes or conditions),
// with how many copies of it were picked.
function printingsOf(entries: CollectionEntry[]) {
  const byId = new Map<string, { cardId: string; name: string; copies: number }>()
  for (const e of entries) {
    const p = byId.get(e.card_id)
    if (p) p.copies += e.quantity
    else byId.set(e.card_id, { cardId: e.card_id, name: e.name, copies: e.quantity })
  }
  return [...byId.values()]
}

async function loadSaved(db: SQLiteDatabase, cardIds: string[]) {
  const rows = await getCardRows(db, cardIds)
  return new Map(
    rows.map((r): [string, Saved] => [
      r.id,
      {
        info: { name: r.name, typeLine: r.type_line, cmc: r.cmc, priceEur: r.price_eur, priceEurFoil: r.price_eur_foil, image: r.image_uri },
        card: r.card,
      },
    ]),
  )
}

// Puts the picked cards in these decks. Returns the undo and how many copies went in each deck.
export async function addEntriesToDecks(db: SQLiteDatabase, entries: CollectionEntry[], deckIds: string[], board: Board, copies: Copies) {
  const printings = printingsOf(entries)
  const saved = await loadSaved(db, printings.map((p) => p.cardId))
  const add = printings.flatMap((p) => {
    const info = saved.get(p.cardId)?.info
    return info ? [{ cardId: p.cardId, info, quantity: copies === 'one' ? 1 : p.copies }] : []
  })
  const undo: Undo = addCardsToDecks(deckIds, add, board)
  return { undo, count: add.reduce((n, a) => n + a.quantity, 0) }
}

export function BinderToDeckSheet({
  visible,
  entries,
  onClose,
  onAdded,
  onNewDeck,
}: {
  visible: boolean
  entries: CollectionEntry[]
  onClose: () => void
  // After adding: the undo, how many decks and how many copies in each.
  onAdded: (undo: Undo, decks: number, copies: number) => void
  onNewDeck: (board: Board, copies: Copies) => void
}) {
  const db = useSQLiteContext()
  const store = useDeckStore()
  const [board, setBoard] = useState<Board>('main')
  const [copies, setCopies] = useState<Copies>('all')
  const [picked, setPicked] = useState<string[]>([])
  const [saved, setSaved] = useState<Map<string, Saved>>(() => new Map())
  const identity = useCommanderIdentity(visible)

  // Fresh each time it opens (state adjusted during render).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setBoard('main')
      setCopies('all')
      setPicked([])
    }
  }

  const printings = printingsOf(entries)
  const totalCopies = printings.reduce((n, p) => n + p.copies, 0)
  const idsKey = printings.map((p) => p.cardId).join(',')

  // The cards' full data, for the format checks.
  useEffect(() => {
    if (!visible || !idsKey) return
    let live = true
    loadSaved(db, idsKey.split(','))
      .then((next) => live && setSaved(next))
      .catch((e) => console.warn('Failed to read cards', e))
    return () => {
      live = false
    }
  }, [visible, idsKey, db])

  // The rest only matters while open (the sheet renders with the screen even while closed).
  const names = new Set(printings.map((p) => p.name))
  // Copies of the picked cards (by name, any printing) already in each deck, per part.
  const inDecks = new Map<string, Map<string, Record<Board, number>>>()
  // Copies of each name going in.
  const adding = new Map<string, number>()
  if (visible) {
    for (const c of store.cards) {
      const name = store.info[c.cardId]?.name
      if (!name || !names.has(name)) continue
      const deck = inDecks.get(c.deckId) ?? new Map<string, Record<Board, number>>()
      const counts = deck.get(name) ?? { main: 0, side: 0, maybe: 0 }
      counts[c.board] += c.quantity
      deck.set(name, counts)
      inDecks.set(c.deckId, deck)
    }
    for (const p of printings) adding.set(p.name, (adding.get(p.name) ?? 0) + (copies === 'one' ? 1 : p.copies))
  }

  const rules = new Map<string, { allowed: boolean; max: number | null }>()
  const rulesFor = (card: ScryfallCard, format: DeckFormat) => {
    const key = `${card.id}|${format}`
    let found = rules.get(key)
    if (!found) {
      found = { allowed: deckFit(card, format).allowed, max: copyRule(card, format).max }
      rules.set(key, found)
    }
    return found
  }

  const rows = !visible
    ? []
    : store.decks.map((deck) => {
        const here = inDecks.get(deck.id)
        const id = identity.get(deck.id)
        // Cards that would break the format's rules: not legal, outside the commander's colors, too many copies.
        const broken = new Set<string>()
        const already = new Set<string>()
        for (const p of printings) {
          const counts = here?.get(p.name)
          if (counts?.[board]) already.add(p.name)
          const card = saved.get(p.cardId)?.card
          if (board === 'maybe' || !card) continue
          const { allowed, max } = rulesFor(card, deck.format)
          const outside = id != null && (card.color_identity ?? []).some((c) => !id.colors.has(c))
          const played = (counts?.main ?? 0) + (counts?.side ?? 0) + (adding.get(p.name) ?? 0)
          if (!allowed || outside || (max != null && played > max)) broken.add(p.name)
        }
        const notes = [
          broken.size ? `${broken.size} not legal here` : null,
          already.size ? `${already.size} already ${IN_BOARD[board]}` : null,
        ].filter((n) => n != null)
        return { deck, note: notes.join(' · '), noteColor: broken.size ? Colors.goldLight : Colors.positive }
      })

  const chosen = rows.filter((r) => picked.includes(r.deck.id))
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id])
  const each = copies === 'one' ? printings.length : totalCopies

  const add = async () => {
    if (chosen.length === 0) {
      onClose()
      return
    }
    try {
      const { undo, count } = await addEntriesToDecks(db, entries, chosen.map((r) => r.deck.id), board, copies)
      onAdded(undo, chosen.length, count)
    } catch (e) {
      console.warn('Failed to add cards to decks', e)
    }
    onClose()
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">Add to deck</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            <Text style={styles.strong}>{printings.length}</Text> {printings.length === 1 ? 'card' : 'cards'} picked
            {totalCopies !== printings.length ? ` · ${totalCopies} copies` : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <SymbolView name={{ ios: 'xmark', android: 'close' }} size={18} tintColor={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
        <Segmented label="Add to which part of the deck" options={BOARDS} value={board} onChange={setBoard} />

        {/* Only when it makes a difference: some card was picked more than once. */}
        {totalCopies !== printings.length && (
          <>
            <SectionLabel style={styles.label}>Copies</SectionLabel>
            <Segmented
              label="Copies"
              options={[
                { value: 'all', label: `Every copy · ${totalCopies}` },
                { value: 'one', label: `1 of each · ${printings.length}` },
              ]}
              value={copies}
              onChange={setCopies}
            />
          </>
        )}

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
                    {r.note !== '' && <Text style={[styles.note, { color: r.noteColor }]} numberOfLines={2}>{r.note}</Text>}
                  </View>
                  <View style={[styles.box, on && styles.boxOn]}>
                    {on && <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={14} tintColor={Colors.onGold} weight="bold" />}
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}

        <TouchableOpacity style={styles.newDeck} onPress={() => onNewDeck(board, copies)} accessibilityRole="button">
          <SymbolView name={{ ios: 'plus', android: 'add' }} size={16} tintColor={Colors.goldLight} weight="bold" />
          <Text style={styles.newDeckLabel}>New deck with these cards</Text>
        </TouchableOpacity>
      </ScrollView>

      <PrimaryButton
        label={chosen.length === 0 ? 'Done' : `Add ${each} ${each === 1 ? 'card' : 'cards'} to ${chosen.length} ${chosen.length === 1 ? 'deck' : 'decks'}`}
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
  box: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(237,230,214,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 64,
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
