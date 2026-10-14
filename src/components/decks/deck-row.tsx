import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { DeckThumb, FolderFan, FolderIcon } from '@/components/decks/parts';
import { Colors, Fonts } from '@/constants/theme';
import { FOLDER_COLORS, withAlpha, type Deck, type Folder } from '@/utils/deck-store';

// Decks hold no cards yet, so every row shows an empty deck: no color pips, €0.
// Rows aren't tappable until the deck screen (its card list) is designed.

// One deck: fanned thumbnail, name, format, value, and the ⋮ options button when given.
export function DeckRow({ deck, onOptions, last }: { deck: Deck; onOptions?: () => void; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rule]}>
      <DeckThumb />
      <View style={styles.text} accessible accessibilityLabel={`${deck.name}, ${deck.format}, no cards yet`}>
        <Text style={styles.name} numberOfLines={1}>{deck.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>{deck.format} · No cards yet</Text>
      </View>
      <Text style={styles.value}>€0</Text>
      {onOptions && (
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
export function FolderCard({
  folder,
  count,
  onOpen,
  onOptions,
}: {
  folder: Folder
  count: number
  onOpen: () => void
  onOptions: () => void
}) {
  const hex = FOLDER_COLORS[folder.color].hex
  const decksText = `${count} ${count === 1 ? 'deck' : 'decks'}`
  return (
    <View style={styles.folder}>
      <Pressable
        style={styles.folderCard}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Open folder ${folder.name}, ${decksText}`}
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
      <TouchableOpacity
        style={styles.folderOptions}
        onPress={onOptions}
        accessibilityRole="button"
        accessibilityLabel={`Folder options for ${folder.name}`}
      >
        <SymbolView name={{ ios: 'ellipsis', android: 'more_horiz' }} size={20} tintColor={Colors.textSecondary} />
      </TouchableOpacity>
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
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(237,230,214,0.07)',
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
