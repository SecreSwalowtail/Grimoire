import { Image } from 'expo-image'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { BackHandler, Keyboard, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Segmented } from '@/components/controls'
import {
  dragGesture,
  DragGhost,
  DragScrollView,
  DropZone,
  EDIT_BAR,
  EditBar,
  TrashBubble,
  useCardDrag,
  type DropTarget,
} from '@/components/deck/card-drag'
import { CardsTab } from '@/components/deck/cards-tab'
import { FilterSheet } from '@/components/deck/filter-sheet'
import { GroupSheet } from '@/components/deck/group-sheet'
import { LegalTab } from '@/components/deck/legal-tab'
import { CROWN, ICON, PathIcon } from '@/components/deck/parts'
import { StatsTab } from '@/components/deck/stats-tab'
import { useDeckLines } from '@/components/deck/use-deck-lines'
import { useDeckSheets } from '@/components/decks/use-deck-sheets'
import { Icon } from '@/components/icon'
import { ManaSymbol } from '@/components/mana-symbol'
import { Colors, Fonts } from '@/constants/theme'
import { canShareCommand } from '@/rules/commander'
import {
  canBeCommander,
  COLOR_HEX,
  deckColors,
  exactSize,
  missingCopies,
  NO_FILTERS,
  type DeckFilters,
  type DeckLine,
} from '@/rules/deck-stats'
import { withAlpha } from '@/utils/color'
import {
  hasCommander,
  moveDeckCards,
  removeDeckCards,
  setCommanders,
  useDeckStore,
  type Board,
  type Deck,
  type Undo,
} from '@/utils/deck-store'
import { plural } from '@/utils/format'
import { setGroupBy, useGroupBy } from '@/utils/group-prefs'
import { useMoney } from '@/utils/money'

type Tab = 'cards' | 'stats' | 'legal'

const keyOf = (l: DeckLine) => `${l.cardId}|${l.board}`

// The card on show at the top: the commander; in a Commander-style deck without one, its first
// legendary creature; otherwise the most valuable card.
function coverLine(deck: Deck, main: DeckLine[]) {
  const commander = main.find((l) => l.commander)
  if (commander) return commander
  if (hasCommander(deck.format)) {
    const legend = main.find(canBeCommander)
    if (legend) return legend
  }
  return [...main].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0]
}

// D1–D8 · One deck: its cover card, colors, size and value, then Cards (grouped, filtered, by part
// of the deck), Stats or Legal. Cards are added from the Cards tab's search (it searches the Market
// when the deck has nothing for it); ⋯ opens Deck options (which can import a decklist).
// Hold a card to edit: it's selected (not picked up). Tap cards to select more; holding any
// selected card then picks up the whole selection (unselected cards don't drag). It can be dropped
// on the Main deck / Sideboard / Maybe chips, on the commander (the cover card or the Commander
// group; one card that can lead the deck, anything else turns it red), or dragged down into the
// trash bubble. ⋯ and Filter hide meanwhile; the bar at the bottom has Undo and Done.
export default function DeckScreen() {
  const money = useMoney()
  const insets = useSafeAreaInsets()
  const { deckId } = useLocalSearchParams<{ deckId: string }>()
  const store = useDeckStore()
  const deck = store.decks.find((d) => d.id === deckId)
  const folder = store.folders.find((f) => f.id === deck?.folderId)
  const { lines } = useDeckLines(deckId)
  const groupBy = useGroupBy(deckId)
  const [tab, setTab] = useState<Tab>('cards')
  const [board, setBoard] = useState<Board>('main')
  const [filters, setFilters] = useState<DeckFilters>(NO_FILTERS)
  const [groupOpen, setGroupOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  // Deleting the deck from its own options goes back; the list shows the Undo toast.
  const deckSheets = useDeckSheets({ onDeckDeleted: () => router.back() })
  const [editing, setEditing] = useState(false)
  // This edit session's changes, latest last, for Undo.
  const [undos, setUndos] = useState<Undo[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)

  const picked = lines.filter((l) => selected.includes(keyOf(l)))
  const commanderFormat = deck != null && hasCommander(deck.format)
  // The commander slot takes one card that can lead the deck, or one that can share command with
  // the commander (a partner, a Background for "Choose a Background"…). A third never fits.
  const commanders = lines.filter((l) => l.commander)
  const partnerOf = (l: DeckLine) => commanders.find((c) => c.cardId !== l.cardId && canShareCommand(c, l))
  const commanderOk =
    commanderFormat &&
    picked.length === 1 &&
    !picked[0].commander &&
    (canBeCommander(picked[0]) || partnerOf(picked[0]) != null)
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y)
  })
  const drag = useCardDrag({ commanderOk, board, scrollRef, scrollY })
  // Taking cards into the top third of the screen scrolls up to the chips.
  const topZone = useWindowDimensions().height / 3

  const stopEditing = () => {
    setEditing(false)
    setSelected([])
    setUndos([])
  }
  const undo = () => {
    const last = undos[undos.length - 1]
    if (!last) return
    last()
    setUndos(undos.slice(0, -1))
    setSelected([])
  }
  // Android's back button leaves edit mode first.
  useFocusEffect(
    useCallback(() => {
      if (!editing) return
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setEditing(false)
        setSelected([])
        setUndos([])
        return true
      })
      return () => sub.remove()
    }, [editing, setEditing, setSelected, setUndos]),
  )

  // Holding a card outside edit mode starts editing with it selected (it isn't picked up). While
  // editing, only selected cards can be picked up, and they bring the rest of the selection.
  const startEditing = (line: DeckLine) => {
    Keyboard.dismiss()
    setEditing(true)
    setSelected([keyOf(line)])
  }
  const onDragStart = () => {
    // The search keyboard would cover the trash and stay up through the drag.
    Keyboard.dismiss()
    setDragging(true)
  }
  const onDrop = (target: DropTarget | null) => {
    setDragging(false)
    if (!deck || target == null || picked.length === 0) return
    const keys = picked.map((l) => ({ cardId: l.cardId, board: l.board }))
    let change: Undo
    if (target === 'trash') {
      change = removeDeckCards(deck.id, keys)
    } else if (target === 'commander' || target === 'commander-group') {
      if (!commanderOk) return
      const line = picked[0]
      // Moving it into the main deck (if needed) restores the deck as it was, commander marks included.
      change = moveDeckCards(deck.id, line.board === 'main' ? [] : keys, 'main')
      // Next to a commander it can share command with; otherwise it takes over alone.
      const partner = partnerOf(line)
      setCommanders(deck.id, partner ? [partner.cardId, line.cardId] : [line.cardId])
    } else if (target === 'main' || target === 'side' || target === 'maybe') {
      if (target === board) return
      change = moveDeckCards(deck.id, keys, target)
    } else {
      return
    }
    setUndos([...undos, change])
    setSelected([])
  }
  // Only selected cards drag, and only in edit mode (holding outside it is the row's long press).
  const gestureFor = (line: DeckLine) =>
    dragGesture(drag, line, onDragStart, onDrop, topZone).enabled(editing && selected.includes(keyOf(line)))

  if (!deck) return <View style={styles.root}>{deckSheets.sheets}</View>

  const main = lines.filter((l) => l.board === 'main')
  const played = lines.filter((l) => l.board !== 'maybe')
  const mainCount = main.reduce((n, l) => n + l.quantity, 0)
  const size = exactSize(deck.format)
  const value = played.reduce((n, l) => n + (l.price ?? 0) * l.quantity, 0)
  const missing = played.reduce((n, l) => n + missingCopies(l), 0)
  const colors = deckColors(main)
  const cover = coverLine(deck, main)
  const glow = colors.length ? COLOR_HEX[colors[0]] : Colors.gold

  return (
    <View style={styles.root}>
      <View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            experimental_backgroundImage: `radial-gradient(80% 70% at 20% 20%, ${withAlpha(glow, 0.38)} 0%, ${withAlpha(colors[1] ? COLOR_HEX[colors[1]] : glow, 0.16)} 45%, rgba(14,13,11,0) 100%)`,
          },
        ]}
      />
      <DragScrollView
        showsVerticalScrollIndicator={false}
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 4 }, editing && styles.contentEditing]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEnabled={!dragging}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityRole="button">
            <Icon name={{ ios: 'chevron.left', android: 'chevron_left' }} size={22} tintColor={Colors.text} />
            <Text style={styles.backLabel} numberOfLines={1}>{folder?.name ?? 'Decks'}</Text>
          </TouchableOpacity>
          {!editing && (
            <View style={styles.topActions}>
              <TouchableOpacity
                style={styles.more}
                onPress={() => deckSheets.openDeckOptions(deck.id)}
                accessibilityRole="button"
                accessibilityLabel="Deck options"
              >
                <PathIcon d={ICON.more} color={Colors.text} size={22} weight={3} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.header}>
          {cover ? (
            <DropZone drag={drag} id="commander">
              <Pressable
                style={styles.cover}
                onPress={() => router.push({ pathname: '/card/[id]', params: { id: cover.cardId, fromDeck: deck.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${cover.commander ? 'Commander: ' : 'Open '}${cover.name}`}
              >
                <View style={styles.coverCard}>
                  <Image source={{ uri: cover.image ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
                </View>
                {cover.commander && (
                  <View style={styles.crown} accessibilityLabel="Commander">
                    <PathIcon d={CROWN} color={Colors.onGold} size={14} />
                  </View>
                )}
              </Pressable>
            </DropZone>
          ) : (
            <View style={[styles.cover, styles.coverEmpty]}>
              <Icon name={{ ios: 'rectangle.stack', android: 'style' }} size={26} tintColor={Colors.textMuted} />
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={2} accessibilityRole="header">{deck.name}</Text>
            <View style={styles.metaRow}>
              {colors.length > 0 && (
                <View style={styles.colors} accessible accessibilityLabel={colors.join(' ')}>
                  {colors.map((c) => (
                    <ManaSymbol key={c} symbol={c} size={14} />
                  ))}
                </View>
              )}
              <Text style={styles.meta} numberOfLines={1}>
                {deck.format} · <Text style={styles.metaStrong}>{size ? `${mainCount} / ${size}` : plural(mainCount, 'card')}</Text>
              </Text>
            </View>
            <Text style={styles.valueLine}>
              <Text style={styles.value}>{money.eur(value)}</Text>
              {missing > 0 ? ` · ${missing} missing` : mainCount > 0 ? ' · all owned' : ''}
            </Text>
          </View>
        </View>

        <View style={styles.tabs}>
          <Segmented
            label="Deck sections"
            options={[
              { value: 'cards', label: 'Cards' },
              { value: 'stats', label: 'Stats' },
              { value: 'legal', label: 'Legal' },
            ]}
            value={tab}
            onChange={(t) => {
              stopEditing()
              setTab(t)
            }}
          />
        </View>

        {tab === 'cards' ? (
          <CardsTab
            deckId={deck.id}
            commanderFormat={commanderFormat}
            lines={lines}
            board={board}
            onBoard={(b) => {
              setSelected([])
              setBoard(b)
            }}
            groupBy={groupBy}
            filters={filters}
            onOpenGroup={() => setGroupOpen(true)}
            onOpenFilter={() => setFilterOpen(true)}
            editing={editing}
            selected={selected}
            onToggle={(l) => {
              const key = keyOf(l)
              setSelected(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])
            }}
            gestureFor={gestureFor}
            onHold={startEditing}
            drag={drag}
            onTakenOut={(name, change) => deckSheets.showUndo(`${name} taken out`, change)}
          />
        ) : (
          tab === 'stats' ? <StatsTab lines={lines} /> : <LegalTab format={deck.format} lines={lines} />
        )}
      </DragScrollView>

      {editing && tab === 'cards' && (
        <>
          <EditBar canUndo={undos.length > 0} onUndo={undo} onDone={stopEditing} selected={picked.length} />
          <TrashBubble drag={drag} bottom={EDIT_BAR + 20} />
        </>
      )}
      <DragGhost drag={drag} lines={picked.map((l) => ({ key: keyOf(l), name: l.name, image: l.image, quantity: l.quantity }))} />

      <GroupSheet
        visible={groupOpen}
        value={groupBy}
        lines={lines.filter((l) => l.board === board)}
        onApply={(by, all) => setGroupBy(deck.id, by, all)}
        onClose={() => setGroupOpen(false)}
      />
      <FilterSheet
        visible={filterOpen}
        value={filters}
        lines={lines.filter((l) => l.board === board)}
        onApply={setFilters}
        onClose={() => setFilterOpen(false)}
      />
      {deckSheets.sheets}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  glow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 340,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    height: 44,
    maxWidth: '70%',
    marginLeft: -6,
    paddingLeft: 4,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backLabel: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  more: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.14)',
    backgroundColor: 'rgba(14,13,11,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
  },
  cover: {
    width: 78,
    height: 109,
    transform: [{ rotate: '-3deg' }],
  },
  coverCard: {
    ...StyleSheet.absoluteFill,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.2)',
    boxShadow: '0 16px 32px rgba(0,0,0,0.55)',
  },
  // Gold crown hanging off the bottom of the commander's card.
  crown: {
    position: 'absolute',
    bottom: -10,
    left: 27,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
  },
  // No cards yet: a blank card in the cover's place.
  coverEmpty: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.2)',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 2,
  },
  title: {
    fontSize: 34,
    lineHeight: 36,
    fontFamily: Fonts.serif,
    color: '#F5EEDD',
  },
  metaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colors: {
    flexDirection: 'row',
    gap: 3,
  },
  meta: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  metaStrong: {
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  valueLine: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  value: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  tabs: {
    marginTop: 22,
  },
  contentEditing: {
    paddingBottom: EDIT_BAR + 40,
  },
  topActions: {
    flexDirection: 'row',
    gap: 8,
  },
})
