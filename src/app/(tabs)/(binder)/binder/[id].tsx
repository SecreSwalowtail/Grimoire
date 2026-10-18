import { BlurTargetView } from 'expo-blur'
import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useRef, useState } from 'react'
import { Alert, BackHandler, Keyboard, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BinderSheet } from '@/components/binder/binder-sheet'
import { CardGrid, searchAndSort } from '@/components/binder/card-grid'
import { EditCopiesSheet } from '@/components/binder/edit-copies-sheet'
import { ExportButton, HoldHint, SearchField, SearchTool, SortButton, ValueSummary } from '@/components/binder/parts'
import { QuickLook } from '@/components/binder/quick-look'
import { addEntriesToDecks, BinderToDeckSheet, type Copies } from '@/components/binder/to-deck-sheet'
import { summarize, useCollection } from '@/components/binder/use-collection'
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
} from '@/components/deck/card-drag'
import { GroupSheet } from '@/components/deck/group-sheet'
import { ImportSheet } from '@/components/decks/import-sheet'
import { NewSheet } from '@/components/decks/new-sheet'
import { Icon, type IconName } from '@/components/icon'
import { CARD_SORTS, SortMenu, type CardSort } from '@/components/sort-menu'
import { Colors, Fonts } from '@/constants/theme'
import { binderSpine, deleteEmptyBinder } from '@/db/binders'
import { moveEntries, removeEntries, restoreEntries, type CollectionEntry } from '@/db/collection'
import { exportBinder } from '@/db/import-export'
import { GROUP_OPTIONS } from '@/rules/deck-stats'
import type { Board } from '@/utils/deck-store'
import { plural } from '@/utils/format'
import { setBinderGroupBy, useBinderGroupBy } from '@/utils/group-prefs'

// A change made in edit mode, undone with Undo.
type Undo = () => Promise<unknown>

// One binder opened: its value, a search, and its cards in a 3-column grid, grouped as picked in
// Group by (the button in the search field; the same groups as a deck's, saved per binder).
// Hold a card to edit: it's selected (not picked up), and every card lies still (no tilt, shimmer or
// pulse). Tap cards to select more; holding any selected card then picks up the whole selection. Sort
// and the search make way for Add to deck (put the cards in one or more decks; they stay here too)
// and New binder (a new binder with just these cards, moved out of this one): tap them, or drop the
// cards on them. Dragging the cards down into the trash bubble removes them from the collection.
// The bar at the bottom has Undo and Done; going back (or Done) leaves edit mode.
export default function BinderScreen() {
  const db = useSQLiteContext()
  const insets = useSafeAreaInsets()
  // `import`: just made with "Import from…" (Import cards opens straight to the file picker).
  const { id, import: importNow } = useLocalSearchParams<{ id: string; import?: string }>()
  const [importing, setImporting] = useState<{ autoPick: boolean } | null>(() => (importNow === '1' ? { autoPick: true } : null))
  const { binders, entries, oldPrices, loaded, reload } = useCollection()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<CardSort>('recent')
  const [sortOpen, setSortOpen] = useState(false)
  const groupBy = useBinderGroupBy(id)
  const groupOption = GROUP_OPTIONS.find((o) => o.value === groupBy)!
  const [groupOpen, setGroupOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  // This edit session's changes, latest last, for Undo.
  const [undos, setUndos] = useState<Undo[]>([])
  // What the last change did, shown in the edit bar.
  const [note, setNote] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // Cards removed or moved out, hidden until the reload that follows (which takes a moment).
  const [gone, setGone] = useState<number[]>([])
  const [deckOpen, setDeckOpen] = useState(false)
  const [newDeck, setNewDeck] = useState<{ board: Board; copies: Copies } | null>(null)
  const [binderOpen, setBinderOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  // Whether the New deck sheet just made a deck (it closes right after).
  const deckMade = useRef(false)
  // The screen, for the quick look to blur behind it.
  const page = useRef<View>(null)
  const drag = useCardDrag()

  const binder = binders.find((b) => b.id === id)
  // No useMemo needed: the React Compiler (enabled in app.json) memoizes these.
  const inside = entries.filter((e) => e.binder_id === id && !gone.includes(e.id))
  const { value, cards, change } = summarize(inside, oldPrices)
  const visible = searchAndSort(inside, query, sort)
  // Cards removed meanwhile drop out of the selection.
  const picked = inside.filter((e) => selected.includes(e.id))
  // The quick look (tap a card): the cards it goes through, in the grid's order, and the one tapped.
  const [look, setLook] = useState<{ ids: number[]; openId: number } | null>(null)
  // The quick look Card detail was opened from: it comes back, on that card, when the screen does.
  const lookToResume = useRef<{ ids: number[]; openId: number } | null>(null)
  useFocusEffect(
    useCallback(() => {
      const back = lookToResume.current
      if (!back) return
      lookToResume.current = null
      setLook(back)
    }, [setLook]),
  )
  const byId = new Map(inside.map((e) => [e.id, e]))
  const lookEntries = (look?.ids ?? []).flatMap((x) => byId.get(x) ?? [])

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

  const run = (work: Promise<unknown>) => work.then(reload).catch((e) => console.warn('Binder change failed', e))
  // A change is done: what it did, and how to take it back.
  const changed = (what: string, undo: Undo) => {
    setUndos((list) => [...list, undo])
    setNote(what)
    setSelected([])
  }
  const undo = () => {
    const last = undos[undos.length - 1]
    if (!last) return
    setUndos(undos.slice(0, -1))
    setSelected([])
    setNote(null)
    run(last())
  }

  // Holding a card outside edit mode starts editing with it selected (it isn't picked up). While
  // editing, only selected cards can be picked up, and they bring the rest of the selection.
  const startEditing = (entry: CollectionEntry) => {
    Keyboard.dismiss()
    setEditing(true)
    setSelected([entry.id])
    setNote(null)
  }
  const toggle = (entry: CollectionEntry) => {
    setNote(null)
    setSelected(selected.includes(entry.id) ? selected.filter((x) => x !== entry.id) : [...selected, entry.id])
  }

  const remove = () => {
    const ids = picked.map((e) => e.id)
    const what = `Removed ${plural(picked.reduce((n, e) => n + e.quantity, 0), 'card', 'cards')}`
    setGone((list) => [...list, ...ids])
    setSelected([])
    run(
      removeEntries(db, ids).then((rows) =>
        changed(what, async () => {
          await restoreEntries(db, rows)
          setGone((list) => list.filter((x) => !ids.includes(x)))
        }),
      ),
    )
  }
  const onDrop = (target: DropTarget | null) => {
    setDragging(false)
    if (target == null || picked.length === 0) return
    if (target === 'trash') remove()
    else if (target === 'to-deck') setDeckOpen(true)
    else if (target === 'new-binder') setBinderOpen(true)
    else if (target === 'edit-cards') setEditOpen(true)
  }
  // Only selected cards drag, and only in edit mode (holding outside it is the card's long press).
  const gestureFor = (entry: CollectionEntry) =>
    dragGesture(drag, entry, () => setDragging(true), onDrop).enabled(editing && selected.includes(entry.id))

  // The cards went into decks: they stay in the binder.
  const addedToDecks = (undo: () => void, decks: number, copies: number) =>
    changed(`Added ${plural(copies, 'card')} to ${plural(decks, 'deck')}`, async () => undo())
  const movedToBinder = (newId: string, name: string) => {
    const ids = picked.map((e) => e.id)
    const from = id
    setGone((list) => [...list, ...ids])
    reload()
    changed(`Moved ${plural(picked.reduce((n, e) => n + e.quantity, 0), 'card', 'cards')} to ${name}`, async () => {
      await moveEntries(db, ids, from)
      await deleteEmptyBinder(db, newId)
      setGone((list) => list.filter((x) => !ids.includes(x)))
    })
  }

  const actionsOff = picked.length === 0

  return (
    <BlurTargetView ref={page} style={styles.root}>
      <View pointerEvents="none" style={styles.glow} />
      {/* Header stays fixed; only the card grid below scrolls. */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.back}
            onPress={() => (editing ? stopEditing() : router.back())}
            accessibilityRole="button"
            accessibilityHint={editing ? 'Leaves edit mode' : undefined}
          >
            <Icon name={{ ios: 'chevron.left', android: 'chevron_left' }} size={22} tintColor={Colors.text} />
            <Text style={styles.backLabel}>Binders</Text>
          </TouchableOpacity>
          {!editing && (
            <View style={styles.topActions}>
              <ExportButton
                label="Export binder"
                onPress={() =>
                  binder &&
                  exportBinder(db, binder).catch((e) => {
                    console.warn('Export failed', e)
                    Alert.alert('Export failed', e instanceof Error ? e.message : String(e))
                  })
                }
              />
              <SortButton label="Sort cards" onPress={() => setSortOpen(true)} />
              <TouchableOpacity
                style={styles.add}
                onPress={() => setImporting({ autoPick: false })}
                accessibilityRole="button"
                accessibilityLabel="Import cards from a file"
              >
                <Icon name={{ ios: 'plus', android: 'add' }} size={22} tintColor={Colors.onGold} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {binder && (
          <View style={styles.titleRow}>
            <View style={[styles.spine, { experimental_backgroundImage: binderSpine(binder.color) }]} />
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{binder.name}</Text>
          </View>
        )}

        <ValueSummary label="Binder value" value={value} cards={cards} change={change} />

        {editing ? (
          <View style={styles.actions}>
            <EditAction
              drag={drag}
              id="to-deck"
              label="Add to deck"
              icon={{ ios: 'rectangle.stack.badge.plus', android: 'library_add' }}
              disabled={actionsOff}
              onPress={() => setDeckOpen(true)}
            />
            <EditAction
              drag={drag}
              id="new-binder"
              label="New binder"
              icon={{ ios: 'folder.badge.plus', android: 'create_new_folder' }}
              disabled={actionsOff}
              onPress={() => setBinderOpen(true)}
            />
            <EditAction
              drag={drag}
              id="edit-cards"
              label="Edit"
              icon={{ ios: 'pencil', android: 'edit' }}
              iconOnly
              disabled={actionsOff}
              onPress={() => setEditOpen(true)}
            />
          </View>
        ) : (
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search this binder"
            trailing={
              <SearchTool
                icon={groupOption.icon}
                label={groupBy === 'none' ? 'List' : groupOption.label}
                onPress={() => setGroupOpen(true)}
                accessibilityLabel={`Group by: ${groupOption.label}`}
              />
            }
          />
        )}
      </View>

      <CardGrid
        entries={visible}
        groupBy={groupBy}
        onOpen={(entry, shown) => setLook({ ids: shown, openId: entry.id })}
        edit={{ editing, selected, dragging, onToggle: toggle, onHold: startEditing, gestureFor }}
        header={!editing && inside.length > 0 ? <HoldHint label="Hold a card to select and edit it" /> : null}
        empty={
          !loaded ? null : inside.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>This binder is empty</Text>
              <Text style={styles.emptyText}>Scan your cards or import a collection to start.</Text>
              <Link href="/scan" asChild>
                <Pressable style={styles.primaryBtn} accessibilityRole="button">
                  <Text style={styles.primaryBtnLabel}>Scan cards</Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No cards match your search.</Text>
            </View>
          )
        }
      />

      {editing && (
        <>
          <EditBar
            canUndo={undos.length > 0}
            onUndo={undo}
            onDone={stopEditing}
            selected={picked.length}
            note={note}
          />
          <TrashBubble drag={drag} bottom={EDIT_BAR + 20} />
        </>
      )}
      <DragGhost drag={drag} lines={picked.map((e) => ({ key: String(e.id), name: e.name, image: e.image_uri, quantity: e.quantity }))} />

      <SortMenu
        visible={sortOpen}
        top={insets.top + 56}
        options={CARD_SORTS}
        value={sort}
        onSelect={setSort}
        onClose={() => setSortOpen(false)}
      />
      <QuickLook
        entries={lookEntries}
        openId={look?.openId ?? null}
        title={binder?.name ?? 'Binder'}
        binders={binders}
        oldPrices={oldPrices}
        blurTarget={page}
        onClose={() => setLook(null)}
        onDetails={(entryId) => {
          if (look) lookToResume.current = { ...look, openId: entryId }
        }}
        onChanged={reload}
      />
      <GroupSheet
        visible={groupOpen}
        value={groupBy}
        groupAll={false}
        onApply={(by) => setBinderGroupBy(id, by)}
        onClose={() => setGroupOpen(false)}
      />
      <BinderToDeckSheet
        visible={deckOpen}
        entries={picked}
        onClose={() => setDeckOpen(false)}
        onAdded={addedToDecks}
        onNewDeck={(board, copies) => {
          setDeckOpen(false)
          setNewDeck({ board, copies })
        }}
      />
      <NewSheet
        visible={newDeck != null}
        kind="deck"
        onClose={() => {
          // Closed without a deck: back to Add to deck. With one, the cards are in it: done.
          setNewDeck(null)
          if (!deckMade.current) setDeckOpen(true)
          deckMade.current = false
        }}
        onDeckCreated={(deckId) => {
          if (!newDeck) return
          deckMade.current = true
          addEntriesToDecks(db, picked, [deckId], newDeck.board, newDeck.copies)
            .then(({ undo, count }) => addedToDecks(undo, 1, count))
            .catch((e) => console.warn('Failed to add cards to the new deck', e))
        }}
      />
      <BinderSheet visible={binderOpen} entries={picked} onClose={() => setBinderOpen(false)} onCreated={movedToBinder} />
      <ImportSheet
        target={importing && binder ? { kind: 'binder', id: binder.id, name: binder.name } : null}
        autoPick={importing?.autoPick}
        onClose={() => setImporting(null)}
        onImported={reload}
      />
      <EditCopiesSheet
        visible={editOpen}
        entries={picked}
        onClose={() => setEditOpen(false)}
        onSaved={(undoEdit, n) => {
          reload()
          changed(`Edited ${plural(n, 'card')}`, undoEdit)
        }}
      />
    </BlurTargetView>
  )
}

// Add to deck / New binder / Edit, in the search field's place while editing. Tap it, or drop the
// cards on it. `iconOnly`: a square button, its label only read out.
function EditAction({
  drag,
  id,
  label,
  icon,
  iconOnly,
  disabled,
  onPress,
}: {
  drag: CardDrag
  id: DropTarget
  label: string
  icon: IconName
  iconOnly?: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <DropZone drag={drag} id={id} style={!iconOnly && styles.actionZone}>
      <TouchableOpacity
        style={[styles.action, iconOnly && styles.actionSquare, disabled && styles.actionOff]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={iconOnly ? `${label} the selected cards` : undefined}
        accessibilityHint="Or drag the selected cards onto it"
      >
        <Icon name={icon} size={18} tintColor={Colors.goldLight} />
        {!iconOnly && <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>}
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
    left: -120,
    top: -200,
    width: 630,
    height: 460,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(212,166,74,0.17), rgba(212,166,74,0))',
  },
  header: {
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  topActions: {
    flexDirection: 'row',
    gap: 8,
  },
  // The gold +, as on the Binders screen.
  add: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // The sort button's height, so the header doesn't jump when it hides in edit mode.
    minHeight: 44,
  },
  back: {
    height: 44,
    marginLeft: -6,
    paddingLeft: 4,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // The binder's spine, in its cover color.
  spine: {
    width: 14,
    height: 40,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,240,215,0.14)',
  },
  title: {
    flex: 1,
    fontSize: 38,
    lineHeight: 44,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  // Same height as the search field they replace.
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionZone: {
    flex: 1,
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
  actionSquare: {
    width: 48,
    paddingHorizontal: 0,
  },
  actionOff: {
    opacity: 0.4,
  },
  actionLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 48,
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
  primaryBtn: {
    marginTop: 20,
    height: 52,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
  },
  primaryBtnLabel: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
})
