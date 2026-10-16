import { router, useFocusEffect } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { BackHandler, Keyboard, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  dragGesture,
  DragGhost,
  DropZone,
  EDIT_BAR,
  EditBar,
  TrashBubble,
  useCardDrag,
  type CardDrag,
  type DropTarget,
} from '@/components/deck/card-drag';
import { DeckRow, FolderCard } from '@/components/decks/deck-row';
import { DEFAULT_DECK_SORT, DeckSortSheet, sortDecks, sortFolders, type DeckSort } from '@/components/decks/sort-sheet';
import { useDeckSheets } from '@/components/decks/use-deck-sheets';
import { Colors, Fonts } from '@/constants/theme';
import {
  deckValue,
  deleteDecks,
  duplicateDecks,
  moveDecks,
  reorderDecks,
  reorderFolders,
  useDeckStore,
  type DeckData,
  type Undo,
} from '@/utils/deck-store';
import { useSearchBack } from '@/utils/use-search-back';
import { useMoney } from '@/utils/money';

const NEW_FOLDER = 'new-folder'

// Gesture-handler's scroll view, animatable so a drag can scroll it.
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView)

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// [a, b, c] -> [[a, b], [c]], for the 2-column folder grid.
function pairs<T>(items: T[]) {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return rows
}

// What a dragged deck shows: its most valuable card (the maybeboard left out).
function coverImage(deckId: string, { cards, info }: DeckData) {
  const price = (id: string) => info[id]?.priceEur ?? info[id]?.priceEurFoil ?? 0
  const best = cards
    .filter((c) => c.deckId === deckId && c.board !== 'maybe')
    .sort((a, b) => price(b.cardId) - price(a.cardId))[0]
  return best ? info[best.cardId]?.image ?? null : null
}

// `order` with the `moving` ids taken out and put in `target`'s place: after it when they came from
// above it, before it when from below (as if dragged there).
function placed(order: string[], moving: string[], target: string) {
  const from = order.findIndex((id) => moving.includes(id))
  const rest = order.filter((id) => !moving.includes(id))
  const at = rest.indexOf(target) + (from < order.indexOf(target) ? 1 : 0)
  return [...rest.slice(0, at), ...order.filter((id) => moving.includes(id)), ...rest.slice(at)]
}

// Decks: folders as a grid of cards, then the decks that aren't in a folder.
// Hold a deck or folder to edit: it's selected (not picked up). Tap others to select them too;
// holding any selected one then picks up the whole selection. Drop decks on a folder to file them
// there, on New folder for a new folder with them, on Duplicate, or into the trash bubble that rises
// at the bottom. In your own order (no sort, no search), dropping on a deck or folder of the same
// kind puts them in its place. Sort, + and the search make way for Duplicate (tap it, or drop on
// it); the bar at the bottom has Undo and Done. Deleting folders asks what to do with their decks.
export default function DecksScreen() {
  const money = useMoney()
  const insets = useSafeAreaInsets()
  const store = useDeckStore()
  const { folders, decks } = store
  const [query, setQuery] = useState('')
  const searchInput = useRef<TextInput>(null)
  useSearchBack(searchInput)
  const [sort, setSort] = useState<DeckSort>(DEFAULT_DECK_SORT)
  const [sortOpen, setSortOpen] = useState(false)
  const sorted = sort.by != null
  const [editing, setEditing] = useState(false)
  // `deck:<id>` and `folder:<id>`, the same keys as their drop targets.
  const [selected, setSelected] = useState<string[]>([])
  // This edit session's changes, latest last, for Undo, and what the last one did.
  const [undos, setUndos] = useState<Undo[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // A change is done: what it did, and how to take it back.
  const changed = (what: string, undo: Undo) => {
    setUndos((list) => [...list, undo])
    setNote(what)
    setSelected([])
  }
  // While editing, deleting folders (after the dialog) lands in the edit bar's Undo, not the toast.
  const deckSheets = useDeckSheets({ onUndoable: editing ? changed : undefined })

  const loose = decks.filter((d) => d.folderId == null)
  const q = query.trim().toLowerCase()
  // In the chosen sort, pinned folders first.
  const shownFolders = sortFolders(folders.filter((f) => !q || f.name.toLowerCase().includes(q)), decks, sort, store)
  // While searching, decks inside folders match too.
  const shownDecks = sortDecks(q ? decks.filter((d) => d.name.toLowerCase().includes(q)) : loose, sort, store)
  const totalValue = money.eur(decks.reduce((sum, d) => sum + deckValue(d, store), 0))
  const count = (folderId: string) => decks.filter((d) => d.folderId === folderId).length
  // Grid tiles: folder ids, then the "New folder" card (hidden while searching).
  const tiles = [...shownFolders.map((f) => f.id), ...(q ? [] : [NEW_FOLDER])]

  // Things deleted meanwhile drop out of the selection.
  const pickedDecks = decks.filter((d) => selected.includes(`deck:${d.id}`))
  const pickedFolders = folders.filter((f) => selected.includes(`folder:${f.id}`))
  const picked = pickedDecks.length + pickedFolders.length
  // Taking things to a deck's or folder's place only means something in your own order, all shown.
  const reorderable = !sorted && !q

  // What the selection can go to: a folder takes decks (not when they're all in it already), or
  // folders in your order; a deck takes decks in your order. Rows that don't take it aren't targets
  // at all (nor are the dragged ones), so passing over them on the way to the trash shows nothing;
  // Duplicate and New folder turn red without decks.
  const folderTakes = (folderId: string) =>
    pickedDecks.length > 0 ? pickedDecks.some((d) => d.folderId !== folderId) : reorderable && pickedFolders.length > 0
  const decksTake = reorderable && pickedDecks.length > 0 && pickedFolders.length === 0
  const skip = [
    ...selected,
    ...shownFolders.filter((f) => !folderTakes(f.id)).map((f) => `folder:${f.id}`),
    ...(decksTake ? [] : shownDecks.map((d) => `deck:${d.id}`)),
  ]
  const refuse: DropTarget[] = pickedDecks.length ? [] : ['duplicate', 'new-folder']

  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y)
  })
  const drag = useCardDrag({ scrollRef, scrollY, skip, refuse })
  // Taking things into the top third of the screen scrolls up to the folders.
  const topZone = useWindowDimensions().height / 3

  const stopEditing = () => {
    setEditing(false)
    setSelected([])
    setUndos([])
    setNote(null)
  }
  // Android's back button leaves edit mode first.
  useFocusEffect(
    useCallback(() => {
      if (!editing) return
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setEditing(false)
        setSelected([])
        setUndos([])
        setNote(null)
        return true
      })
      return () => sub.remove()
    }, [editing, setEditing, setSelected, setUndos, setNote]),
  )
  const undo = () => {
    const last = undos[undos.length - 1]
    if (!last) return
    last()
    setUndos(undos.slice(0, -1))
    setSelected([])
    setNote(null)
  }

  // Holding a deck or folder outside edit mode starts editing with it selected.
  const startEditing = (key: string) => {
    Keyboard.dismiss()
    setEditing(true)
    setSelected([key])
    setNote(null)
  }
  const toggle = (key: string) => {
    setNote(null)
    setSelected(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])
  }
  const editOf = (key: string) => (editing ? { selected: selected.includes(key), onToggle: () => toggle(key) } : undefined)

  // Decks go straight away (with Undo); folders ask first what to do with their decks.
  const remove = () => {
    if (pickedDecks.length) changed(`Deleted ${plural(pickedDecks.length, 'deck', 'decks')}`, deleteDecks(pickedDecks.map((d) => d.id)))
    if (pickedFolders.length) deckSheets.openDeleteFolders(pickedFolders.map((f) => f.id))
    setSelected([])
  }
  const duplicate = () => {
    if (!pickedDecks.length) return
    changed(`Duplicated ${plural(pickedDecks.length, 'deck', 'decks')}`, duplicateDecks(pickedDecks.map((d) => d.id)))
  }
  const newFolder = () => {
    if (!pickedDecks.length) return
    deckSheets.openNew({ kind: 'folder', deckIds: pickedDecks.map((d) => d.id) })
    setSelected([])
  }
  const onFolder = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId)
    if (!folder || !folderTakes(folderId)) return
    if (pickedDecks.length) {
      const ids = pickedDecks.filter((d) => d.folderId !== folderId).map((d) => d.id)
      const what = ids.length === 1 ? decks.find((d) => d.id === ids[0])!.name : plural(ids.length, 'deck', 'decks')
      changed(`Moved ${what} to ${folder.name}`, moveDecks(ids, folderId))
    } else {
      const before = folders.map((f) => f.id)
      reorderFolders(placed(shownFolders.map((f) => f.id), pickedFolders.map((f) => f.id), folderId))
      changed(`Moved ${plural(pickedFolders.length, 'folder', 'folders')}`, () => reorderFolders(before))
    }
  }
  const onDeck = (deckId: string) => {
    if (!decksTake) return
    const order = shownDecks.map((d) => d.id)
    reorderDecks(placed(order, pickedDecks.map((d) => d.id), deckId))
    changed(`Moved ${plural(pickedDecks.length, 'deck', 'decks')}`, () => reorderDecks(order))
  }
  const onDrop = (target: DropTarget | null) => {
    setDragging(false)
    if (target == null || picked === 0) return
    if (target === 'trash') remove()
    else if (target === 'duplicate') duplicate()
    else if (target === 'new-folder') newFolder()
    else if (target.startsWith('folder:')) onFolder(target.slice('folder:'.length))
    else if (target.startsWith('deck:')) onDeck(target.slice('deck:'.length))
  }
  const onDragStart = () => {
    Keyboard.dismiss()
    setDragging(true)
  }
  // Only selected things drag, and only in edit mode (holding outside it is the long press).
  const gestureFor = (key: string) => dragGesture(drag, key, onDragStart, onDrop, topZone).enabled(editing && selected.includes(key))

  const ghost = [
    ...pickedFolders.map((f) => ({ key: `folder:${f.id}`, name: f.name, image: null, quantity: 1 })),
    ...pickedDecks.map((d) => ({ key: `deck:${d.id}`, name: d.name, image: coverImage(d.id, store), quantity: 1 })),
  ]
  const ghostLabel = [
    pickedDecks.length ? plural(pickedDecks.length, 'deck', 'decks') : null,
    pickedFolders.length ? plural(pickedFolders.length, 'folder', 'folders') : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.glow} />
      {/* Header stays fixed; folders and decks scroll. */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Decks</Text>
          {!editing && (
            <View style={styles.actions}>
              {/* Gold edge while a sort other than your own order is on. */}
              <TouchableOpacity
                style={[styles.iconBtn, sorted && styles.iconBtnOn]}
                onPress={() => setSortOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Sort decks"
              >
                <SymbolView name={{ ios: 'arrow.up.arrow.down', android: 'swap_vert' }} size={20} tintColor={sorted ? Colors.goldLight : Colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.add}
                onPress={() => deckSheets.openNew({ kind: 'deck' })}
                accessibilityRole="button"
                accessibilityLabel="New deck or folder"
              >
                <SymbolView name={{ ios: 'plus', android: 'add' }} size={22} tintColor={Colors.onGold} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.summary} accessibilityLabel={`Value of all decks ${totalValue}, ${decks.length} decks`}>
          <View>
            <Text style={styles.sectionLabel}>Value of all decks</Text>
            <Text style={styles.value}>{totalValue}</Text>
          </View>
          <View style={styles.counts}>
            <Text style={styles.deckCount}>{decks.length} {decks.length === 1 ? 'deck' : 'decks'}</Text>
            <Text style={styles.countDetail}>
              {folders.length} {folders.length === 1 ? 'folder' : 'folders'} · {loose.length} loose
            </Text>
          </View>
        </View>

        {editing ? (
          <EditAction
            drag={drag}
            id="duplicate"
            label="Duplicate"
            icon={{ ios: 'plus.square.on.square', android: 'content_copy' }}
            disabled={pickedDecks.length === 0}
            onPress={duplicate}
          />
        ) : (
          <View style={styles.search}>
            <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={20} tintColor={Colors.textSecondary} />
            <TextInput
              ref={searchInput}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search decks and folders"
              placeholderTextColor={Colors.textMuted}
              accessibilityLabel="Search decks and folders"
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
        )}
      </View>

      <AnimatedScrollView showsVerticalScrollIndicator={false}
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.content, editing && styles.contentEditing]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEnabled={!dragging}
      >
        <Text style={[styles.sectionLabel, styles.sectionGap]}>Folders</Text>
        <View style={styles.grid}>
          {pairs(tiles).map((pair, i) => (
            <View key={i} style={styles.gridRow}>
              {pair.map((tile) => (
                <View key={tile} style={styles.cell}>
                  {tile === NEW_FOLDER ? (
                    <DropZone drag={drag} id="new-folder">
                      <Pressable
                        style={[styles.newFolder, editing && pickedDecks.length === 0 && styles.off]}
                        onPress={() => (editing ? newFolder() : deckSheets.openNew({ kind: 'folder' }))}
                        disabled={editing && pickedDecks.length === 0}
                        accessibilityRole="button"
                        accessibilityHint={editing ? 'A new folder with the selected decks. Or drag them onto it' : undefined}
                      >
                        <SymbolView name={{ ios: 'folder.badge.plus', android: 'create_new_folder' }} size={24} tintColor={Colors.goldLight} />
                        <Text style={styles.newFolderLabel}>New folder</Text>
                      </Pressable>
                    </DropZone>
                  ) : (
                    <DropZone drag={drag} id={`folder:${tile}`}>
                      <GestureDetector gesture={gestureFor(`folder:${tile}`)}>
                        {/* A plain view for the gesture to attach to (FolderCard takes no ref). */}
                        <View collapsable={false}>
                          <FolderCard
                            folder={shownFolders.find((f) => f.id === tile)!}
                            count={count(tile)}
                            onOpen={() => router.push({ pathname: '/decks/[folderId]', params: { folderId: tile } })}
                            onOptions={() => deckSheets.openFolderEdit(tile)}
                            edit={editOf(`folder:${tile}`)}
                            onHold={() => startEditing(`folder:${tile}`)}
                          />
                        </View>
                      </GestureDetector>
                    </DropZone>
                  )}
                </View>
              ))}
              {/* Keeps a lone last card at half width. */}
              {pair.length === 1 && <View style={styles.cell} />}
            </View>
          ))}
        </View>

        <View style={styles.decksHeader}>
          <Text style={styles.sectionLabel}>Decks</Text>
          {!q && <Text style={styles.decksNote}>Not in a folder</Text>}
        </View>
        {shownDecks.map((d, i) => (
          <DropZone key={d.id} drag={drag} id={`deck:${d.id}`}>
            <GestureDetector gesture={gestureFor(`deck:${d.id}`)}>
              <View collapsable={false}>
                <DeckRow
                  deck={d}
                  last={i === shownDecks.length - 1}
                  onOptions={() => deckSheets.openDeckOptions(d.id)}
                  edit={editOf(`deck:${d.id}`)}
                  onHold={() => startEditing(`deck:${d.id}`)}
                />
              </View>
            </GestureDetector>
          </DropZone>
        ))}
        {shownDecks.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{q ? 'Nothing found' : decks.length === 0 ? 'No decks yet' : 'All decks are in folders'}</Text>
            <Text style={styles.emptyText}>
              {q ? 'Try a different deck or folder name.' : decks.length === 0 ? 'Tap + to build your first deck.' : 'New decks without a folder show up here.'}
            </Text>
          </View>
        )}
      </AnimatedScrollView>

      {editing && (
        <>
          <EditBar
            canUndo={undos.length > 0}
            onUndo={undo}
            onDone={stopEditing}
            selected={picked}
            note={note ?? (picked ? `${picked} selected · hold one to drag them all` : 'Tap decks and folders to select, then hold one to drag')}
          />
          <TrashBubble drag={drag} bottom={EDIT_BAR + 20} />
        </>
      )}
      <DragGhost drag={drag} lines={ghost} label={ghostLabel} />

      {deckSheets.sheets}
      <DeckSortSheet visible={sortOpen} value={sort} onApply={setSort} onClose={() => setSortOpen(false)} />
    </View>
  )
}

// Duplicate, in the search field's place while editing. Tap it, or drop the selection on it.
function EditAction({
  drag,
  id,
  label,
  icon,
  disabled,
  onPress,
}: {
  drag: CardDrag
  id: DropTarget
  label: string
  icon: SymbolViewProps['name']
  disabled: boolean
  onPress: () => void
}) {
  return (
    <DropZone drag={drag} id={id} fixed>
      <TouchableOpacity
        style={[styles.action, disabled && styles.off]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityHint="Or drag the selection onto it"
      >
        <SymbolView name={icon} size={18} tintColor={Colors.goldLight} />
        <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    </DropZone>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  glow: {
    position: 'absolute',
    left: -140,
    top: -210,
    width: 640,
    height: 470,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(212,166,74,0.14), rgba(212,166,74,0))',
  },
  header: {
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  // Keeps its height when the buttons hide in edit mode.
  titleRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 42,
    lineHeight: 46,
    fontFamily: Fonts.serif,
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
  iconBtnOn: {
    borderColor: 'rgba(212,166,74,0.6)',
    backgroundColor: 'rgba(212,166,74,0.10)',
  },
  add: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  value: {
    marginTop: 6,
    fontSize: 34,
    fontFamily: Fonts.extraBold,
    letterSpacing: -0.5,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  counts: {
    alignItems: 'flex-end',
    paddingBottom: 5,
  },
  deckCount: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  countDetail: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  search: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  action: {
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.45)',
    backgroundColor: 'rgba(212,166,74,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  off: {
    opacity: 0.4,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 96,
  },
  // Clear of the edit bar.
  contentEditing: {
    paddingBottom: EDIT_BAR + 40,
  },
  sectionGap: {
    marginTop: 14,
    marginBottom: 10,
    marginLeft: 2,
  },
  grid: {
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cell: {
    flex: 1,
  },
  newFolder: {
    height: 96,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(212,166,74,0.45)',
    backgroundColor: 'rgba(212,166,74,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  newFolderLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  decksHeader: {
    marginTop: 22,
    marginLeft: 2,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  decksNote: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 32,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    fontSize: 28,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
})
