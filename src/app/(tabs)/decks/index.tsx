import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeckRow, FolderCard } from '@/components/decks/deck-row';
import { useDeckSheets } from '@/components/decks/use-deck-sheets';
import { Colors, Fonts } from '@/constants/theme';
import { useDeckStore } from '@/utils/deck-store';

const NEW_FOLDER = 'new-folder'

// [a, b, c] -> [[a, b], [c]], for the 2-column folder grid.
function pairs<T>(items: T[]) {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return rows
}

// Decks: folders as a grid of cards, then the decks that aren't in a folder.
export default function DecksScreen() {
  const insets = useSafeAreaInsets()
  const { folders, decks } = useDeckStore()
  const [query, setQuery] = useState('')
  const deckSheets = useDeckSheets()

  const loose = decks.filter((d) => d.folderId == null)
  const q = query.trim().toLowerCase()
  // Pinned folders first, otherwise in creation order.
  const shownFolders = folders
    .filter((f) => !q || f.name.toLowerCase().includes(q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned))
  // While searching, decks inside folders match too.
  const shownDecks = q ? decks.filter((d) => d.name.toLowerCase().includes(q)) : loose
  const count = (folderId: string) => decks.filter((d) => d.folderId === folderId).length
  // Grid tiles: folder ids, then the "New folder" card (hidden while searching).
  const tiles = [...shownFolders.map((f) => f.id), ...(q ? [] : [NEW_FOLDER])]

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.glow} />
      {/* Header stays fixed; folders and decks scroll. */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Decks</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.select}
              onPress={() => router.push('/deck-organize')}
              accessibilityRole="button"
            >
              <Text style={styles.selectLabel}>Select</Text>
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
        </View>

        <View style={styles.summary} accessibilityLabel={`Value of all decks €0, ${decks.length} decks`}>
          <View>
            <Text style={styles.sectionLabel}>Value of all decks</Text>
            <Text style={styles.value}>€0</Text>
          </View>
          <View style={styles.counts}>
            <Text style={styles.deckCount}>{decks.length} {decks.length === 1 ? 'deck' : 'decks'}</Text>
            <Text style={styles.countDetail}>
              {folders.length} {folders.length === 1 ? 'folder' : 'folders'} · {loose.length} loose
            </Text>
          </View>
        </View>

        <View style={styles.search}>
          <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={20} tintColor={Colors.textSecondary} />
          <TextInput
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
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={[styles.sectionLabel, styles.sectionGap]}>Folders</Text>
        <View style={styles.grid}>
          {pairs(tiles).map((pair, i) => (
            <View key={i} style={styles.gridRow}>
              {pair.map((tile) => (
                <View key={tile} style={styles.cell}>
                  {tile === NEW_FOLDER ? (
                    <Pressable
                      style={styles.newFolder}
                      onPress={() => deckSheets.openNew({ kind: 'folder' })}
                      accessibilityRole="button"
                    >
                      <SymbolView name={{ ios: 'folder.badge.plus', android: 'create_new_folder' }} size={24} tintColor={Colors.goldLight} />
                      <Text style={styles.newFolderLabel}>New folder</Text>
                    </Pressable>
                  ) : (
                    <FolderCard
                      folder={shownFolders.find((f) => f.id === tile)!}
                      count={count(tile)}
                      onOpen={() => router.push({ pathname: '/decks/[folderId]', params: { folderId: tile } })}
                      onOptions={() => deckSheets.openFolderEdit(tile)}
                    />
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
          <DeckRow key={d.id} deck={d} last={i === shownDecks.length - 1} onOptions={() => deckSheets.openDeckOptions(d.id)} />
        ))}
        {shownDecks.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{q ? 'Nothing found' : decks.length === 0 ? 'No decks yet' : 'All decks are in folders'}</Text>
            <Text style={styles.emptyText}>
              {q ? 'Try a different deck or folder name.' : decks.length === 0 ? 'Tap + to build your first deck.' : 'New decks without a folder show up here.'}
            </Text>
          </View>
        )}
      </ScrollView>

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
  titleRow: {
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
  select: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.surface,
    justifyContent: 'center',
  },
  selectLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 96,
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
