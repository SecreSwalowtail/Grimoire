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
import { SearchField, SortButton, ValueSummary } from '@/components/binder/parts'
import { QuickLook } from '@/components/binder/quick-look'
import { ReorderGrid } from '@/components/binder/reorder-grid'
import { summarize, useCollection } from '@/components/binder/use-collection'
import { Icon } from '@/components/icon'
import { SortMenu } from '@/components/sort-menu'
import { Colors, Fonts } from '@/constants/theme'
import { deleteBinder, mergeBinders, reorderBinders, type Binder } from '@/db/binders'
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
// Hold a binder to edit: sort and + make way for Edit, Remove and Done, and the held binder is
// selected (tap another to pick it instead). Keep holding to drag it: drop it in another place to
// reorder, or on the middle of another binder to merge the two.
export default function BindersScreen() {
  const money = useMoney()
  const db = useSQLiteContext()
  const insets = useSafeAreaInsets()
  // Two columns between 20 px margins; the binder drawing scales to fit.
  const cellWidth = (useWindowDimensions().width - 40 - COLUMN_GAP) / 2
  const coverScale = cellWidth / COVER_BOX.width
  const { binders, entries, weekAgo, loaded, reload } = useCollection()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<BinderSort>('custom')
  const [sortOpen, setSortOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // No scrolling while a binder is being dragged.
  const [dragging, setDragging] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [merge, setMerge] = useState<{ from: string; into: string } | null>(null)
  // The quick look over search results (tap a card): the cards it goes through and the one tapped.
  const [look, setLook] = useState<{ ids: number[]; openId: number } | null>(null)
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
  }
  // Android's back button leaves edit mode first.
  useFocusEffect(
    useCallback(() => {
      if (!editing) return
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setEditing(false)
        setSelectedIds([])
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
  const total = summarize(entries, weekAgo)
  const rows: Row[] = binders.map((binder) => ({ id: binder.id, binder, ...summarize(byBinder.get(binder.id) ?? [], weekAgo) }))
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
  const toggle = (id: string) =>
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])

  const run = (work: Promise<unknown>) => work.then(reload).catch((e) => console.warn('Binder change failed', e))
  const doMerge = () => {
    if (!merge) return
    const { from, into } = merge
    setMerge(null)
    forgetScanBinder(from)
    setSelectedIds(selectedIds.filter((x) => x !== from))
    run(mergeBinders(db, from, into))
  }
  const doRemove = (moveTo: string | null) => {
    const ids = selected.map((b) => b.id)
    setRemoving(false)
    setSelectedIds([])
    ids.forEach(forgetScanBinder)
    run(
      (async () => {
        for (const id of ids) await deleteBinder(db, id, moveTo)
      })(),
    )
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
          <View style={styles.itemValueRow}>
            <Text style={styles.itemValue}>{money.eur(value)}</Text>
            {change != null && (
              <Text style={[styles.itemChange, { color: change >= 0 ? Colors.positive : Colors.negative }]}>
                {change >= 0 ? '▲' : '▼'} {money.eur(Math.abs(change))}
              </Text>
            )}
          </View>
          <Text style={styles.count}>{plural(cards, 'card')}</Text>
        </View>
      </Pressable>
    )
  }

  // At least one binder stays: copies always need somewhere to go.
  const canRemove = selected.length > 0 && selected.length < binders.length
  const selectionLabel = selected.length === 1 ? selected[0].name : `${selected.length} binders`

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
              <TouchableOpacity
                style={[styles.iconBtn, styles.removeBtn, !canRemove && styles.disabled]}
                onPress={() => setRemoving(true)}
                disabled={!canRemove}
                accessibilityRole="button"
                accessibilityLabel={selected.length ? `Remove ${selectionLabel}` : 'Remove binder'}
              >
                <Icon name={{ ios: 'trash', android: 'delete' }} size={20} tintColor={Colors.danger} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.done} onPress={stopEditing} accessibilityRole="button">
                <Text style={styles.doneLabel}>Done</Text>
              </TouchableOpacity>
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
              {rows.map((r) =>
                r.value > 0 ? (
                  <View key={r.id} style={[styles.share, { flex: r.value, backgroundColor: r.binder.color }]} />
                ) : null,
              )}
            </View>
          )}
        </View>

        {editing ? (
          <View style={styles.hint}>
            <Icon name={{ ios: 'hand.draw', android: 'drag_pan' }} size={18} tintColor={Colors.textSecondary} />
            <Text style={styles.hintText}>
              {selected.length > 1 ? `${selected.length} selected · ` : 'Tap to select · '}hold & drag to reorder or merge
            </Text>
          </View>
        ) : (
          <SearchField value={query} onChange={setQuery} placeholder="Search all binders" />
        )}
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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} scrollEnabled={!dragging}>
          <ReorderGrid
            items={sorted}
            columns={2}
            cellWidth={cellWidth}
            cellHeight={cellHeight}
            columnGap={COLUMN_GAP}
            rowGap={ROW_GAP}
            renderItem={binderItem}
            onReorder={(ids) => run(reorderBinders(db, ids))}
            onMerge={(from, into) => setMerge({ from, into })}
            onHold={(id) => {
              // Holding starts editing with that binder picked; while editing it only drags.
              if (editing) return
              setEditing(true)
              setSelectedIds([id])
            }}
            onDragChange={setDragging}
            glow={frame}
          />

          {loaded && entries.length === 0 && !editing && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Your binders are empty</Text>
              <Text style={styles.emptyText}>Scan your cards or import a collection to start.</Text>
              <Link href="/scan" asChild>
                <Pressable style={styles.primaryBtn} accessibilityRole="button">
                  <Text style={styles.primaryBtnLabel}>Scan cards</Text>
                </Pressable>
              </Link>
            </View>
          )}
        </ScrollView>
      )}

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
        collection={entries}
        weekAgo={weekAgo}
        blurTarget={page}
        onClose={() => setLook(null)}
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
        from={byId(merge?.from)}
        into={byId(merge?.into)}
        cards={cardsIn(merge?.from)}
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
  removeBtn: {
    borderColor: 'rgba(238,132,102,0.35)',
    backgroundColor: 'rgba(181,65,42,0.16)',
  },
  disabled: {
    opacity: 0.4,
  },
  done: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
  },
  doneLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
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
  hint: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(237,230,214,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.textSecondary,
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
  itemValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
