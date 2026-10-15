import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Segmented } from '@/components/controls';
import { CardsTab } from '@/components/deck/cards-tab';
import { CROWN, PathIcon } from '@/components/deck/parts';
import { FilterSheet } from '@/components/deck/filter-sheet';
import { setGroupBy, useGroupBy } from '@/components/deck/group-prefs';
import { GroupSheet } from '@/components/deck/group-sheet';
import { StatsTab } from '@/components/deck/stats-tab';
import { useDeckLines } from '@/components/deck/use-deck-lines';
import { useDeckSheets } from '@/components/decks/use-deck-sheets';
import { ManaSymbol } from '@/components/mana-symbol';
import { Colors, Fonts } from '@/constants/theme';
import {
  canBeCommander,
  COLOR_HEX,
  deckColors,
  exactSize,
  hasCommander,
  missingCopies,
  NO_FILTERS,
  type DeckFilters,
  type DeckLine,
} from '@/rules/deck-stats';
import { useDeckStore, withAlpha, type Board, type Deck } from '@/utils/deck-store';
import { formatEur } from '@/utils/format';

type Tab = 'cards' | 'stats'

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
// of the deck) or Stats. + goes to the Market, where Card detail adds cards to decks; ⋯ opens Deck
// options (which can import a decklist).
export default function DeckScreen() {
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
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 4 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityRole="button">
            <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left' }} size={22} tintColor={Colors.text} />
            <Text style={styles.backLabel} numberOfLines={1}>{folder?.name ?? 'Decks'}</Text>
          </TouchableOpacity>
          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.more}
              onPress={() => deckSheets.openDeckOptions(deck.id)}
              accessibilityRole="button"
              accessibilityLabel="Deck options"
            >
              <SymbolView name={{ ios: 'ellipsis', android: 'more_horiz' }} size={20} tintColor={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.add}
              onPress={() => router.navigate('/market')}
              accessibilityRole="button"
              accessibilityLabel="Add cards"
              accessibilityHint="Find cards in the Market and add them from Card detail"
            >
              <SymbolView name={{ ios: 'plus', android: 'add' }} size={22} tintColor={Colors.onGold} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.header}>
          {cover ? (
            <Pressable
              style={styles.cover}
              onPress={() => router.push({ pathname: '/card/[id]', params: { id: cover.cardId } })}
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
          ) : (
            <View style={[styles.cover, styles.coverCard, styles.coverEmpty]}>
              <SymbolView name={{ ios: 'rectangle.stack', android: 'style' }} size={26} tintColor={Colors.textMuted} />
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
                {deck.format} · <Text style={styles.metaStrong}>{size ? `${mainCount} / ${size}` : `${mainCount} ${mainCount === 1 ? 'card' : 'cards'}`}</Text>
              </Text>
            </View>
            <Text style={styles.valueLine}>
              <Text style={styles.value}>{formatEur(value)}</Text>
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
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>

        {tab === 'cards' ? (
          <CardsTab
            deckId={deck.id}
            commanderFormat={hasCommander(deck.format)}
            lines={lines}
            board={board}
            onBoard={setBoard}
            groupBy={groupBy}
            filters={filters}
            onOpenGroup={() => setGroupOpen(true)}
            onOpenFilter={() => setFilterOpen(true)}
          />
        ) : (
          <StatsTab lines={lines} />
        )}
      </ScrollView>


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
  coverEmpty: {
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
  topActions: {
    flexDirection: 'row',
    gap: 8,
  },
  add: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
