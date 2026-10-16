import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { PriceChart } from '@/components/card/price-chart'
import { Segmented } from '@/components/controls'
import { Colors, Fonts } from '@/constants/theme'
import type { CollectionEntry, Finish, PricePoint } from '@/db/collection'
import type { ScryfallCard } from '@/db/scryfall'
import { FINISH_LABEL, printingLabel } from '@/rules/printings'
import {
  formatPrice,
  priceOf,
  pricesWithin,
  type PriceSource,
  SHOW_HISTORY,
} from '@/utils/card-prices'
import { useMoney } from '@/utils/money'
import { getSettings } from '@/utils/settings'

// C2 · Card — Prices. Today's price comes from Scryfall; the chart, average, low and high come
// from the published daily prices (see remote-prices.ts) and the days saved on the
// phone. Listings have no free source yet, so those show "No data yet" (the user chose to keep
// the design's layout, minus the by-condition list).

const RANGES: { key: string; label: string; days: number | null; words: string }[] = [
  { key: '7D', label: '7D', days: 7, words: 'past 7 days' },
  { key: '1M', label: '1M', days: 30, words: 'past month' },
  { key: '3M', label: '3M', days: 91, words: 'past 3 months' },
  { key: '1Y', label: '1Y', days: 365, words: 'past year' },
  { key: 'All', label: 'All', days: null, words: 'since prices were first recorded' },
]

const NO_DATA = 'No data yet'

// `finish` is kept by the screen: its header thumbnail turns holographic for a foil finish.
export function PricesTab({
  card,
  history,
  copies,
  finish,
  onFinish,
}: {
  card: ScryfallCard
  history: PricePoint[]
  copies: CollectionEntry[]
  finish: Finish
  onFinish: (finish: Finish) => void
}) {
  const money = useMoney()
  const finishes = (card.finishes ?? ['nonfoil']) as Finish[]
  const [source, setSource] = useState<PriceSource>(() => getSettings().priceSource)
  const [range, setRange] = useState('3M')
  const shownFinish = finish
  const current = RANGES.find((r) => r.key === range)!
  const fmt = (v: number) => formatPrice(v, source, money)

  const now = priceOf(card, shownFinish, source)
  // Without the published prices set up (PRICES_URL), the chart stays empty.
  const points = SHOW_HISTORY ? pricesWithin(history, current.days, shownFinish, source) : []
  const values = points.map((p) => p.value)
  const enough = values.length >= 2
  // The day being read off the chart (dragging across it), or null for today.
  const [scrub, setScrub] = useState<number | null>(null)
  const held = scrub != null && scrub < points.length ? points[scrub] : null
  const first = values[0]
  // Up to the day on the chart, or the whole range.
  const diff = enough ? (held?.value ?? values[values.length - 1]) - first : 0
  const pct = enough && first ? (diff / first) * 100 : 0
  const avg = enough ? values.reduce((s, v) => s + v, 0) / values.length : null
  const lo = enough ? Math.min(...values) : null
  const hi = enough ? Math.max(...values) : null

  // Your copies of this printing, valued at today's Cardmarket price for their finish.
  const mine = copies.filter((c) => c.card_id === card.id)
  const worth = mine.reduce((sum, c) => sum + c.quantity * (priceOf(card, c.finish, 'cardmarket') ?? 0), 0)
  const paidCopies = mine.filter((c) => c.purchase_price != null)
  const paid = paidCopies.reduce((sum, c) => sum + c.quantity * (c.purchase_price ?? 0), 0)
  const paidWorth = paidCopies.reduce((sum, c) => sum + c.quantity * (priceOf(card, c.finish, 'cardmarket') ?? 0), 0)
  const gain = paidCopies.length ? paidWorth - paid : null

  const sourceName = source === 'cardmarket' ? 'Cardmarket trend' : 'TCGplayer market'

  return (
    <View style={styles.tab}>
      <View style={styles.switches}>
        <View style={styles.switch}>
          <Segmented
            label="Finish"
            small
            fill
            options={finishes.map((f) => ({ value: f, label: FINISH_LABEL[f] ?? f }))}
            value={shownFinish}
            onChange={onFinish}
          />
        </View>
        <View style={styles.switch}>
          <Segmented
            label="Price source"
            small
            fill
            options={[
              { value: 'cardmarket', label: 'Cardmarket' },
              { value: 'tcgplayer', label: 'TCGplayer' },
            ]}
            value={source}
            onChange={setSource}
          />
        </View>
      </View>

      <View style={styles.headline}>
        <View>
          <Text style={styles.label}>
            {held ? shortDate(held.date) : sourceName}
            {shownFinish !== 'nonfoil' ? ` · ${FINISH_LABEL[shownFinish].toLowerCase()}` : ''}
          </Text>
          <Text style={styles.now}>{held ? fmt(held.value) : now != null ? fmt(now) : 'No price'}</Text>
        </View>
        <View style={styles.changeBox}>
          {enough ? (
            <Text style={[styles.change, { color: diff >= 0 ? Colors.positive : Colors.negative }]}>
              {diff >= 0 ? '▲' : '▼'} {fmt(Math.abs(diff))} · {Math.abs(pct).toFixed(1)}%
            </Text>
          ) : (
            <Text style={styles.changeMuted}>{NO_DATA}</Text>
          )}
          <Text style={styles.rangeWords}>{held && points[0] ? `since ${shortDate(points[0].date)}` : current.words}</Text>
        </View>
      </View>

      <PriceChart
        values={values}
        format={fmt}
        onScrub={setScrub}
        label={enough ? `Price ${current.words}, from ${fmt(values[0])} to ${fmt(values[values.length - 1])}` : 'No price history yet'}
      />
      <View style={styles.axisRow}>
        <Text style={styles.axisText}>{points[0]?.date ? shortDate(points[0].date) : ''}</Text>
        <Text style={styles.axisText}>Today</Text>
      </View>

      <View style={styles.ranges} accessibilityRole="radiogroup" accessibilityLabel="Time range">
        {RANGES.map((r) => {
          const on = r.key === range
          return (
            <TouchableOpacity
              key={r.key}
              style={[styles.range, on && styles.rangeOn]}
              onPress={() => setRange(r.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
            >
              <Text style={[styles.rangeLabel, on && styles.rangeLabelOn]}>{r.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={styles.stats}>
        <Stat label="Cheapest listing" value={NO_DATA} muted />
        <Stat label="Average · range" value={avg != null ? fmt(avg) : NO_DATA} muted={avg == null} rule />
        <Stat label="Low · High" value={lo != null && hi != null ? `${fmt(lo)} · ${fmt(hi)}` : NO_DATA} muted={lo == null} top />
        <Stat label="Listings for sale" value={NO_DATA} muted top rule />
      </View>

      {mine.length > 0 && (
        <>
          <Text style={[styles.label, styles.sectionGap]}>Your {mine.length === 1 && mine[0].quantity === 1 ? 'copy' : 'copies'}</Text>
          <View style={styles.mine}>
            <View style={styles.mineText}>
              <Text style={styles.mineWorth}>Worth {money.eur(worth)}</Text>
              <Text style={styles.mineMeta}>
                {mine.map((c) => `${c.quantity} × ${printingLabel(card)} · ${c.condition}${c.purchase_price != null ? ` · paid ${money.eur(c.purchase_price)}` : ''}`).join('\n')}
              </Text>
            </View>
            {gain != null && (
              <View style={styles.mineGain}>
                <Text style={[styles.gain, { color: gain >= 0 ? Colors.positive : Colors.negative }]}>
                  {gain >= 0 ? '+' : '−'}{money.eur(Math.abs(gain))}
                </Text>
                {paid > 0 && (
                  <Text style={[styles.gainPct, { color: gain >= 0 ? Colors.positive : Colors.negative }]}>
                    {gain >= 0 ? '+' : '−'}{Math.abs((gain / paid) * 100).toFixed(0)}%
                  </Text>
                )}
              </View>
            )}
          </View>
        </>
      )}

      <Text style={styles.footnote}>
        Prices come from Scryfall and refresh daily: Cardmarket&apos;s trend price and TCGplayer&apos;s market price, shown in your currency
        (Settings).
        {mine.length > 0 && paidCopies.length === 0 ? ' Add what you paid for a copy (Printings tab) to see your gain.' : ''}
      </Text>
    </View>
  )
}

function Stat({ label, value, muted, top, rule }: { label: string; value: string; muted?: boolean; top?: boolean; rule?: boolean }) {
  return (
    <View style={[styles.stat, top && styles.statTop, rule && styles.statRule]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, muted && styles.statMuted]}>{value}</Text>
    </View>
  )
}

// "2026-07-14" -> "Jul 14"
function shortDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const styles = StyleSheet.create({
  tab: {
    paddingTop: 18,
  },
  switches: {
    flexDirection: 'row',
    gap: 8,
  },
  switch: {
    flex: 1,
  },
  headline: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  now: {
    marginTop: 4,
    fontSize: 36,
    fontFamily: Fonts.extraBold,
    letterSpacing: -0.6,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
  changeBox: {
    alignItems: 'flex-end',
    paddingBottom: 6,
  },
  change: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    fontVariant: ['tabular-nums'],
  },
  changeMuted: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.textMuted,
  },
  rangeWords: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  axisRow: {
    marginTop: 4,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  ranges: {
    flexDirection: 'row',
    gap: 6,
  },
  range: {
    flex: 1,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.12)',
  },
  rangeLabel: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Colors.textSecondary,
  },
  rangeLabelOn: {
    color: Colors.goldLight,
  },
  stats: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  stat: {
    width: '50%',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  statTop: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statRule: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  statValue: {
    marginTop: 3,
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  statMuted: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.textMuted,
  },
  sectionGap: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 2,
  },
  mine: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(127,199,166,0.28)',
    backgroundColor: 'rgba(127,199,166,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mineText: {
    flex: 1,
  },
  mineWorth: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  mineMeta: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  mineGain: {
    alignItems: 'flex-end',
  },
  gain: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    fontVariant: ['tabular-nums'],
  },
  gainPct: {
    marginTop: 3,
    fontSize: 13,
    fontFamily: Fonts.bold,
  },
  footnote: {
    marginTop: 14,
    marginHorizontal: 2,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
})
