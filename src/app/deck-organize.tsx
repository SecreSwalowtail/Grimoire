import { router, Stack } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FolderIcon } from '@/components/decks/parts';
import { ReorderList, ROW_GAP, useDropFx, type AutoScroll, type DropTargets } from '@/components/decks/reorder-list';
import { useDeckSheets } from '@/components/decks/use-deck-sheets';
import { Colors, Fonts } from '@/constants/theme';
import {
  deleteDecks,
  duplicateDecks,
  FOLDER_COLORS,
  moveDecks,
  reorderDecks,
  reorderFolders,
  useDeckStore,
} from '@/utils/deck-store';

const DANGER = '#EE8466'
const TOOLBAR = 96
const FOLDER_ROW = 60
const DECK_ROW = 64

// Gesture-handler's ScrollView, so the drag gestures and scrolling get along, made animatable
// so a drag can scroll it.
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView)

// Manage decks: folders, and the decks not in one. Tap rows to select them (they turn gold), then
// New folder / Duplicate / Delete. Drag a row by its grip (or hold it) to reorder; drag a deck
// onto a folder to file it there (with Undo). Holding a row near the top or bottom edge scrolls.
// Opened from the Decks screen's "Manage" button.
export default function OrganizeScreen() {
  const insets = useSafeAreaInsets()
  const { folders, decks } = useDeckStore()
  // Like the Decks screen: decks in a folder are inside it, so the list shows the rest.
  const loose = decks.filter((d) => d.folderId == null)
  const [selected, setSelected] = useState<string[]>([])
  // No scrolling while a row is being dragged.
  const [dragging, setDragging] = useState(false)
  const toolbarHeight = TOOLBAR + insets.bottom
  const deckSheets = useDeckSheets({ toastBottom: toolbarHeight + 16 })
  // Where the two lists sit in the scroll content, to find the folder under a dragged deck.
  const [foldersY, setFoldersY] = useState<number | null>(null)
  const [decksY, setDecksY] = useState<number | null>(null)
  const dropFx = useDropFx()

  const { height: screenHeight } = useWindowDimensions()
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollOffset = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollOffset.set(e.contentOffset.y)
  })
  const [contentHeight, setContentHeight] = useState(0)
  const [viewHeight, setViewHeight] = useState(0)
  const autoScroll: AutoScroll = {
    ref: scrollRef,
    offset: scrollOffset,
    max: contentHeight - viewHeight,
    // The visible list runs from under the status bar to the top of the toolbar.
    top: insets.top,
    bottom: screenHeight - toolbarHeight,
  }

  // Filing a deck by dropping it on a folder, with an Undo toast. Dropping it on the folder
  // it's already in changes nothing.
  const fileDeck = (deckId: string, folderId: string) => {
    const deck = decks.find((d) => d.id === deckId)
    const folder = folders.find((f) => f.id === folderId)
    if (!deck || !folder || deck.folderId === folderId) return
    deckSheets.showUndo(`${deck.name} moved to ${folder.name}`, moveDecks([deckId], folderId))
  }
  const folderTargets: DropTargets | undefined =
    folders.length > 0 && foldersY != null && decksY != null
      ? {
          ids: folders.map((f) => f.id),
          top: foldersY - decksY,
          slot: FOLDER_ROW + ROW_GAP,
          height: FOLDER_ROW,
          fx: dropFx,
          onDrop: fileDeck,
        }
      : undefined

  const ids = [...folders.map((f) => f.id), ...loose.map((d) => d.id)]
  // Drop ids of things deleted meanwhile.
  const picked = selected.filter((id) => ids.includes(id))
  const pickedFolders = folders.filter((f) => picked.includes(f.id)).map((f) => f.id)
  const pickedDecks = loose.filter((d) => picked.includes(d.id)).map((d) => d.id)
  const allPicked = ids.length > 0 && picked.length === ids.length

  const toggle = (id: string) =>
    setSelected(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  const clear = () => setSelected([])

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <AnimatedScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={(e) => setViewHeight(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setContentHeight(h)}
        scrollEnabled={!dragging}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: toolbarHeight + 24 }]}
      >
        <View style={styles.header}>
          {/* Title centered on the screen, between the two links. */}
          <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
            {picked.length ? `${picked.length} selected` : 'Manage decks'}
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

        {folders.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Folders</Text>
            <View onLayout={(e) => setFoldersY(e.nativeEvent.layout.y)}>
              <ReorderList
                items={folders}
                itemHeight={FOLDER_ROW}
                onReorder={reorderFolders}
                onDragChange={setDragging}
                dropFx={dropFx}
                scroll={autoScroll}
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
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>Decks</Text>
        {loose.length === 0 ? (
          <Text style={styles.none}>{decks.length === 0 ? 'No decks yet.' : 'All decks are in folders.'}</Text>
        ) : (
          <View onLayout={(e) => setDecksY(e.nativeEvent.layout.y)}>
            <ReorderList
              items={loose}
              itemHeight={DECK_ROW}
              onReorder={reorderDecks}
              onDragChange={setDragging}
              dropTargets={folderTargets}
              scroll={autoScroll}
              renderItem={(d, grip) => (
                <Item selected={picked.includes(d.id)} onPress={() => toggle(d.id)} label={`${d.name}, ${d.format}`} grip={grip}>
                  <View style={styles.art} />
                  <View style={styles.itemText}>
                    <Text style={styles.itemName} numberOfLines={1}>{d.name}</Text>
                    <Text style={styles.itemMeta} numberOfLines={1}>{d.format} · No cards yet</Text>
                  </View>
                </Item>
              )}
            />
          </View>
        )}
      </AnimatedScrollView>

      <View
        style={[styles.toolbar, { height: toolbarHeight, paddingBottom: insets.bottom + 8 }]}
        accessibilityRole="toolbar"
        accessibilityLabel="Selection actions"
      >
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

// A row you tap to select (it turns gold), with the drag grip from ReorderList at its end.
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
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.14)',
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
