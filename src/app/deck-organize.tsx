import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckBox, FolderIcon } from '@/components/decks/parts';
import { ReorderList } from '@/components/decks/reorder-list';
import { useDeckSheets } from '@/components/decks/use-deck-sheets';
import { Colors, Fonts } from '@/constants/theme';
import {
  deleteDecks,
  duplicateDecks,
  FOLDER_COLORS,
  folderDecks,
  reorderDecks,
  reorderFolders,
  updateFolder,
  useDeckStore,
} from '@/utils/deck-store';

const DANGER = '#EE8466'
const TOOLBAR = 96

// Organize (select & reorder): pick folders and decks, then Move / New folder / Duplicate / Delete.
// Opened from Decks ("Select") or a folder's "Manage decks" (`folderId`: only that folder's decks).
// Drag a row by its grip (or hold it) to reorder. Dropping a deck on a folder isn't wired up yet.
export default function OrganizeScreen() {
  const insets = useSafeAreaInsets()
  const { folderId } = useLocalSearchParams<{ folderId?: string }>()
  const { folders, decks } = useDeckStore()
  const [selected, setSelected] = useState<string[]>([])
  // No scrolling while a row is being dragged.
  const [dragging, setDragging] = useState(false)
  const toolbarHeight = TOOLBAR + insets.bottom
  const deckSheets = useDeckSheets({ toastBottom: toolbarHeight + 16 })

  const scopeFolder = folders.find((f) => f.id === folderId)
  const shownFolders = scopeFolder ? [] : folders
  const shownDecks = scopeFolder ? folderDecks(decks, scopeFolder) : decks
  const ids = [...shownFolders.map((f) => f.id), ...shownDecks.map((d) => d.id)]
  // Drop ids of things deleted meanwhile.
  const picked = selected.filter((id) => ids.includes(id))
  const pickedFolders = shownFolders.filter((f) => picked.includes(f.id)).map((f) => f.id)
  const pickedDecks = shownDecks.filter((d) => picked.includes(d.id)).map((d) => d.id)
  const allPicked = ids.length > 0 && picked.length === ids.length

  const toggle = (id: string) =>
    setSelected(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  const clear = () => setSelected([])
  // Dragging decks in a folder sorted by name switches it to your own order, so the drop sticks.
  const moveDecks = (order: string[]) => {
    reorderDecks(order)
    if (scopeFolder && scopeFolder.sort !== 'custom') updateFolder(scopeFolder.id, { sort: 'custom' })
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <ScrollView scrollEnabled={!dragging} contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: toolbarHeight + 24 }]}>
        <View style={styles.header}>
          {/* Title centered on the screen, between the two links. */}
          <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
            {picked.length ? `${picked.length} selected` : scopeFolder ? scopeFolder.name : 'Select items'}
          </Text>
          <TouchableOpacity style={styles.headerSide} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.link} numberOfLines={1}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerSide, styles.headerRight]}
            onPress={() => setSelected(allPicked ? [] : ids)}
            accessibilityRole="button"
          >
            <Text style={styles.link} numberOfLines={1}>{allPicked ? 'Clear' : 'Select all'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hint}>
          <SymbolView name={{ ios: 'line.3.horizontal', android: 'drag_handle' }} size={18} tintColor={Colors.textSecondary} />
          <Text style={styles.hintText}>Drag to reorder · drop a deck on a folder to file it</Text>
        </View>

        {shownFolders.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Folders</Text>
            <ReorderList
              items={shownFolders}
              itemHeight={60}
              onReorder={reorderFolders}
              onDragChange={setDragging}
              renderItem={(f, grip) => {
                const n = decks.filter((d) => d.folderId === f.id).length
                return (
                  <Item selected={picked.includes(f.id)} onPress={() => toggle(f.id)} label={`${f.name} folder, ${n} decks`} grip={grip}>
                    <FolderIcon color={FOLDER_COLORS[f.color].hex} width={26} />
                    <Text style={styles.itemName} numberOfLines={1}>{f.name}</Text>
                    <Text style={styles.itemCount}>{n} {n === 1 ? 'deck' : 'decks'}</Text>
                  </Item>
                )
              }}
            />
          </>
        )}

        <Text style={styles.sectionLabel}>Decks</Text>
        {shownDecks.length === 0 ? (
          <Text style={styles.none}>No decks here yet.</Text>
        ) : (
          <ReorderList
            items={shownDecks}
            itemHeight={64}
            onReorder={moveDecks}
            onDragChange={setDragging}
            renderItem={(d, grip) => (
              <Item selected={picked.includes(d.id)} onPress={() => toggle(d.id)} label={`${d.name}, ${d.format}`} grip={grip}>
                <View style={styles.art} />
                <View style={styles.itemText}>
                  <Text style={styles.itemName} numberOfLines={1}>{d.name}</Text>
                  <Text style={styles.itemMeta}>{d.format} · No cards yet</Text>
                </View>
              </Item>
            )}
          />
        )}
      </ScrollView>

      <View
        style={[styles.toolbar, { height: toolbarHeight, paddingBottom: insets.bottom + 8 }]}
        accessibilityRole="toolbar"
        accessibilityLabel="Selection actions"
      >
        <Tool
          label="Move"
          icon={{ ios: 'folder', android: 'drive_file_move' }}
          disabled={!pickedDecks.length}
          onPress={() => deckSheets.openMove(pickedDecks, clear)}
        />
        <Tool
          label="New folder"
          icon={{ ios: 'folder.badge.plus', android: 'create_new_folder' }}
          disabled={!picked.length}
          onPress={() => {
            deckSheets.openNew({ kind: 'folder', deckIds: pickedDecks })
            clear()
          }}
        />
        <Tool
          label="Duplicate"
          icon={{ ios: 'plus.square.on.square', android: 'content_copy' }}
          disabled={!pickedDecks.length}
          onPress={() => {
            duplicateDecks(pickedDecks)
            clear()
          }}
        />
        <Tool
          label="Delete"
          icon={{ ios: 'trash', android: 'delete' }}
          danger
          disabled={!picked.length}
          onPress={() => {
            // Folders ask what to do with their decks; decks alone go straight away, with Undo.
            if (pickedFolders.length) {
              deckSheets.openDeleteFolders(pickedFolders)
            } else {
              const n = pickedDecks.length
              deckSheets.showUndo(n === 1 ? '1 deck deleted' : `${n} decks deleted`, deleteDecks(pickedDecks))
            }
            clear()
          }}
        />
      </View>

      {deckSheets.sheets}
    </View>
  )
}

// A selectable row: round checkbox, the given content, and the drag grip (from ReorderList).
// Fills the row height ReorderList gives it.
function Item({
  selected,
  onPress,
  label,
  grip,
  children,
}: {
  selected: boolean
  onPress: () => void
  label: string
  grip: ReactElement
  children: ReactNode
}) {
  return (
    <View style={[styles.item, selected && styles.itemSelected]}>
      <Pressable
        style={styles.itemPress}
        onPress={onPress}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: selected }}
      >
        <CheckBox checked={selected} round />
        {children}
      </Pressable>
      {grip}
    </View>
  )
}

function Tool({
  label,
  icon,
  danger,
  disabled,
  onPress,
}: {
  label: string
  icon: SymbolViewProps['name']
  danger?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const color = danger ? DANGER : Colors.text
  return (
    <TouchableOpacity
      style={[styles.tool, disabled && styles.toolDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <SymbolView name={icon} size={22} tintColor={color} />
      <Text style={[styles.toolLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 20,
  },
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Sized to their text, so "Select all" never wraps.
  headerSide: {
    height: 44,
    justifyContent: 'center',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    position: 'absolute',
    left: 96,
    right: 96,
    textAlign: 'center',
    fontSize: 17,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  link: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  hint: {
    marginTop: 14,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  sectionLabel: {
    marginTop: 20,
    marginBottom: 6,
    marginLeft: 2,
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  none: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  item: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemSelected: {
    borderWidth: 1.5,
    borderColor: 'rgba(212,166,74,0.6)',
    backgroundColor: 'rgba(212,166,74,0.08)',
  },
  itemPress: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    paddingLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  itemName: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  itemCount: {
    marginLeft: 'auto',
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  itemMeta: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  art: {
    width: 30,
    height: 42,
    borderRadius: 5,
    experimental_backgroundImage: 'radial-gradient(circle at 50% 25%, #857C6C, #2D2A24 60%, #100F0D)',
    boxShadow: '0 0 0 1px rgba(237,230,214,0.14)',
  },
  toolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    gap: 4,
  },
  tool: {
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  toolDisabled: {
    opacity: 0.4,
  },
  toolLabel: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
  },
})
