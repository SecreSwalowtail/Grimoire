import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

import { Segmented, SectionLabel } from '@/components/controls'
import { ManaSymbol } from '@/components/mana-symbol'
import { Colors, Fonts } from '@/constants/theme'
import {
  COLOR_HEX,
  COLOR_NAME,
  manaCostStats,
  manaValueStats,
  productionStats,
  subtypeStats,
  typeStats,
  WUBRG,
  type Color,
  type DeckLine,
  type SubtypeTab,
} from '@/rules/deck-stats'

type Tab = 'mv' | 'cost' | 'prod' | 'types' | 'sub'
const TABS: { value: Tab; label: string }[] = [
  { value: 'mv', label: 'Mana value' },
  { value: 'cost', label: 'Mana cost' },
  { value: 'prod', label: 'Mana production' },
  { value: 'types', label: 'Card types' },
  { value: 'sub', label: 'Subtypes' },
]
const CREATURE = '#D4A64A'
const WAFFLE_GAP = 4
const OTHER = '#6F93BA'

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)
// "Sol Ring, Arcane Signet, +5 more".
function names(lines: DeckLine[], max = 4) {
  const list = [...new Set(lines.map((l) => l.name))]
  return list.length > max ? `${list.slice(0, max).join(', ')}, +${list.length - max} more` : list.join(', ')
}

// D4–D8 · The main deck's numbers, one view at a time: mana value, mana cost, mana production,
// card types and subtypes.
export function StatsTab({ lines }: { lines: DeckLine[] }) {
  const [tab, setTab] = useState<Tab>('mv')
  const main = lines.filter((l) => l.board === 'main')

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = t.value === tab
          return (
            <Pressable
              key={t.value}
              style={[styles.tab, on && styles.tabOn]}
              onPress={() => setTab(t.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{t.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {main.length === 0 ? (
        <Text style={styles.empty}>Add cards to the main deck to see its stats.</Text>
      ) : tab === 'mv' ? (
        <ManaValue lines={main} />
      ) : tab === 'cost' ? (
        <ManaCost lines={main} />
      ) : tab === 'prod' ? (
        <Production lines={main} />
      ) : tab === 'types' ? (
        <Types lines={main} />
      ) : (
        <Subtypes lines={main} />
      )}
    </View>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>
}

function Figures({ items }: { items: { value: string; label: string; gold?: boolean }[] }) {
  return (
    <View style={styles.figures}>
      {items.map((f, i) => (
        <View key={f.label} style={[styles.figure, i > 0 && styles.figureRule]}>
          <Text style={[styles.figureValue, f.gold && styles.gold]}>{f.value}</Text>
          <Text style={styles.figureLabel}>{f.label}</Text>
        </View>
      ))}
    </View>
  )
}

function Legend({ items }: { items: { color: string; label: string; outline?: boolean }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((i) => (
        <View key={i.label} style={styles.legendItem}>
          <View style={[styles.legendSwatch, i.outline ? { borderWidth: 1.5, borderColor: i.color } : { backgroundColor: i.color }]} />
          <Text style={styles.legendLabel}>{i.label}</Text>
        </View>
      ))}
    </View>
  )
}

function CardHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.cardHead}>
      <SectionLabel>{title}</SectionLabel>
      {right}
    </View>
  )
}

// ---- Mana value ----

const CURVE_HEIGHT = 150

function ManaValue({ lines }: { lines: DeckLine[] }) {
  const s = manaValueStats(lines)
  const [sel, setSel] = useState<number | null>(null)
  const max = Math.max(1, ...s.curve.map((c) => c.creatures + c.other))
  // The busiest mana value is picked to start with.
  const picked = sel ?? s.curve.reduce((best, c) => (c.creatures + c.other > best.creatures + best.other ? c : best), s.curve[0]).mv
  const cur = s.curve[picked]
  const label = picked === 7 ? '7+' : String(picked)

  return (
    <View style={styles.section}>
      <Figures
        items={[
          { value: s.average != null ? s.average.toFixed(2) : '—', label: 'Average MV', gold: true },
          { value: s.median != null ? String(s.median) : '—', label: 'Median' },
          { value: String(s.spells), label: 'Non-land cards' },
        ]}
      />
      <Card>
        <CardHead title="Mana curve" right={<Legend items={[{ color: CREATURE, label: 'Creatures' }, { color: OTHER, label: 'Other' }]} />} />
        <View
          style={styles.curve}
          accessible
          accessibilityLabel={`Mana curve: ${s.curve.map((c) => `${c.mv === 7 ? '7+' : c.mv}: ${c.creatures + c.other}`).join(', ')}`}
        >
          {s.curve.map((c) => {
            const on = c.mv === picked
            const total = c.creatures + c.other
            return (
              <Pressable
                key={c.mv}
                style={[styles.bar, !on && styles.dim]}
                onPress={() => setSel(c.mv)}
                accessibilityRole="button"
                accessibilityLabel={`Mana value ${c.mv === 7 ? '7 or more' : c.mv}: ${total} cards, ${c.creatures} creatures`}
              >
                <Text style={[styles.barNum, on && styles.gold]}>{total}</Text>
                {c.other > 0 && <View style={[styles.barPart, { height: (c.other / max) * CURVE_HEIGHT, backgroundColor: OTHER }, styles.barTop]} />}
                {c.creatures > 0 && (
                  <View
                    style={[styles.barPart, { height: (c.creatures / max) * CURVE_HEIGHT, backgroundColor: CREATURE }, c.other === 0 && styles.barTop]}
                  />
                )}
              </Pressable>
            )
          })}
        </View>
        <View style={styles.curveLabels}>
          {s.curve.map((c) => (
            <Text key={c.mv} style={[styles.curveLabel, c.mv === picked && styles.gold]}>{c.mv === 7 ? '7+' : c.mv}</Text>
          ))}
        </View>
      </Card>
      <View style={styles.callout}>
        <View style={styles.calloutHead}>
          <Text style={styles.calloutTitle}>Mana value {label} · {cur.creatures + cur.other} cards</Text>
          <Text style={styles.calloutMeta}>{cur.creatures} creatures · {cur.other} other</Text>
        </View>
        <Text style={styles.calloutText}>{cur.lines.length ? names(cur.lines, 5) : 'No cards at this mana value.'}</Text>
      </View>
    </View>
  )
}

// ---- Mana cost ----

const RING = 128
const STROKE = 20

function Donut({ parts, children }: { parts: { color: string; n: number }[]; children: React.ReactNode }) {
  const r = (RING - STROKE) / 2
  const circ = 2 * Math.PI * r
  const total = parts.reduce((n, p) => n + p.n, 0)
  const gap = parts.length > 1 ? 2 : 0
  let at = 0
  return (
    <View style={styles.donut}>
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke="rgba(237,230,214,0.06)" strokeWidth={STROKE} fill="none" />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (p.n / total) * circ
            const dash = Math.max(len - gap, 0)
            const el = (
              <Circle
                key={i}
                cx={RING / 2}
                cy={RING / 2}
                r={r}
                stroke={p.color}
                strokeWidth={STROKE}
                fill="none"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-at}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            )
            at += len
            return el
          })}
      </Svg>
      {children}
    </View>
  )
}

function ManaCost({ lines }: { lines: DeckLine[] }) {
  const s = manaCostStats(lines)
  const used = WUBRG.filter((c) => s.colored[c] > 0)
  const maxColor = Math.max(1, ...s.byColor.map((b) => b.n))
  const total = Math.round(s.totalColored)

  return (
    <View style={styles.section}>
      <Card style={styles.donutCard}>
        <Donut parts={used.map((c) => ({ color: COLOR_HEX[c], n: s.colored[c] }))}>
          {/* The hole is small: the text grows only a little with the font size. */}
          <Text style={styles.donutValue} maxFontSizeMultiplier={1.2}>{total}</Text>
          <Text style={styles.donutLabel} maxFontSizeMultiplier={1.2}>colored pips</Text>
        </Donut>
        <View style={styles.donutLegend}>
          {used.length === 0 && <Text style={styles.calloutText}>No colored mana in the costs.</Text>}
          {used.map((c) => (
            <View key={c}>
              <View style={styles.colorTitle}>
                <ManaSymbol symbol={c} size={14} />
                <Text style={styles.colorName}>{COLOR_NAME[c]}</Text>
              </View>
              <Text style={styles.small}>
                <Text style={styles.strong}>{Math.round(s.colored[c])}</Text> pips · {pct(s.colored[c], s.totalColored)}%
              </Text>
            </View>
          ))}
          <Text style={styles.muted}>
            Generic mana: {s.generic}
            {s.spellCount ? ` · avg ${(s.totalColored / s.spellCount).toFixed(2)} pips per spell` : ''}
          </Text>
        </View>
      </Card>

      <Card>
        <CardHead title="Spells by color" />
        <View style={styles.rows}>
          {s.byColor.map((b) => (
            <View key={b.key} style={styles.barRow}>
              <View style={styles.barRowLabel}>
                {b.key === 'M' ? <View style={styles.multiDot} /> : <ManaSymbol symbol={b.key} size={14} />}
                <Text style={styles.rowLabel} numberOfLines={1}>{b.label}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(b.n / maxColor) * 100}%`, backgroundColor: b.key === 'M' ? Colors.gold : COLOR_HEX[b.key] }]} />
              </View>
              <Text style={styles.rowValue}>{b.n}</Text>
            </View>
          ))}
        </View>
      </Card>

      {s.heaviest.length > 0 && (
        <Card>
          <CardHead title="Heaviest color needs" />
          {s.heaviest.map((h, i) => (
            <View key={h.sig} style={[styles.heavy, i > 0 && styles.rule]}>
              <View style={styles.heavyPips} accessible accessibilityLabel={`Needs ${h.sig.split('').map((c) => COLOR_NAME[c as Color].toLowerCase()).join(' ')}`}>
                {h.sig.split('').map((c, k) => (
                  <ManaSymbol key={k} symbol={c} size={18} />
                ))}
              </View>
              <Text style={styles.heavyCards} numberOfLines={2}>{names(h.lines, 3)}</Text>
              <Text style={styles.heavyN}>{h.n}</Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  )
}

// ---- Mana production ----

function Production({ lines }: { lines: DeckLine[] }) {
  const s = productionStats(lines)
  const cost = manaCostStats(lines)
  const colors = WUBRG.filter((c) => cost.colored[c] > 0 || s.make[c] > 0)
  const madeColored = WUBRG.reduce((n, c) => n + s.make[c], 0)
  const rows = colors.map((c) => {
    const need = pct(cost.colored[c], cost.totalColored)
    const make = pct(s.make[c], madeColored)
    return { c, need, make, under: make < need - 3 ? need - make : 0 }
  })
  const worst = rows.filter((r) => r.under > 0).sort((a, b) => b.under - a.under)[0]
  const totalLands = s.landOutputs.reduce((n, o) => n + o.n, 0)
  const outputColor = (o: (typeof s.landOutputs)[number]) =>
    o.kind === 'any' ? Colors.gold : o.kind === 'mono' ? COLOR_HEX[o.colors[0]] : o.kind === 'colorless' ? '#8C8475' : o.kind === 'none' ? '#4A453B' : null

  return (
    <View style={styles.section}>
      <Figures
        items={[
          { value: String(s.lands), label: 'Lands' },
          { value: String(s.rocks), label: 'Mana rocks' },
          { value: String(s.treasure), label: 'Treasure makers', gold: true },
        ]}
      />

      <Card>
        <CardHead title="Need vs. make" right={<Legend items={[{ color: '#CFC7B4', label: 'Pips', outline: true }, { color: '#CFC7B4', label: 'Sources' }]} />} />
        <View style={styles.supply}>
          {rows.map((r) => (
            <View key={r.c}>
              <View style={styles.supplyHead}>
                <View style={styles.colorTitle}>
                  <ManaSymbol symbol={r.c} size={14} />
                  <Text style={styles.colorName}>{COLOR_NAME[r.c]}</Text>
                </View>
                <Text style={[styles.supplyNote, { color: r.under ? Colors.goldLight : Colors.positive }]}>
                  {r.need === 0 ? `${s.make[r.c]} sources` : r.under ? `Under by ${r.under}%` : 'Balanced'}
                </Text>
              </View>
              <View style={styles.supplyRow}>
                <Text style={styles.supplyLabel}>Pips</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${r.need}%`, borderWidth: 1.5, borderColor: COLOR_HEX[r.c] }]} />
                </View>
                <Text style={styles.supplyValue}>{r.need ? `${r.need}%` : '—'}</Text>
              </View>
              <View style={styles.supplyRow}>
                <Text style={styles.supplyLabel}>Sources</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${r.make}%`, backgroundColor: COLOR_HEX[r.c] }]} />
                </View>
                <Text style={styles.supplyValue}>{r.make}%</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.note}>
          {worst
            ? `${COLOR_NAME[worst.c]} makes up ${worst.need}% of your pips but ${worst.make}% of your colored sources. A few more ${COLOR_NAME[worst.c].toLowerCase()} sources would even it out.`
            : rows.length
              ? 'Your mana sources match what your spells ask for.'
              : 'No colored mana in this deck.'}
        </Text>
      </Card>

      {totalLands > 0 && (
        <Card>
          <CardHead title="Lands by output" />
          <View style={styles.stack} accessible accessibilityLabel={`${totalLands} lands: ${s.landOutputs.map((o) => `${o.n} ${o.label}`).join(', ')}`}>
            {s.landOutputs.map((o) => {
              const solid = outputColor(o)
              return (
                <View
                  key={o.label}
                  style={[
                    styles.stackPart,
                    { flex: o.n },
                    solid
                      ? { backgroundColor: solid }
                      : { experimental_backgroundImage: `linear-gradient(90deg, ${o.colors.map((c, i) => `${COLOR_HEX[c]} ${(i / o.colors.length) * 100}%, ${COLOR_HEX[c]} ${((i + 1) / o.colors.length) * 100}%`).join(', ')})` },
                  ]}
                />
              )
            })}
          </View>
          <View style={styles.outputs}>
            {s.landOutputs.map((o) => (
              <View key={o.label} style={styles.output}>
                <Text style={styles.outputLabel} numberOfLines={1}>{o.label}</Text>
                <Text style={styles.strong}>{o.n}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}
    </View>
  )
}

// ---- Card types ----

function Types({ lines }: { lines: DeckLine[] }) {
  const types = typeStats(lines)
  const [hl, setHl] = useState<string | null>(null)
  const total = types.reduce((n, t) => n + t.n, 0)
  const max = Math.max(1, ...types.map((t) => t.n))
  const squares = types.flatMap((t) => Array.from({ length: t.n }, () => t))
  // Ten squares to a row, sized from the grid's measured width.
  const [width, setWidth] = useState(0)
  // Rounded down: a fraction too wide and the tenth square wraps.
  const side = width ? Math.floor(((width - 9 * WAFFLE_GAP) / 10) * 10) / 10 - 0.1 : 0

  return (
    <View style={styles.section}>
      <Card>
        <CardHead title={`All ${total} cards`} right={<Text style={styles.muted}>Tap a type to highlight</Text>} />
        <View style={styles.waffle} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={`${total} cards by type: ${types.map((t) => `${t.type} ${t.n}`).join(', ')}`}>
          {squares.map((t, i) => (
            <View
              key={i}
              style={[styles.square, { width: side, height: side, backgroundColor: t.color, opacity: hl == null || hl === t.type ? 1 : 0.16 }]}
            />
          ))}
        </View>
      </Card>
      <View style={[styles.card, styles.list]}>
        {types.map((t, i) => {
          const on = hl === t.type
          return (
            <Pressable
              key={t.type}
              style={[styles.typeRow, i > 0 && styles.rule, on && styles.typeRowOn]}
              onPress={() => setHl(on ? null : t.type)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t.type}, ${t.n} cards`}
            >
              <View style={[styles.typeSwatch, { backgroundColor: t.color }]} />
              <Text style={styles.typeLabel}>{t.type}</Text>
              <View style={[styles.track, styles.typeTrack]}>
                <View style={[styles.fill, { width: `${(t.n / max) * 100}%`, backgroundColor: t.color }]} />
              </View>
              <Text style={styles.rowValue}>{t.n}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

// ---- Subtypes ----

const SUB_TABS: { value: SubtypeTab; label: string }[] = [
  { value: 'creature', label: 'Creature' },
  { value: 'land', label: 'Land' },
  { value: 'artifact', label: 'Artifact' },
  { value: 'other', label: 'Other' },
]
const SUB_INFO: Record<SubtypeTab, { title: string; noun: [string, string]; color: string }> = {
  creature: { title: 'Creature types', noun: ['creature', 'creatures'], color: '#D4A64A' },
  land: { title: 'Land types', noun: ['land', 'lands'], color: '#8C8475' },
  artifact: { title: 'Artifact types', noun: ['artifact', 'artifacts'], color: '#A7B4C2' },
  other: { title: 'Other types', noun: ['card', 'cards'], color: '#B98AB0' },
}

function Subtypes({ lines }: { lines: DeckLine[] }) {
  const [tab, setTab] = useState<SubtypeTab>('creature')
  const s = subtypeStats(lines, tab)
  const info = SUB_INFO[tab]
  const max = Math.max(1, ...s.rows.map((r) => r.n))

  return (
    <View style={styles.section}>
      <Segmented label="Subtypes of" options={SUB_TABS} value={tab} onChange={setTab} />
      <Card>
        <View style={styles.subHead}>
          <Text style={styles.subTitle}>{info.title}</Text>
          <Text style={styles.calloutMeta}>{s.cards} {s.cards === 1 ? info.noun[0] : info.noun[1]}</Text>
        </View>
        {s.rows.length === 0 ? (
          <Text style={[styles.calloutText, styles.subEmpty]}>None in the main deck.</Text>
        ) : (
          <View style={styles.rows}>
            {s.rows.map((r) => (
              <View key={r.label} style={styles.barRow}>
                <Text style={[styles.rowLabel, styles.subLabel]} numberOfLines={1}>{r.label}</Text>
                <View style={[styles.track, styles.subTrack]}>
                  <View style={[styles.fill, styles.subFill, { width: `${Math.max(4, (r.n / max) * 100)}%`, backgroundColor: r.rest ? 'rgba(237,230,214,0.18)' : info.color }]} />
                </View>
                <Text style={styles.rowValue}>{r.n}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.note}>A card can have more than one subtype, so the numbers can add up to more than the cards in the group.</Text>
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  tabsScroll: {
    marginTop: 14,
    marginHorizontal: -20,
  },
  tabs: {
    paddingHorizontal: 20,
    gap: 8,
  },
  tab: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: Colors.surface,
    justifyContent: 'center',
  },
  tabOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.14)',
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: '#CFC7B4',
  },
  tabLabelOn: {
    color: '#F0D8A0',
  },
  empty: {
    marginTop: 40,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
  section: {
    marginTop: 18,
    gap: 14,
  },
  card: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  figures: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  figure: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  figureRule: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
  },
  figureValue: {
    fontSize: 20,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  figureLabel: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  gold: {
    color: Colors.goldLight,
  },
  legend: {
    flexDirection: 'row',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: '#CFC7B4',
  },
  curve: {
    marginTop: 14,
    height: CURVE_HEIGHT + 22,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(237,230,214,0.14)',
  },
  bar: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    gap: 2,
  },
  dim: {
    opacity: 0.45,
  },
  barNum: {
    marginBottom: 2,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: '#CFC7B4',
  },
  barPart: {
    borderRadius: 2,
  },
  barTop: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  curveLabels: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 8,
  },
  curveLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.textSecondary,
  },
  callout: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.28)',
    backgroundColor: 'rgba(212,166,74,0.07)',
  },
  calloutHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 6,
  },
  calloutTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  calloutMeta: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  calloutText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  donutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  donut: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutValue: {
    fontSize: 22,
    lineHeight: 26,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  // Kept inside the ring's hole: wraps to two lines rather than running over the ring.
  donutLabel: {
    maxWidth: RING - 2 * STROKE - 16,
    fontSize: 11,
    lineHeight: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  donutLegend: {
    flex: 1,
    gap: 12,
  },
  colorTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  colorName: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  small: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  strong: {
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  muted: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  rows: {
    marginTop: 12,
    gap: 10,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barRowLabel: {
    width: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  multiDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.gold,
  },
  track: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(237,230,214,0.06)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 6,
  },
  rowValue: {
    minWidth: 28,
    textAlign: 'right',
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  heavy: {
    minHeight: 52,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rule: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.07)',
  },
  heavyPips: {
    width: 64,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  heavyCards: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  heavyN: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  supply: {
    marginTop: 14,
    gap: 16,
  },
  supplyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  supplyNote: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
  },
  supplyRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supplyLabel: {
    width: 58,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  supplyValue: {
    width: 40,
    textAlign: 'right',
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  note: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  stack: {
    marginTop: 12,
    height: 14,
    flexDirection: 'row',
    gap: 3,
  },
  stackPart: {
    borderRadius: 4,
  },
  outputs: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    columnGap: 14,
  },
  output: {
    width: '46%',
    flexGrow: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  outputLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  waffle: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: WAFFLE_GAP,
  },
  square: {
    borderRadius: 5,
  },
  list: {
    padding: 0,
    overflow: 'hidden',
  },
  typeRow: {
    height: 50,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeRowOn: {
    backgroundColor: 'rgba(212,166,74,0.08)',
  },
  typeSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  typeLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  typeTrack: {
    flex: 0,
    width: 90,
    height: 8,
  },
  subHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  subTitle: {
    fontSize: 24,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  subEmpty: {
    marginTop: 12,
  },
  subLabel: {
    width: 96,
    flexShrink: 0,
    fontSize: 14,
  },
  subTrack: {
    height: 22,
    borderRadius: 7,
  },
  subFill: {
    borderRadius: 7,
  },
})
