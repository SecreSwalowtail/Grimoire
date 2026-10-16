import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { DeckThumb, FolderFan, FolderIcon } from '@/components/decks/parts';
import { Colors, Fonts } from '@/constants/theme';
import { formatEur } from '@/utils/format';
import {
  deckCardCount,
  deckValue,
  FOLDER_COLORS,
  useDeckStore,
  withAlpha,
  type Deck,
  type DeckData,
  type Folder,
} from '@/utils/deck-store';

// "Pioneer · 60 cards", or "Pioneer · No cards yet".
export function deckMeta(deck: Deck, data: DeckData) {
  const n = deckCardCount(deck, data)
  return `${deck.format} · ${n === 0 ? 'No cards yet' : `${n} ${n === 1 ? 'card' : 'cards'}`}`
}

// Selecting in the Decks screen's edit mode: whether it's selected, and tapping toggles that.
export type RowEdit = { selected: boolean; onToggle: () => void }

// One deck: fanned thumbnail, name, format and card count, value, and the ⋮ options button when given.
// Tapping it opens the deck. `onHold`: holding it (outside edit mode). With `edit`, tapping
// selects it instead and the options button hides.
export function DeckRow({
  deck,
  onOptions,
  last,
  edit,
  onHold,
}: {
  deck: Deck
  onOptions?: () => void
  last?: boolean
  edit?: RowEdit
  onHold?: () => void
}) {
  const data = useDeckStore()
  const meta = deckMeta(deck, data)
  const value = formatEur(deckValue(deck, data))
  return (
    <View style={[styles.row, !last && styles.rule]}>
      {edit?.selected && <View pointerEvents="none" style={styles.rowOn} />}
      <Pressable
        style={styles.open}
        onPress={() => (edit ? edit.onToggle() : router.push({ pathname: '/decks/deck/[deckId]', params: { deckId: deck.id } }))}
        // A long press replaces the tap, so letting go doesn't open (or deselect) the deck. It stays
        // set in edit mode: removed mid-press, letting go would count as a tap.
        onLongPress={onHold && (() => !edit && onHold())}
        delayLongPress={300}
        accessibilityRole={edit ? 'checkbox' : 'button'}
        accessibilityState={edit ? { checked: edit.selected } : undefined}
        accessibilityHint={edit || !onHold ? undefined : 'Hold to select and drag'}
        accessibilityLabel={`${deck.name}, ${meta}, ${value}`}
      >
        <DeckThumb deckId={deck.id} />
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>{deck.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        </View>
        <Text style={styles.value}>{value}</Text>
      </Pressable>
      {onOptions && !edit && (
        <TouchableOpacity
          style={styles.options}
          onPress={onOptions}
          accessibilityRole="button"
          accessibilityLabel={`Options for ${deck.name}`}
        >
          <SymbolView name={{ ios: 'ellipsis', android: 'more_vert' }} size={20} tintColor={Colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  )
}

// Folder card for the Decks screen grid: folder icon and card fan, name, deck count, ⋯ options.
// `onHold` and `edit` as for DeckRow.
export function FolderCard({
  folder,
  count,
  onOpen,
  onOptions,
  edit,
  onHold,
}: {
  folder: Folder
  count: number
  onOpen: () => void
  onOptions: () => void
  edit?: RowEdit
  onHold?: () => void
}) {
  const hex = FOLDER_COLORS[folder.color].hex
  const decksText = `${count} ${count === 1 ? 'deck' : 'decks'}`
  return (
    <View style={styles.folder}>
      <Pressable
        style={[styles.folderCard, edit?.selected && styles.folderOn]}
        onPress={edit ? edit.onToggle : onOpen}
        onLongPress={onHold && (() => !edit && onHold())}
        delayLongPress={300}
        accessibilityRole={edit ? 'checkbox' : 'button'}
        accessibilityState={edit ? { checked: edit.selected } : undefined}
        accessibilityHint={edit || !onHold ? undefined : 'Hold to select and drag'}
        accessibilityLabel={`${edit ? '' : 'Open folder '}${folder.name}${edit ? ' folder' : ''}, ${decksText}`}
      >
        <View
          pointerEvents="none"
          style={[styles.glow, { experimental_backgroundImage: `radial-gradient(closest-side, ${withAlpha(hex, 0.15)}, rgba(0,0,0,0))` }]}
        />
        <View style={styles.folderTop}>
          <FolderIcon color={hex} />
          <FolderFan />
        </View>
        <View style={styles.folderText}>
          <Text style={styles.folderName} numberOfLines={1}>{folder.name}</Text>
          <Text style={styles.folderCount}>{decksText}</Text>
        </View>
      </Pressable>
      {!edit && (
        <TouchableOpacity
          style={styles.folderOptions}
          onPress={onOptions}
          accessibilityRole="button"
          accessibilityLabel={`Folder options for ${folder.name}`}
        >
          <SymbolView name={{ ios: 'ellipsis', android: 'more_horiz' }} size={20} tintColor={Colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  open: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(237,230,214,0.07)',
  },
  // A selected deck: tinted gold, a little wider than the row.
  rowOn: {
    position: 'absolute',
    left: -10,
    right: -10,
    top: 4,
    bottom: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(212,166,74,0.16)',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  name: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  meta: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  value: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
  options: {
    width: 40,
    height: 44,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folder: {
    height: 96,
  },
  folderCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  folderOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.14)',
  },
  glow: {
    position: 'absolute',
    right: -30,
    top: -40,
    width: 140,
    height: 120,
  },
  folderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  folderText: {
    paddingRight: 30,
    gap: 2,
  },
  folderName: {
    fontSize: 16,
    lineHeight: 19,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  folderCount: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  folderOptions: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
