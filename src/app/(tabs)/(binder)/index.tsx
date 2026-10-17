import { BlurTargetView } from 'expo-blur'
import { Link, router, useFocusEffect } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useRef, useState } from 'react'
import { BackHandler, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BinderCover, COVER_BOX } from '@/components/binder/binder-cover'
import { MergeBindersDialog, RemoveBinderDialog } from '@/components/binder/binder-dialogs'
import { BinderSheet } from '@/components/binder/binder-sheet'
import { CardGrid, searchAndSort } from '@/components/binder/card-grid'
import { HoldHint, SearchField, SortButton, ValueSummary } from '@/components/binder/parts'
import { QuickLook } from '@/components/binder/quick-look'
import { ReorderGrid } from '@/components/binder/reorder-grid'
import { summarize, useCollection } from '@/components/binder/use-collection'
import { DragGhost, EDIT_BAR, EditBar, TrashBubble, useCardDrag } from '@/components/deck/card-drag'
import { Icon } from '@/components/icon'
import { SortMenu } from '@/components/sort-menu'
import { Colors, Fonts } from '@/constants/theme'
import { deleteBinders, mergeBinders, reorderBinders, type Binder } from '@/db/binders'
import type { CollectionEntry } from '@/db/collection'
import { plural } from '@/utils/format'
import { useMoney } from '@/utils/money'
import { forgetScanBinder } from '@/utils/scan-target'

type BinderSort = 'custom' | 'value' | 'valueAsc' | 'name'

const BINDER_SORTS: { value: BinderSort; label: string }[] = [
  { value: 'custom', label: 'Your order' },
  { value: 'value', label: 'Value: high to low' },
  { value: 'valueAsc', label: 'Value: low to high' },
  { value: 'name', label: 'Name: A to Z' },
]

const COLUMN_GAP = 14
const ROW_GAP = 18

type Row = { id: string; binder: Binder; value: number; cards: number; change: number | null }

// Binder tab: every binder as a closed binder with its value, the total of all of them, and a
// search across all of them (which shows the matching cards instead of the binders).
// Hold a binder to edit: sort and + make way for Edit, the bar at the bottom has Undo and Done, and
// the held binder is selected (tap others to select them too). Keep holding to drag it: drop it in
// another place to reorder, on the middle of another binder to merge the two, or into the trash
// bubble that rises at the bottom to remove it (it asks first what to do with the cards). Holding
// one of several selected binders carries them all, shown under the finger like dragged cards.
export default function BindersScreen() {
  const money = useMoney()
  const db = useSQLiteContext()
  const insets = useSafeAreaInsets()
  // Two columns between 20 px margins; the binder drawing scales to fit.
  const cellWidth = (useWindowDimensions().width - 40 - COLUMN_GAP) / 2
  const coverScale = cellWidth / COVER_BOX.width
  const { binders, entries, oldPrices, loaded, reload } = useCollection()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<BinderSort>('custom')
  const [sortOpen, setSortOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // The trash bubble a dragged binder can go into.
  const trash = useCardDrag()
  // No scrolling while a binder is being dragged; `groupDrag`: the drag carries every selected one.
  const [dragging, setDragging] = useState(false)
  const [groupDrag, setGroupDrag] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [merge, setMerge] = useState<{ from: string[]; into: string } | null>(null)
  // This edit session's changes, latest last, for Undo, and what the last one did.
  const [undos, setUndos] = useState<(() => Promise<unknown>)[]>([])
  const [note, setNote] = useState<string | null>(null)
  // The quick look over search results (tap a card): the cards it goes through and the one tapped.
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
  // The screen, for the quick look to blur behind it.
  const page = useRef<View>(null)
  // Height of a binder with its text, which depends on the font size: the tallest one measured.
  const [measured, setMeasured] = useState<number | null>(null)
  const cellHeight = measured ?? COVER_BOX.height * coverScale + 80
  // The binder drawing within its cell (it runs 112 wide and 170 tall in the drawing's units):
  // the selection frame and the merge glow go around it, not around its text.
  const pad = 6
  const frame = {
    left: -pad,
    top: 3 * coverScale - pad,
    width: 112 * coverScale + 2 * pad,
    height: 170 * coverScale + 2 * pad,
    radius: 16,
  }

  const stopEditing = () => {
    setEditing(false)
    setSelectedIds([])
    setUndos([])
    setNote(null)
  }
  // Android's back button leaves edit mode first.
  useFocusEffect(
    useCallback(() => {
      if (!editing) return
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setEditing(false)
        setSelectedIds([])
        setUndos([])
        setNote(null)
        return true
      })
      return () => sub.remove()
    }, [editing]),
  )

  // No useMemo needed: the React Compiler (enabled in app.json) memoizes this.
  const entryById = new Map(entries.map((e) => [e.id, e]))
  const byBinder = new Map<string, CollectionEntry[]>()
  for (const e of entries) {
    const list = byBinder.get(e.binder_id)
    if (list) list.push(e)
    else byBinder.set(e.binder_id, [e])
  }
  const total = summarize(entries, oldPrices)
  const rows: Row[] = binders.map((binder) => ({ id: binder.id, binder, ...summarize(byBinder.get(binder.id) ?? [], oldPrices) }))
  // While editing, binders show in your order: that's the order dragging changes.
  const sorted =
    editing ? rows
    : sort === 'value' ? [...rows].sort((a, b) => b.value - a.value)
    : sort === 'valueAsc' ? [...rows].sort((a, b) => a.value - b.value)
    : sort === 'name' ? [...rows].sort((a, b) => a.binder.name.localeCompare(b.binder.name))
    : rows
  const searching = query.trim() !== ''
  // Binders deleted meanwhile drop out of the selection.
  const selected = binders.filter((b) => selectedIds.includes(b.id))
  const one = selected.length === 1 ? selected[0] : null
  const cardsIn = (id: string | undefined) => rows.find((r) => r.id === id)?.cards ?? 0
  const byId = (id: string | undefined) => binders.find((b) => b.id === id) ?? null
  const toggle = (id: string) => {
    setNote(null)
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  }
  // Holding one of several selected binders drags them all (as ReorderGrid does).
  const carried = (id: string) => (selectedIds.length > 1 && selectedIds.includes(id) ? selected.map((b) => b.id) : [id])
  const names = (ids: string[]) => (ids.length === 1 ? `“${byId(ids[0])?.name ?? 'binder'}”` : plural(ids.length, 'binder'))

  const run = (work: Promise<unknown>) => work.then(reload).catch((e) => console.warn('Binder change failed', e))
  // A change is done: what it did, and how to take it back.
  const changed = (what: string, undo: () => Promise<unknown>) => {
    setUndos((list) => [...list, undo])
    setNote(what)
    setSelectedIds([])
  }
  const undo = () => {
    const last = undos[undos.length - 1]
    if (!last) return
    setUndos(undos.slice(0, -1))
    setSelectedIds([])
    setNote(null)
    run(last())
  }
  const doReorder = (ids: string[]) => {
    const before = binders.map((b) => b.id)
    run(reorderBinders(db, ids).then(() => changed('Changed the order', () => reorderBinders(db, before))))
  }
  const doMerge = () => {
    if (!merge) return
    const { from, into } = merge
    const what = `Merged ${names(from)} into “${byId(into)?.name ?? 'binder'}”`
    setMerge(null)
    from.forEach(forgetScanBinder)
    run(mergeBinders(db, from, into).then((back) => changed(what, back)))
  }
  const doRemove = (moveTo: string | null) => {
    const ids = selected.map((b) => b.id)
    const what = `Removed ${names(ids)}`
    setRemoving(false)
    ids.forEach(forgetScanBinder)
    run(deleteBinders(db, ids, moveTo).then((back) => changed(what, back)))
  }

  const binderItem = ({ binder, value, cards, change }: Row) => {
    const isSelected = editing && selectedIds.includes(binder.id)
    return (
      <Pressable
        style={styles.item}
        onPress={() => (editing ? toggle(binder.id) : router.push({ pathname: '/binder/[id]', params: { id: binder.id } }))}
        onLayout={(e) => {
          const h = Math.ceil(e.nativeEvent.layout.height)
          if (measured == null || h > measured) setMeasured(h)
        }}
        accessibilityRole="button"
        accessibilityState={editing ? { selected: isSelected } : undefined}
        accessibilityLabel={`${editing ? 'Select' : 'Open'} ${binder.name}, ${plural(cards, 'card')}, ${money.eur(value)}`}
        accessibilityHint={editing ? undefined : 'Hold to edit, reorder or merge binders'}
      >
        <BinderCover color={binder.color} scale={coverScale} />
        {isSelected && (
          <View
            pointerEvents="none"
            style={[styles.selected, { left: frame.left, top: frame.top, width: frame.width, height: frame.height, borderRadius: frame.radius }]}
          />
        )}
        <View style={styles.itemText}>
          <Text style={[styles.name, isSelected && styles.nameSelected]} numberOfLines={1}>{binder.name}</Text>
          {/* Value, then its change under it: side by side they ran into the next binder in
              longer currencies. */}
          <Text style={styles.itemValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {money.eur(value)}
          </Text>
          {change != null && (
            <Text style={[styles.itemChange, { color: change >= 0 ? Colors.positive : Colors.negative }]} numberOfLines={1}>
              {change >= 0 ? '▲' : '▼'} {money.eur(Math.abs(change))}
            </Text>
          )}
          <Text style={styles.count}>{plural(cards, 'card')}</Text>
        </View>
      </Pressable>
    )
  }

  // Dropped into the trash: what the drag carried, once the dialog says what happens to the cards.
  const trashBinder = (id: string) => {
    setSelectedIds(carried(id))
    setRemoving(true)
  }

  // A group under the finger: up to 5 fanned out, more as a bundle with the count.
  const ghost = selected.map((b) => ({ key: b.id, name: b.name, image: null, quantity: 1 }))
  const ghostLabel = `${plural(selected.length, 'binder')} · ${plural(selected.reduce((n, b) => n + cardsIn(b.id), 0), 'card')}`

  return (
    <BlurTargetView ref={page} style={styles.root}>
      <View pointerEvents="none" style={styles.glow} />
      {/* Header stays fixed; the binders (or search results) below scroll. */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Binder</Text>
          {editing ? (
            <View style={styles.actions}>
              {/* Edit is for one binder at a time. */}
              {selected.length < 2 && (
                <TouchableOpacity
                  style={[styles.iconBtn, !one && styles.disabled]}
                  onPress={() => setEditOpen(true)}
                  disabled={!one}
                  accessibilityRole="button"
                  accessibilityLabel={one ? `Edit ${one.name}` : 'Edit binder'}
                >
                  <Icon name={{ ios: 'pencil', android: 'edit' }} size={20} tintColor={Colors.text} />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            !searching && (
              <View style={styles.actions}>
                <SortButton label="Sort binders" onPress={() => setSortOpen(true)} />
                <TouchableOpacity style={styles.add} onPress={() => setNewOpen(true)} accessibilityRole="button" accessibilityLabel="New binder">
                  <Icon name={{ ios: 'plus', android: 'add' }} size={22} tintColor={Colors.onGold} />
                </TouchableOpacity>
              </View>
            )
          )}
        </View>

        <View style={styles.summary}>
          <ValueSummary label="All binders" value={total.value} cards={total.cards} change={total.change} />
          {total.value > 0 && (
            <View
              style={styles.shares}
              accessible
              accessibilityLabel={`Share of total value: ${rows.map((r) => `${r.binder.name} ${Math.round((r.value / total.value) * 100)}%`).join(', ')}`}
            >
              {/* Destructured: Reanimated's Babel plugin warns about any `.value` in an inline style. */}
              {rows.map(({ id, binder, value }) =>
                value > 0 ? <View key={id} style={[styles.share, { flex: value, backgroundColor: binder.color }]} /> : null,
              )}
            </View>
          )}
        </View>

        {/* While editing, the bar at the bottom says what to do. */}
        {!editing && <SearchField value={query} onChange={setQuery} placeholder="Search all binders" />}
      </View>

      {searching && !editing ? (
        <CardGrid
          entries={searchAndSort(entries, query, 'recent')}
          onOpen={(entry, shown) => setLook({ ids: shown, openId: entry.id })}
          empty={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No cards match your search.</Text>
            </View>
          }
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, editing && { paddingBottom: EDIT_BAR + 24 }]}
          scrollEnabled={!dragging}
        >
          {!editing && binders.length > 0 && <HoldHint label="Hold a binder to edit, reorder or merge" />}
          <ReorderGrid
            items={sorted}
            columns={2}
            cellWidth={cellWidth}
            cellHeight={cellHeight}
            columnGap={COLUMN_GAP}
            rowGap={ROW_GAP}
            renderItem={binderItem}
            onReorder={doReorder}
            onMerge={(id, into) => setMerge({ from: carried(id), into })}
            onHold={(id) => {
              // Holding starts editing with that binder picked; while editing it only drags.
              if (editing) return
              setEditing(true)
              setSelectedIds([id])
              setNote(null)
            }}
            onDragChange={(on, all) => {
              setDragging(on)
              setGroupDrag(on && all)
            }}
            glow={frame}
            trash={trash}
            onTrash={trashBinder}
            selected={editing ? selectedIds : undefined}
          />

          {loaded && entries.length === 0 && !editing && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{binders.length ? 'Your binders are empty' : 'No binders yet'}</Text>
              <Text style={styles.emptyText}>
                {binders.length
                  ? 'Scan your cards or import a collection to start.'
                  : 'Make one with +, or scan your cards or import a collection and they go into a new “My binder”.'}
              </Text>
              <Link href="/scan" asChild>
                <Pressable style={styles.primaryBtn} accessibilityRole="button">
                  <Text style={styles.primaryBtnLabel}>Scan cards</Text>
                </Pressable>
              </Link>
            </View>
          )}
        </ScrollView>
      )}
      {editing && (
        <EditBar
          canUndo={undos.length > 0}
          onUndo={undo}
          onDone={stopEditing}
          selected={selected.length}
          note={
            note ??
            (selected.length > 1
              ? `${selected.length} selected · hold one to drag them all`
              : 'Tap binders to select · hold one to reorder, merge or remove')
          }
        />
      )}
      <TrashBubble drag={trash} bottom={EDIT_BAR + 20} />
      {groupDrag && <DragGhost drag={trash} lines={ghost} label={ghostLabel} />}

      <SortMenu
        visible={sortOpen}
        top={insets.top + 64}
        options={BINDER_SORTS}
        value={sort}
        onSelect={setSort}
        onClose={() => setSortOpen(false)}
      />
      <QuickLook
        entries={(look?.ids ?? []).flatMap((x) => entryById.get(x) ?? [])}
        openId={look?.openId ?? null}
        title="Search"
        binders={binders}
        oldPrices={oldPrices}
        blurTarget={page}
        onClose={() => setLook(null)}
        onDetails={(entryId) => {
          if (look) lookToResume.current = { ...look, openId: entryId }
        }}
        onChanged={reload}
      />
      <BinderSheet visible={newOpen} onClose={() => setNewOpen(false)} />
      <BinderSheet
        visible={editOpen && one != null}
        binder={one}
        onClose={() => {
          setEditOpen(false)
          reload()
        }}
      />
      <RemoveBinderDialog
        binders={removing ? selected : []}
        cards={selected.reduce((sum, b) => sum + cardsIn(b.id), 0)}
        others={binders.filter((b) => !selectedIds.includes(b.id))}
        onRemove={doRemove}
        onClose={() => setRemoving(false)}
      />
      <MergeBindersDialog
        from={(merge?.from ?? []).flatMap((id) => byId(id) ?? [])}
        into={byId(merge?.into)}
        cards={(merge?.from ?? []).reduce((n, id) => n + cardsIn(id), 0)}
        onMerge={doMerge}
        onClose={() => setMerge(null)}
      />
    </BlurTargetView>
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
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(212,166,74,0.15), rgba(212,166,74,0))',
  },
  header: {
    gap: 18,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  actions: {
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
  disabled: {
    opacity: 0.4,
  },
  title: {
    fontSize: 42,
    lineHeight: 46,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  summary: {
    gap: 12,
  },
  shares: {
    height: 8,
    flexDirection: 'row',
    gap: 3,
  },
  share: {
    borderRadius: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },
  item: {
    width: '100%',
    gap: 10,
  },
  // Gold frame around a binder Edit and Remove act on.
  selected: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  itemText: {
    gap: 3,
  },
  name: {
    fontSize: 15,
    lineHeight: 19,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  nameSelected: {
    color: Colors.goldLight,
  },
  itemValue: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
  itemChange: {
    fontSize: 12,
    fontFamily: Fonts.bold,
  },
  count: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
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
