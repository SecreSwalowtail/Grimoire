import { Image } from 'expo-image'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import { entryPrice, type CollectionEntry } from '@/db/collection'
import { cardThumb, type ScryfallCard } from '@/db/scryfall'
import { conditionName, FINISH_NAME, LANGUAGE_NAMES } from '@/rules/collection'
import { finishesText, printingLabel } from '@/rules/printings'
import { cardEuros } from '@/utils/card-prices'
import { useMoney } from '@/utils/money'

// C3 · Card — Printings & your copies. Tapping a printing shows it on every tab; tapping one of
// your copies edits it.

const FIRST = 6
type Filter = 'all' | 'owned' | 'cheap'

type PrintingsData = { list: ScryfallCard[]; total: number; more: boolean }

const eur = (value: string | null) => (value == null ? null : Number(value))

// "Sep 2022"
const monthYear = (date?: string) =>
  date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null

export function PrintingsTab({
  card,
  printings,
  loadMore,
  loadingMore,
  copies,
  onPick,
  onEditCopy,
  onAddCopy,
}: {
  card: ScryfallCard
  printings: PrintingsData | null
  loadMore: () => void
  loadingMore: boolean
  copies: CollectionEntry[]
  onPick: (printing: ScryfallCard) => void
  onEditCopy: (entry: CollectionEntry) => void
  onAddCopy: () => void
}) {
  const money = useMoney()
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState(false)
  const all = printings?.list ?? []
  const ownedCount = (id: string) => copies.filter((c) => c.card_id === id).reduce((n, c) => n + c.quantity, 0)
  const total = copies.reduce((sum, c) => sum + (entryPrice(c) ?? 0) * c.quantity, 0)

  let list = all
  if (filter === 'owned') list = all.filter((p) => ownedCount(p.id) > 0)
  if (filter === 'cheap') {
    const price = (p: ScryfallCard) => cardEuros(p) ?? Infinity
    list = [...all].sort((a, b) => price(a) - price(b))
  }
  const shown = expanded || filter === 'owned' ? list : list.slice(0, FIRST)
  const hidden = list.length - shown.length

  return (
    <View style={styles.tab}>
      <View style={styles.sectionHead}>
        <Text style={styles.label}>Your copies</Text>
        {copies.length > 0 && <Text style={styles.total}>{money.eur(total)} total</Text>}
      </View>
      {copies.map((entry) => {
        const printing = all.find((p) => p.id === entry.card_id)
        const price = entryPrice(entry)
        return (
          <TouchableOpacity
            key={entry.id}
            style={styles.copy}
            onPress={() => onEditCopy(entry)}
            accessibilityRole="button"
            accessibilityHint="Edit this copy"
          >
            <View style={styles.qty}>
              <Text style={styles.qtyLabel}>×{entry.quantity}</Text>
            </View>
            <View style={styles.copyText}>
              <Text style={styles.copyTitle} numberOfLines={1}>
                {printing ? printingLabel(printing) : 'Printing'} · {entry.set_code.toUpperCase()} #{entry.collector_number}
              </Text>
              <Text style={styles.copyMeta} numberOfLines={1}>
                {conditionName(entry.condition)} · {LANGUAGE_NAMES[entry.language] ?? entry.language.toUpperCase()} · {FINISH_NAME[entry.finish]}
                {entry.for_trade ? ' · for trade' : ''}
              </Text>
            </View>
            <Text style={styles.copyPrice}>{price != null ? money.eur(price * entry.quantity) : '—'}</Text>
            <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={16} tintColor={Colors.textMuted} />
          </TouchableOpacity>
        )
      })}
      <TouchableOpacity style={styles.addCopy} onPress={onAddCopy} accessibilityRole="button">
        <Icon name={{ ios: 'plus', android: 'add' }} size={16} tintColor={Colors.goldLight} weight="bold" />
        <Text style={styles.addCopyLabel}>Add to binder</Text>
      </TouchableOpacity>

      <Text style={[styles.label, styles.printsLabel]}>All printings</Text>
      <View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel="Show printings">
        {(
          [
            ['all', printings ? `All ${printings.total}` : 'All'],
            ['owned', 'Owned'],
            ['cheap', 'Cheapest first'],
          ] as [Filter, string][]
        ).map(([key, label]) => {
          const on = filter === key
          return (
            <Pressable
              key={key}
              style={[styles.filter, on && styles.filterOn]}
              onPress={() => setFilter(key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
            >
              <Text style={[styles.filterLabel, on && styles.filterLabelOn]}>{label}</Text>
            </Pressable>
          )
        })}
      </View>

      {printings == null ? (
        <ActivityIndicator style={styles.loading} color={Colors.gold} />
      ) : (
        <View style={styles.prints}>
          {shown.map((p) => {
            const on = p.id === card.id
            const owned = ownedCount(p.id)
            const price = eur(p.prices.eur)
            const foil = eur(p.prices.eur_foil)
            const foilOnly = !(p.finishes ?? []).includes('nonfoil')
            // Cardmarket's, else TCGplayer's (see cardEuros).
            const main = price ?? foil ?? cardEuros(p)
            return (
              <Pressable
                key={p.id}
                style={[styles.print, on && styles.printOn]}
                onPress={() => onPick(p)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${printingLabel(p)}, ${p.set_name} number ${p.collector_number}${owned ? `, you own ${owned}` : ''}`}
              >
                <Image source={{ uri: cardThumb(p) ?? undefined }} style={styles.printThumb} contentFit="cover" />
                <View style={styles.printText}>
                  <View style={styles.printTitleRow}>
                    <Text style={styles.printTitle} numberOfLines={1}>{printingLabel(p)}</Text>
                    {owned > 0 && (
                      <View style={styles.owned}>
                        <Text style={styles.ownedLabel}>Owned ×{owned}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.printMeta} numberOfLines={1}>
                    {[p.set_name, `#${p.collector_number}`, monthYear(p.released_at)].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={styles.printFinishes}>{finishesText(p.finishes)}</Text>
                </View>
                <View style={styles.printPrice}>
                  <Text style={styles.printPriceValue}>{main != null ? money.eur(main) : '—'}</Text>
                  <Text style={styles.printPriceNote}>
                    {foilOnly ? 'foil only' : foil != null ? `foil ${money.eur(foil)}` : main == null ? 'no price' : ''}
                  </Text>
                </View>
              </Pressable>
            )
          })}
          {shown.length === 0 && <Text style={styles.none}>You don&apos;t own any printing of this card yet.</Text>}
          {hidden > 0 ? (
            <TouchableOpacity style={styles.more} onPress={() => setExpanded(true)} accessibilityRole="button">
              <Text style={styles.moreLabel}>Show {hidden} more {hidden === 1 ? 'printing' : 'printings'}</Text>
            </TouchableOpacity>
          ) : (
            filter !== 'owned' &&
            printings.more && (
              <TouchableOpacity style={styles.more} onPress={loadMore} disabled={loadingMore} accessibilityRole="button">
                {loadingMore ? (
                  <ActivityIndicator color={Colors.gold} />
                ) : (
                  <Text style={styles.moreLabel}>Load {Math.min(printings.total - all.length, 175)} more printings</Text>
                )}
              </TouchableOpacity>
            )
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  tab: {
    paddingTop: 20,
  },
  sectionHead: {
    marginBottom: 8,
    marginLeft: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  total: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  copy: {
    minHeight: 72,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.30)',
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qty: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(212,166,74,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  copyText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  copyTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  copyMeta: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  copyPrice: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
  addCopy: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(212,166,74,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addCopyLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  printsLabel: {
    marginTop: 22,
    marginBottom: 10,
    marginLeft: 2,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filter: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    justifyContent: 'center',
  },
  filterOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.12)',
  },
  filterLabel: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: '#CFC7B4',
  },
  filterLabelOn: {
    color: Colors.goldLight,
  },
  loading: {
    marginTop: 24,
  },
  prints: {
    marginTop: 12,
    gap: 8,
  },
  print: {
    minHeight: 84,
    paddingVertical: 11,
    paddingLeft: 11,
    paddingRight: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  printOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.07)',
  },
  printThumb: {
    width: 44,
    height: 62,
    borderRadius: 5,
    backgroundColor: Colors.background,
    boxShadow: '0 0 0 1px rgba(237,230,214,0.16)',
  },
  printText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  printTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  printTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  owned: {
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 6,
    backgroundColor: 'rgba(212,166,74,0.16)',
    justifyContent: 'center',
  },
  ownedLabel: {
    fontSize: 11,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  printMeta: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  printFinishes: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: '#CFC7B4',
  },
  printPrice: {
    alignItems: 'flex-end',
    gap: 3,
  },
  printPriceValue: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
  printPriceNote: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  none: {
    marginTop: 4,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  more: {
    marginTop: 2,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
})
