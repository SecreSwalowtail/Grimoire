import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';

import { DropZone, type CardDrag } from '@/components/deck/card-drag';
import { CostRow, CROWN, GroupIcon, ICON, PathIcon } from '@/components/deck/parts';
import { Colors, Fonts } from '@/constants/theme';
import {
  activeFilters,
  filterLines,
  GROUP_OPTIONS,
  groupLines,
  missingCopies,
  type DeckFilters,
  type DeckLine,
  type GroupBy,
} from '@/rules/deck-stats';
import type { Board } from '@/utils/deck-store';
import { formatEur } from '@/utils/format';

const BOARDS: { value: Board; label: string }[] = [
  { value: 'main', label: 'Main deck' },
  { value: 'side', label: 'Sideboard' },
  { value: 'maybe', label: 'Maybe' },
]

const count = (lines: DeckLine[]) => lines.reduce((n, l) => n + l.quantity, 0)

// D1 · The deck's cards: search, sort by name, group (opens Group by), filter (opens Filter),
// which part of the deck, then the groups, each opening and closing with a tap. Tap a card for
// Card detail. Cards your binders don't cover are tagged "Not owned"; commanders lead the list.
// Hold a card to edit: it's picked up to drag (see card-drag.tsx), and taps then select cards
// instead of opening them; the part-of-deck chips and the Commander group take dropped cards. The
// filter button hides meanwhile.
export function CardsTab({
  commanderFormat,
  lines,
  board,
  onBoard,
  groupBy,
  filters,
  onOpenGroup,
  onOpenFilter,
  editing,
  selected,
  onToggle,
  gestureFor,
  onHold,
  drag,
}: {
  commanderFormat: boolean
  lines: DeckLine[]
  board: Board
  onBoard: (board: Board) => void
  groupBy: GroupBy
  filters: DeckFilters
  onOpenGroup: () => void
  onOpenFilter: () => void
  editing: boolean
  // Selected lines, as "cardId|board".
  selected: string[]
  onToggle: (line: DeckLine) => void
  gestureFor: (line: DeckLine) => GestureType
  // Holding a card outside edit mode: start editing with it selected.
  onHold: (line: DeckLine) => void
  drag: CardDrag
}) {
  const [query, setQuery] = useState('')
  const [desc, setDesc] = useState(false)
  // Groups closed by the user (all open to start).
  const [closed, setClosed] = useState<string[]>([])

  const inBoard = lines.filter((l) => l.board === board)
  const shown = filterLines(inBoard, filters, query).sort((a, b) => (desc ? -1 : 1) * a.name.localeCompare(b.name))
  const groups = groupLines(shown, groupBy)
  const nFilters = activeFilters(filters)
  const groupLabel = GROUP_OPTIONS.find((o) => o.value === groupBy)!
  const noCommander = commanderFormat && board === 'main' && inBoard.length > 0 && !lines.some((l) => l.commander)
  // While editing a Commander deck without one, an empty slot to drop it in.
  // While editing a Commander deck: the commander slot, always at the top whichever part of the
  // deck is on show, with the commander(s) in it. The one place a new commander is dropped.
  const commanders = lines.filter((l) => l.commander)
  const slot = editing && commanderFormat

  return (
    <View>
      <View style={styles.tools}>
        <View style={styles.search}>
          <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={18} tintColor={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search deck"
            placeholderTextColor={Colors.textMuted}
            accessibilityLabel="Search this deck"
            autoCorrect={false}
            returnKeyType="search"
          />
          <TouchableOpacity
            style={styles.tool}
            onPress={() => setDesc(!desc)}
            accessibilityRole="button"
            accessibilityLabel={desc ? 'Sorted by name Z to A. Tap for A to Z' : 'Sorted by name A to Z. Tap for Z to A'}
          >
            <SymbolView
              name={desc ? { ios: 'arrow.up', android: 'arrow_upward' } : { ios: 'arrow.down', android: 'arrow_downward' }}
              size={14}
              tintColor={Colors.goldLight}
            />
            <Text style={styles.toolLabel}>{desc ? 'Z–A' : 'A–Z'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tool} onPress={onOpenGroup} accessibilityRole="button" accessibilityLabel={`Group by: ${groupLabel.label}`}>
            <PathIcon d={groupLabel.icon} color={Colors.goldLight} size={15} />
            <Text style={styles.toolLabel} numberOfLines={1}>{groupBy === 'none' ? 'List' : groupLabel.label}</Text>
          </TouchableOpacity>
        </View>
        {!editing && (
          <TouchableOpacity
            style={[styles.filter, nFilters > 0 && styles.filterOn]}
            onPress={onOpenFilter}
            accessibilityRole="button"
            accessibilityLabel={`Filter cards, ${nFilters} active`}
          >
            <PathIcon d={ICON.filter} color={Colors.goldLight} size={22} />
            {nFilters > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>{nFilters}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Which part of the deck: the counts tell what's in each. */}
      <View style={styles.boards} accessibilityRole="tablist">
        {BOARDS.map((b) => {
          const on = b.value === board
          const n = count(lines.filter((l) => l.board === b.value))
          return (
            <DropZone key={b.value} drag={drag} id={b.value} style={styles.boardZone}>
              <Pressable
                style={[styles.board, on && styles.boardOn]}
                onPress={() => onBoard(b.value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${b.label}, ${n} cards`}
              >
                <Text style={[styles.boardLabel, on && styles.boardLabelOn]} numberOfLines={1}>{b.label}</Text>
                <Text style={[styles.boardCount, on && styles.boardCountOn]}>{n}</Text>
              </Pressable>
            </DropZone>
          )
        })}
      </View>

      {noCommander && !editing && (
        <View style={styles.hint}>
          <PathIcon d={CROWN} color={Colors.goldLight} size={16} />
          <Text style={styles.hintText}>Hold a legendary creature and drag it onto the commander slot.</Text>
        </View>
      )}

      {slot && (
        <DropZone drag={drag} id="commander-group" style={styles.slotZone}>
          <View
            style={[styles.slot, commanders.length > 0 && styles.slotFilled]}
            accessible
            accessibilityLabel={
              commanders.length
                ? `Commander slot: ${commanders.map((c) => c.name).join(' and ')}. Drag a card here to change it.`
                : 'Commander slot, empty. Drag a legendary creature here.'
            }
          >
            <View style={styles.slotIcon}>
              <PathIcon d={CROWN} color={Colors.goldLight} size={18} />
            </View>
            <View style={styles.slotText}>
              <Text style={styles.slotTitle}>{commanders.length > 1 ? 'Commanders' : 'Commander'}</Text>
              <Text style={commanders.length ? styles.slotName : styles.slotHint} numberOfLines={2}>
                {commanders.length ? commanders.map((c) => c.name).join(' & ') : 'Drag a legendary creature here'}
              </Text>
            </View>
          </View>
        </DropZone>
      )}

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {inBoard.length === 0
              ? `No cards in the ${board === 'main' ? 'main deck' : board === 'side' ? 'sideboard' : 'maybe list'} yet.`
              : 'No cards match.'}
          </Text>
        </View>
      ) : (
        <View style={styles.groups}>
          {groups.map((g) => {
            const open = !closed.includes(g.key)
            return (
              <View key={g.key} style={styles.group}>
                <Pressable
                  style={styles.groupHead}
                  onPress={() => setClosed(open ? [...closed, g.key] : closed.filter((k) => k !== g.key))}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${g.name}, ${g.count} cards, ${formatEur(g.value)}`}
                >
                  <GroupIcon head={g.head} />
                  <View style={styles.groupTitle}>
                    <Text style={styles.groupName} numberOfLines={1}>{g.name}</Text>
                    <Text style={styles.groupCount}>{g.count}</Text>
                  </View>
                  <Text style={styles.groupValue}>{formatEur(g.value)}</Text>
                  <SymbolView
                    name={open ? { ios: 'chevron.up', android: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more' }}
                    size={16}
                    tintColor={Colors.textMuted}
                  />
                </Pressable>
                {open &&
                  g.lines.map((l) => {
                    const missing = missingCopies(l)
                    const key = `${l.cardId}|${l.board}`
                    const on = selected.includes(key)
                    return (
                      <GestureDetector key={key} gesture={gestureFor(l)}>
                      <Pressable
                        style={({ pressed }) => [styles.row, pressed && styles.rowPressed, on && styles.rowOn]}
                        onPress={() => (editing ? onToggle(l) : router.push({ pathname: '/card/[id]', params: { id: l.cardId } }))}
                        // A long press replaces the tap, so letting go doesn't open (or deselect) the card. It
                        // stays set in edit mode: removed mid-press, letting go would count as a tap.
                        onLongPress={() => !editing && onHold(l)}
                        delayLongPress={300}
                        accessibilityRole={editing ? 'checkbox' : 'button'}
                        accessibilityState={editing ? { checked: on } : undefined}
                        accessibilityHint={editing ? undefined : 'Hold to select and drag'}
                        accessibilityLabel={`${l.quantity} ${l.name}${missing ? `, ${missing} not owned` : ''}, ${l.price != null ? formatEur(l.price * l.quantity) : 'no price'}`}
                      >
                        <Text style={styles.qty}>{l.quantity}×</Text>
                        <View style={styles.rowText}>
                          <Text style={styles.cardName} numberOfLines={1}>{l.name}</Text>
                          {missing > 0 && (
                            <Text style={styles.tag}>{missing === l.quantity ? 'Not owned' : `${missing} not owned`}</Text>
                          )}
                        </View>
                        <CostRow cost={l.manaCost} />
                        <Text style={styles.price} numberOfLines={1}>{l.price != null ? formatEur(l.price * l.quantity) : '—'}</Text>
                      </Pressable>
                      </GestureDetector>
                    )
                  })}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  tools: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  search: {
    flex: 1,
    minWidth: 0,
    height: 48,
    paddingLeft: 14,
    paddingRight: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  tool: {
    height: 38,
    maxWidth: 110,
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
  filter: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.45)',
    backgroundColor: 'rgba(212,166,74,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.16)',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 11,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
  boards: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 6,
  },
  boardZone: {
    flex: 1,
  },
  board: {
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  boardOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.14)',
  },
  boardLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: '#CFC7B4',
  },
  boardLabelOn: {
    color: '#F0D8A0',
  },
  boardCount: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.textMuted,
  },
  boardCountOn: {
    color: Colors.goldLight,
  },
  groups: {
    marginTop: 12,
    gap: 10,
  },
  group: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  groupHead: {
    minHeight: 50,
    paddingLeft: 12,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  groupName: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  groupCount: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  groupValue: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  row: {
    minHeight: 50,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowPressed: {
    backgroundColor: 'rgba(237,230,214,0.04)',
  },
  // A selected card: tinted gold.
  rowOn: {
    backgroundColor: 'rgba(212,166,74,0.16)',
  },
  qty: {
    width: 28,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: '#CFC7B4',
    fontVariant: ['tabular-nums'],
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  cardName: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: 'rgba(212,166,74,0.16)',
    fontSize: 11,
    lineHeight: 18,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  price: {
    minWidth: 54,
    textAlign: 'right',
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
  slotZone: {
    marginTop: 12,
  },
  slot: {
    minHeight: 60,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(212,166,74,0.45)',
    backgroundColor: 'rgba(212,166,74,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  slotFilled: {
    borderStyle: 'solid',
    borderColor: 'rgba(212,166,74,0.6)',
    backgroundColor: 'rgba(212,166,74,0.10)',
  },
  slotName: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.goldLight,
  },
  slotIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: 'rgba(212,166,74,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotText: {
    flex: 1,
    gap: 2,
  },
  slotTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  slotHint: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  hint: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(212,166,74,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.goldLight,
  },
  empty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
})
