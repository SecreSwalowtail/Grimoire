import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { BackHandler, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { HoldHint } from '@/components/binder/parts'
import {
  dragGesture,
  DragGhost,
  DragScrollView,
  DropZone,
  EDIT_BAR,
  EditBar,
  EdgeZone,
  TrashBubble,
  useCardDrag,
  type DropTarget,
} from '@/components/deck/card-drag'
import { DeckRow } from '@/components/decks/deck-row'
import { FolderIcon } from '@/components/decks/parts'
import { useDeckSheets } from '@/components/decks/use-deck-sheets'
import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import { withAlpha } from '@/utils/color'
import {
  deckCover,
  deckValue,
  deleteDecks,
  folderDecks,
  folderHex,
  mergeDecks,
  moveDecks,
  useDeckStore,
  type Undo,
} from '@/utils/deck-store'
import { plural } from '@/utils/format'
import { useMoney } from '@/utils/money'

// One folder's decks. Hold a deck to edit: it's selected; tap others to select them too, and hold
// any selected one to pick up the whole selection (more than five travel as a bundle). Drop them in
// the trash bubble to delete them, at the screen's edges (sides, top, or the very bottom past the
// trash) to take them out of the folder, or on another deck to merge them into it. The bar at the
// bottom has Undo and Done.
export default function FolderScreen() {
  const money = useMoney()
  const insets = useSafeAreaInsets()
  const { folderId } = useLocalSearchParams<{ folderId: string }>()
  const store = useDeckStore()
  const { folders, decks } = store
  const folder = folders.find((f) => f.id === folderId)
  const [editing, setEditing] = useState(false)
  // `deck:<id>`, the same keys as the decks' drop targets.
  const [selected, setSelected] = useState<string[]>([])
  // This edit session's changes, latest last, for Undo, and what the last one did.
  const [undos, setUndos] = useState<Undo[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // While editing, changes land in the edit bar's Undo; deleting this folder from its own menu goes
  // back to Decks, which shows the Undo toast.
  const changed = (what: string, undo: Undo) => {
    setUndos((list) => [...list, undo])
    setNote(what)
    setSelected([])
  }
  const deckSheets = useDeckSheets({ onFolderDeleted: () => router.back(), onUndoable: editing ? changed : undefined })

  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y)
  })
  // The dragged decks aren't targets. Wide bands at the screen's edges take decks out of the folder:
  // the sides (clear of the middle of the rows, where a drop merges), the top bar and a little more,
  // and the edit bar at the bottom (the trash still wins near it).
  const drag = useCardDrag({ scrollRef, scrollY, skip: selected, edges: { side: 64, top: insets.top + 100, bottom: EDIT_BAR } })
  // Taking decks into the top third of the screen scrolls back up.
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
    }, [editing]),
  )

  if (!folder) return <View style={styles.root}>{deckSheets.sheets}</View>

  const hex = folderHex(folder.color)
  const inside = folderDecks(decks, folder, store)
  const value = money.eur(inside.reduce((sum, d) => sum + deckValue(d, store), 0))
  // Decks deleted or moved meanwhile drop out of the selection.
  const picked = inside.filter((d) => selected.includes(`deck:${d.id}`))
  const ids = picked.map((d) => d.id)
  const what = (n: number) => (n === 1 ? picked[0]?.name ?? 'deck' : plural(n, 'deck'))

  const undo = () => {
    const last = undos[undos.length - 1]
    if (!last) return
    last()
    setUndos(undos.slice(0, -1))
    setSelected([])
    setNote(null)
  }
  const startEditing = (key: string) => {
    setEditing(true)
    setSelected([key])
    setNote(null)
  }
  const toggle = (key: string) => {
    setNote(null)
    setSelected(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])
  }
  const onDrop = (target: DropTarget | null) => {
    setDragging(false)
    if (target == null || ids.length === 0) return
    if (target === 'trash') {
      changed(`Deleted ${what(ids.length)}`, deleteDecks(ids))
    } else if (target === 'out') {
      changed(`Took ${what(ids.length)} out of ${folder.name}`, moveDecks(ids, null))
    } else if (target.startsWith('deck:')) {
      const into = inside.find((d) => d.id === target.slice('deck:'.length))
      if (into) changed(`Merged ${what(ids.length)} into ${into.name}`, mergeDecks(ids, into.id))
    }
  }
  // Only selected decks drag, and only in edit mode (holding outside it is the row's long press).
  const gestureFor = (key: string) =>
    dragGesture(drag, key, () => setDragging(true), onDrop, topZone).enabled(editing && selected.includes(key))

  const ghost = picked.map((d) => ({ key: `deck:${d.id}`, name: d.name, image: deckCover(d.id, store), quantity: 1 }))

  return (
    <View style={styles.root}>
      <View
        pointerEvents="none"
        style={[styles.glow, { experimental_backgroundImage: `radial-gradient(closest-side, ${withAlpha(hex, 0.2)}, rgba(0,0,0,0))` }]}
      />
      <DragScrollView
        showsVerticalScrollIndicator={false}
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }, editing && styles.contentEditing]}
        scrollEnabled={!dragging}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.back} onPress={() => (editing ? stopEditing() : router.back())} accessibilityRole="button">
            <Icon name={{ ios: 'chevron.left', android: 'chevron_left' }} size={22} tintColor={Colors.text} />
            <Text style={styles.backLabel}>Decks</Text>
          </TouchableOpacity>
          {!editing && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => deckSheets.openFolderEdit(folder.id)}
                accessibilityRole="button"
                accessibilityLabel="Folder options"
              >
                <Icon name={{ ios: 'ellipsis', android: 'more_horiz' }} size={20} tintColor={Colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.add}
                onPress={() => deckSheets.openNew({ kind: 'deck', folderId: folder.id })}
                accessibilityRole="button"
                accessibilityLabel={`New deck in ${folder.name}`}
              >
                <Icon name={{ ios: 'plus', android: 'add' }} size={22} tintColor={Colors.onGold} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.header}>
          <View style={[styles.folderTile, { backgroundColor: withAlpha(hex, 0.12), borderColor: withAlpha(hex, 0.35) }]}>
            <FolderIcon color={hex} width={30} fill={0.25} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>{folder.name}</Text>
            <Text style={styles.summary}>
              {plural(inside.length, 'deck')} · {value}
            </Text>
          </View>
        </View>

        <View style={styles.list}>
          {!editing && inside.length > 0 && <HoldHint label="Hold a deck to select, delete, merge or take it out" />}
          {inside.map((d, i) => {
            const key: DropTarget = `deck:${d.id}`
            return (
              <DropZone key={d.id} drag={drag} id={key}>
                <GestureDetector gesture={gestureFor(key)}>
                  {/* A plain view for the gesture to attach to (DeckRow takes no ref). */}
                  <View collapsable={false}>
                    <DeckRow
                      deck={d}
                      last={i === inside.length - 1}
                      onOptions={editing ? undefined : () => deckSheets.openDeckOptions(d.id)}
                      edit={editing ? { selected: selected.includes(key), onToggle: () => toggle(key) } : undefined}
                      onHold={() => startEditing(key)}
                    />
                  </View>
                </GestureDetector>
              </DropZone>
            )
          })}
        </View>

        {!editing && (
          <TouchableOpacity
            style={styles.addDeck}
            onPress={() => deckSheets.openNew({ kind: 'deck', folderId: folder.id })}
            accessibilityRole="button"
          >
            <Icon name={{ ios: 'plus', android: 'add' }} size={18} tintColor={Colors.goldLight} />
            <Text style={styles.addDeckLabel} numberOfLines={1}>Add a deck to {folder.name}</Text>
          </TouchableOpacity>
        )}
      </DragScrollView>

      {editing && (
        <>
          <EditBar
            canUndo={undos.length > 0}
            onUndo={undo}
            onDone={stopEditing}
            selected={picked.length}
            note={
              note ??
              (picked.length
                ? `${picked.length} selected · hold one to drag them all`
                : 'Tap decks to select, then hold one to drag')
            }
          />
          <TrashBubble drag={drag} bottom={EDIT_BAR + 20} />
          <EdgeZone drag={drag} label={`Take out of ${folder.name}`} />
        </>
      )}
      <DragGhost drag={drag} lines={ghost} label={plural(ghost.length, 'deck')} />

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
    left: -60,
    top: -170,
    width: 560,
    height: 440,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 96,
  },
  // Room for the edit bar and the trash above it.
  contentEditing: {
    paddingBottom: EDIT_BAR + 120,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // The buttons' height, so the header doesn't jump when they hide in edit mode.
    minHeight: 44,
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
  list: {
    marginTop: 22,
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
})
