import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeckRow } from '@/components/decks/deck-row';
import { FolderIcon } from '@/components/decks/parts';
import { useDeckSheets } from '@/components/decks/use-deck-sheets';
import { Colors, Fonts } from '@/constants/theme';
import { deckValue, deleteDecks, FOLDER_COLORS, folderDecks, useDeckStore, withAlpha } from '@/utils/deck-store';
import { useMoney } from '@/utils/money';

// One folder's decks. Swipe a deck left for Move / Delete (with Undo).
export default function FolderScreen() {
  const money = useMoney()
  const insets = useSafeAreaInsets()
  const { folderId } = useLocalSearchParams<{ folderId: string }>()
  const store = useDeckStore()
  const { folders, decks } = store
  const folder = folders.find((f) => f.id === folderId)
  // Deleting this folder from its own menu goes back to Decks, which shows the Undo toast.
  const deckSheets = useDeckSheets({ onFolderDeleted: () => router.back() })

  if (!folder) return <View style={styles.root}>{deckSheets.sheets}</View>

  const hex = FOLDER_COLORS[folder.color].hex
  const inside = folderDecks(decks, folder, store)
  const value = money.eur(inside.reduce((sum, d) => sum + deckValue(d, store), 0))

  return (
    <View style={styles.root}>
      <View
        pointerEvents="none"
        style={[styles.glow, { experimental_backgroundImage: `radial-gradient(closest-side, ${withAlpha(hex, 0.2)}, rgba(0,0,0,0))` }]}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityRole="button">
            <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left' }} size={22} tintColor={Colors.text} />
            <Text style={styles.backLabel}>Decks</Text>
          </TouchableOpacity>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => deckSheets.openFolderEdit(folder.id)}
              accessibilityRole="button"
              accessibilityLabel="Folder options"
            >
              <SymbolView name={{ ios: 'ellipsis', android: 'more_horiz' }} size={20} tintColor={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.add}
              onPress={() => deckSheets.openNew({ kind: 'deck', folderId: folder.id })}
              accessibilityRole="button"
              accessibilityLabel={`New deck in ${folder.name}`}
            >
              <SymbolView name={{ ios: 'plus', android: 'add' }} size={22} tintColor={Colors.onGold} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.header}>
          <View style={[styles.folderTile, { backgroundColor: withAlpha(hex, 0.12), borderColor: withAlpha(hex, 0.35) }]}>
            <FolderIcon color={hex} width={30} fill={0.25} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>{folder.name}</Text>
            <Text style={styles.summary}>
              {inside.length} {inside.length === 1 ? 'deck' : 'decks'} · {value}
            </Text>
          </View>
        </View>

        <View style={styles.list}>
          {inside.map((d) => (
            <ReanimatedSwipeable
              key={d.id}
              friction={1.5}
              rightThreshold={40}
              overshootRight={false}
              containerStyle={styles.swipe}
              renderRightActions={(_progress, _translation, swipeable) => (
                <View style={styles.swipeActions}>
                  <SwipeAction
                    label="Move"
                    icon={{ ios: 'folder', android: 'drive_file_move' }}
                    color={Colors.goldLight}
                    background={Colors.selected}
                    onPress={() => {
                      swipeable.close()
                      deckSheets.openMove([d.id])
                    }}
                  />
                  <SwipeAction
                    label="Delete"
                    icon={{ ios: 'trash', android: 'delete' }}
                    color="#FFF4EC"
                    background="#B5412A"
                    onPress={() => deckSheets.showUndo(`${d.name} deleted`, deleteDecks([d.id]))}
                  />
                </View>
              )}
            >
              <View style={styles.rowFront}>
                <DeckRow deck={d} last />
              </View>
            </ReanimatedSwipeable>
          ))}
        </View>

        <TouchableOpacity
          style={styles.addDeck}
          onPress={() => deckSheets.openNew({ kind: 'deck', folderId: folder.id })}
          accessibilityRole="button"
        >
          <SymbolView name={{ ios: 'plus', android: 'add' }} size={18} tintColor={Colors.goldLight} />
          <Text style={styles.addDeckLabel} numberOfLines={1}>Add a deck to {folder.name}</Text>
        </TouchableOpacity>
        {inside.length > 0 && (
          <View style={styles.hint}>
            <SymbolView name={{ ios: 'arrow.left', android: 'arrow_back' }} size={16} tintColor={Colors.textMuted} />
            <Text style={styles.hintText}>Swipe a deck left to move or delete it</Text>
          </View>
        )}
      </ScrollView>

      {deckSheets.sheets}
    </View>
  )
}

function SwipeAction({
  label,
  icon,
  color,
  background,
  onPress,
}: {
  label: string
  icon: SymbolViewProps['name']
  color: string
  background: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={[styles.swipeAction, { backgroundColor: background }]} onPress={onPress} accessibilityRole="button">
      <SymbolView name={icon} size={20} tintColor={color} />
      <Text style={[styles.swipeLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  glow: {
    position: 'absolute',
    left: -60,
    top: -170,
    width: 560,
    height: 440,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 96,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    height: 44,
    marginLeft: -6,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backLabel: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  folderTile: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 42,
    lineHeight: 46,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  summary: {
    marginTop: 2,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  // Rows run edge to edge so the swipe actions reach the screen's side.
  list: {
    marginTop: 22,
    marginHorizontal: -20,
  },
  swipe: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(237,230,214,0.07)',
  },
  rowFront: {
    paddingHorizontal: 20,
    backgroundColor: Colors.background,
  },
  swipeActions: {
    flexDirection: 'row',
  },
  swipeAction: {
    width: 70,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  swipeLabel: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
  },
  addDeck: {
    marginTop: 16,
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(212,166,74,0.45)',
    backgroundColor: 'rgba(212,166,74,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  addDeckLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  hint: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  hintText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
})
