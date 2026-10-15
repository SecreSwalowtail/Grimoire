import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterSheet } from '@/components/market/filter-sheet';
import { MarketRow, MarketTile } from '@/components/market/market-row';
import { DEFAULT_SORT, sortSummary, SortSheet, type MarketSort } from '@/components/market/sort-sheet';
import { Colors, Fonts } from '@/constants/theme';
import { autocomplete, searchCards, type ScryfallCard, type SearchOptions } from '@/db/scryfall';
import { timed } from '@/utils/perf';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  filterQuery,
  textQuery,
  trendingQuery,
  type FilterTab,
  type MarketFilters,
} from '@/utils/market-filters';

// Cards per row in grid view, same as the Binder.
const COLUMNS = 3

type ResultView = 'list' | 'grid'

// Suggestions show after typing pauses this long, from this many letters.
const SUGGEST_AFTER = 200
const SUGGEST_FROM = 2
const MAX_SUGGESTIONS = 8

// Filter edits apply as you go, but only once tapping pauses this long: each change is a new
// Scryfall search, and searches are limited to 2 a second.
const FILTER_DELAY = 400

// What to ask Scryfall: the trending list while the search box is empty and no filter is set
// (always by popularity, so the Sort setting only applies to searches), else the search box text
// and the filters in the chosen order. With filters alone, every card that matches them.
// `exact`: a name picked from the suggestions, searched as that exact card (fast, ~0.2 s).
function searchRequest(
  submitted: string,
  sort: MarketSort,
  exact: boolean,
  filters: MarketFilters,
): { query: string; options: SearchOptions } {
  const filtered = filterQuery(filters)
  if (!submitted && !filtered) return { query: trendingQuery(), options: { order: 'edhrec', dir: 'asc', unique: 'cards' } }
  const text = !submitted ? '' : exact ? `!"${submitted.replace(/"/g, '')}"` : textQuery(submitted)
  return {
    query: [text, filtered].filter(Boolean).join(' '),
    options: { order: sort.by, dir: sort.desc ? 'desc' : 'asc', unique: sort.groupPrintings ? 'cards' : 'prints' },
  }
}

// Market: trending cards, and search every card by text and filters. The price-source button does
// nothing yet.
export default function MarketScreen() {
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [exact, setExact] = useState(false)
  // Card names for what's being typed, tagged with the text they're for.
  const [suggestions, setSuggestions] = useState<{ key: string; names: string[] } | null>(null)
  const [focused, setFocused] = useState(false)
  const [sort, setSort] = useState<MarketSort>(DEFAULT_SORT)
  // `filters` is what the sheet shows; `searchFilters` what the search uses (FILTER_DELAY behind).
  const [filters, setFilters] = useState<MarketFilters>(DEFAULT_FILTERS)
  const [searchFilters, setSearchFilters] = useState<MarketFilters>(DEFAULT_FILTERS)
  const [view, setView] = useState<ResultView>('list')
  const [sortOpen, setSortOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterTab, setFilterTab] = useState<FilterTab>('format')
  // The last finished search, tagged with the request it answered: while the search box or sort
  // has moved on from it, a new search is loading.
  const [search, setSearch] = useState<{ key: string; cards: ScryfallCard[]; total: number | null; error: string | null } | null>(null)
  const filtering = filterQuery(searchFilters) !== ''
  const trending = submitted === '' && !filtering
  const searchKey = JSON.stringify(searchRequest(submitted, sort, exact, searchFilters))

  useEffect(() => {
    if (filters === searchFilters) return
    const timer = setTimeout(() => setSearchFilters(filters), FILTER_DELAY)
    return () => clearTimeout(timer)
  }, [filters, searchFilters])

  const closeFilters = () => {
    setFiltersOpen(false)
    setSearchFilters(filters)
  }

  // Keyed on the serialized request, so it only re-runs when the request really changes.
  useEffect(() => {
    let cancelled = false
    const { query, options } = JSON.parse(searchKey) as ReturnType<typeof searchRequest>
    const label = query === trendingQuery() ? 'market: trending' : 'market: search'
    timed(label, () => searchCards(query, options), (r) => `${r.data.length} cards`)
      .then((result) => {
        if (!cancelled) setSearch({ key: searchKey, cards: result.data, total: result.total_cards, error: null })
      })
      .catch((e) => {
        if (cancelled) return
        console.warn('Market search failed', e)
        setSearch({ key: searchKey, cards: [], total: null, error: e instanceof Error ? e.message : 'Search failed' })
      })
    return () => {
      cancelled = true
    }
  }, [searchKey])

  // While typing something new, suggest card names (a full search only runs on Enter: Scryfall
  // takes 1-3 s for a search it hasn't seen lately).
  const typed = text.trim()
  const suggesting = focused && typed.length >= SUGGEST_FROM && typed !== submitted
  useEffect(() => {
    if (!suggesting) return
    const timer = setTimeout(() => {
      autocomplete(typed)
        .then((names) => setSuggestions({ key: typed, names }))
        .catch(() => setSuggestions({ key: typed, names: [] }))
    }, SUGGEST_AFTER)
    return () => clearTimeout(timer)
  }, [typed, suggesting])

  const searchAll = () => {
    setExact(false)
    setSubmitted(typed)
  }
  const pickName = (name: string) => {
    Keyboard.dismiss()
    setText(name)
    setExact(true)
    setSubmitted(name)
  }

  const loading = search?.key !== searchKey
  const results = !loading ? search?.cards ?? [] : []
  const total = !loading ? search?.total ?? null : null
  const error = !loading ? search?.error ?? null : null

  const filterCount = activeFilterCount(filters)
  const resultSuffix = [
    searchFilters.languages.length > 0 ? searchFilters.languages.map((l) => l.toUpperCase()).join(', ') : null,
    sort.groupPrintings ? 'grouped' : null,
  ].filter(Boolean)

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Market</Text>
        <TouchableOpacity style={styles.source} accessibilityRole="button" accessibilityLabel="Price source: Cardmarket, euro">
          <Text style={styles.sourceLabel}>Cardmarket · €</Text>
          <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} size={14} tintColor={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.search, focused && styles.searchFocused]}>
        <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={20} tintColor={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={text}
          onChangeText={(value) => {
            setText(value)
            // Clearing the box goes back to the trending list.
            if (!value.trim()) setSubmitted('')
          }}
          onSubmitEditing={searchAll}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Name, type or rules text"
          placeholderTextColor={Colors.textMuted}
          accessibilityLabel="Search cards"
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.filters}
          onPress={() => setFiltersOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} active` : 'Filters'}
        >
          <SymbolView name={{ ios: 'slider.horizontal.3', android: 'tune' }} size={20} tintColor={Colors.onGold} />
          <Text style={styles.filtersLabel}>Filters</Text>
          {filterCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeLabel}>{filterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.sort}
          onPress={() => setSortOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort, ${sortSummary(sort)}`}
        >
          <SymbolView name={{ ios: 'arrow.up.arrow.down', android: 'swap_vert' }} size={20} tintColor={Colors.goldLight} />
          <View style={styles.sortText}>
            <Text style={styles.sortLabel}>Sort</Text>
            <Text style={styles.sortValue} numberOfLines={1}>{sortSummary(sort)}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.resultRow}>
        <Text style={styles.resultText} numberOfLines={1}>
          {loading ? (
            trending ? 'Loading trending cards…' : 'Searching…'
          ) : trending && !error ? (
            <>
              <Text style={styles.resultCount}>Trending</Text> · most played new cards
            </>
          ) : total != null ? (
            <>
              <Text style={styles.resultCount}>{total.toLocaleString('en-US')} {total === 1 ? 'card' : 'cards'}</Text>
              {resultSuffix.map((part) => ` · ${part}`).join('')}
            </>
          ) : null}
        </Text>
        <View style={styles.viewToggle} accessibilityRole="radiogroup" accessibilityLabel="View">
          {(['list', 'grid'] as const).map((v) => (
            <Pressable
              key={v}
              style={[styles.viewButton, view === v && styles.viewButtonSelected]}
              onPress={() => setView(v)}
              accessibilityRole="radio"
              accessibilityLabel={v === 'list' ? 'List view' : 'Grid view'}
              accessibilityState={{ checked: view === v }}
            >
              <SymbolView
                name={v === 'list' ? { ios: 'list.bullet', android: 'view_list' } : { ios: 'square.grid.2x2', android: 'grid_view' }}
                size={17}
                tintColor={view === v ? Colors.text : Colors.textMuted}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  )

  const empty = loading ? (
    <ActivityIndicator style={styles.spinner} color={Colors.gold} />
  ) : error ? (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{trending ? "Couldn't load trending cards" : 'Search failed'}</Text>
      <Text style={styles.emptyText}>{error}</Text>
    </View>
  ) : (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{trending ? 'Search every card' : 'No cards found'}</Text>
      <Text style={styles.emptyText}>
        {trending
          ? 'Find any Magic card by name, type, rules text or collector number, like "MH3 293".'
          : filtering
            ? 'Try loosening the filters, or a different name, number, type or rules text.'
            : 'Try a different name, number, type or rules text.'}
      </Text>
    </View>
  )

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.glow} />
      {/* Header stays fixed; only the results scroll. */}
      <View style={{ paddingTop: insets.top + 8 }}>{header}</View>
      {suggesting ? (
        <ScrollView contentContainerStyle={styles.suggestContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {(suggestions?.names ?? []).slice(0, MAX_SUGGESTIONS).map((name) => (
            <TouchableOpacity key={name} style={styles.suggestion} onPress={() => pickName(name)} accessibilityRole="button">
              <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={16} tintColor={Colors.textMuted} />
              <Text style={styles.suggestionText} numberOfLines={1}>{name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.searchAll} onPress={searchAll} accessibilityRole="button">
            <Text style={styles.searchAllTitle} numberOfLines={1}>Search all cards for “{typed}”</Text>
            <Text style={styles.searchAllText}>Names, types, rules text and collector numbers</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : view === 'list' ? (
        <FlatList
          key="list"
          data={loading ? [] : results}
          keyExtractor={(card) => card.id}
          renderItem={({ item }) => <MarketRow card={item} />}
          ListEmptyComponent={empty}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      ) : (
        <FlatList<ScryfallCard | null>
          key="grid"
          // Empty slots fill the last row, so its cards keep the same width instead of stretching.
          data={loading ? [] : [...results, ...Array<null>((COLUMNS - (results.length % COLUMNS)) % COLUMNS).fill(null)]}
          keyExtractor={(card, i) => (card ? card.id : `spacer-${i}`)}
          numColumns={COLUMNS}
          renderItem={({ item }) => (item ? <MarketTile card={item} /> : <View style={{ flex: 1 }} />)}
          ListEmptyComponent={empty}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}

      <SortSheet visible={sortOpen} value={sort} onApply={setSort} onClose={() => setSortOpen(false)} />
      <FilterSheet
        visible={filtersOpen}
        tab={filterTab}
        onTabChange={setFilterTab}
        filters={filters}
        onChange={setFilters}
        // Only a count for the filters on show: none while a change waits to be searched.
        resultCount={filters === searchFilters ? total : null}
        onClose={closeFilters}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  suggestContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
  },
  suggestion: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(237,230,214,0.07)',
  },
  suggestionText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
  searchAll: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.35)',
    backgroundColor: 'rgba(212,166,74,0.06)',
  },
  searchAllTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  searchAllText: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  glow: {
    position: 'absolute',
    left: 60,
    top: -220,
    width: 520,
    height: 420,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(212,166,74,0.12), rgba(212,166,74,0))',
  },
  header: {
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 6,
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
  source: {
    height: 40,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  search: {
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchFocused: {
    borderColor: 'rgba(212,166,74,0.35)',
    boxShadow: '0 0 0 4px rgba(212,166,74,0.06)',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  filters: {
    flex: 1,
    height: 52,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 16,
    backgroundColor: Colors.gold,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    boxShadow: '0 8px 22px rgba(212,166,74,0.18)',
  },
  filtersLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
  badge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 13,
    backgroundColor: Colors.onGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  sort: {
    flex: 1,
    height: 52,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.14)',
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  sortText: {
    flex: 1,
    minWidth: 0,
  },
  sortLabel: {
    fontSize: 15,
    lineHeight: 18,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  sortValue: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  resultText: {
    flexShrink: 1,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  resultCount: {
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  viewToggle: {
    padding: 3,
    gap: 4,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
  },
  viewButton: {
    width: 36,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewButtonSelected: {
    backgroundColor: Colors.selected,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  gridContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  gridRow: {
    gap: 10,
    marginBottom: 18,
  },
  spinner: {
    marginTop: 48,
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
})
