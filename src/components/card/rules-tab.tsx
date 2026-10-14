import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SymbolText } from '@/components/card/oracle-text';
import { Segmented } from '@/components/controls';
import { Colors, Fonts } from '@/constants/theme';
import type { Legality, Ruling, ScryfallCard } from '@/db/scryfall';
import { commanderStatus, type CommanderTone } from '@/rules/commander';
import { ARENA_FORMATS, formatsFor, LEGALITY_HINT, LEGALITY_LABEL, PAPER_FORMATS } from '@/rules/formats';
import { explainKeyword, KEYWORD_KIND_LABEL } from '@/rules/keywords';
import { layoutText } from '@/rules/printings';
import { capitalize } from '@/utils/format';

// C4 · Card — Rules & legality: where it's legal, whether it can lead a Commander deck, what its
// keywords mean, official rulings and card data.

const STATUS_COLORS: Record<Legality, { bg: string; border: string; name: string; pill: string; pillText: string; dot: string }> = {
  legal: { bg: 'rgba(127,199,166,0.06)', border: 'rgba(127,199,166,0.28)', name: Colors.text, pill: 'rgba(127,199,166,0.16)', pillText: '#BFE5D3', dot: Colors.positive },
  restricted: { bg: 'rgba(212,166,74,0.07)', border: 'rgba(212,166,74,0.32)', name: Colors.text, pill: 'rgba(212,166,74,0.16)', pillText: Colors.goldLight, dot: Colors.gold },
  banned: { bg: 'rgba(232,134,106,0.06)', border: 'rgba(232,134,106,0.30)', name: Colors.text, pill: 'rgba(232,134,106,0.16)', pillText: '#F2B4A2', dot: Colors.negative },
  not_legal: { bg: Colors.surface, border: Colors.border, name: Colors.textSecondary, pill: 'rgba(237,230,214,0.08)', pillText: Colors.textSecondary, dot: '#6E685C' },
}

const TONES: Record<CommanderTone, { bg: string; border: string; icon: string; iconBg: string }> = {
  yes: { bg: 'rgba(165,146,174,0.08)', border: 'rgba(165,146,174,0.30)', icon: '#D6C6DE', iconBg: 'rgba(165,146,174,0.18)' },
  partial: { bg: 'rgba(212,166,74,0.07)', border: 'rgba(212,166,74,0.30)', icon: Colors.goldLight, iconBg: 'rgba(212,166,74,0.16)' },
  no: { bg: Colors.surface, border: Colors.border, icon: Colors.textSecondary, iconBg: Colors.surfaceRaised },
}

const GAMES: Record<string, string> = { paper: 'Paper', arena: 'MTG Arena', mtgo: 'Magic Online' }

// "2022-09-09" -> "9 Sep 2022"
const longDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// "Legal in 12 of 15 formats" (paper), for the screen's header.
export function legalitySummary(card: ScryfallCard) {
  const formats = formatsFor(card, PAPER_FORMATS)
  const legal = formats.filter((f) => ['legal', 'restricted'].includes(card.legalities?.[f.key] ?? ''))
  return `Legal in ${legal.length} of ${formats.length} formats`
}

export function RulesTab({ card, rulings, firstPrinting }: { card: ScryfallCard; rulings: Ruling[] | null; firstPrinting: ScryfallCard | null }) {
  const onArena = (card.games ?? []).includes('arena')
  const [mode, setMode] = useState<'paper' | 'arena'>('paper')
  const formats = formatsFor(card, mode === 'arena' && onArena ? ARENA_FORMATS : PAPER_FORMATS)
  const commander = commanderStatus(card)
  const tone = TONES[commander.tone]
  const allText = card.oracle_text ?? (card.card_faces ?? []).map((f) => f.oracle_text ?? '').join('\n')
  const keywords = card.keywords ?? []
  const layout = layoutText(card.layout)
  const first = firstPrinting ?? card
  const artist = card.artist ?? card.card_faces?.[0]?.artist
  const watermark = card.watermark ?? card.card_faces?.[0]?.watermark

  return (
    <View style={styles.tab}>
      <View style={styles.sectionHead}>
        <Text style={styles.label}>Format legality</Text>
        {onArena && (
          <View>
            <Segmented
              label="Play format"
              small
              options={[
                { value: 'paper', label: 'Paper' },
                { value: 'arena', label: 'Arena' },
              ]}
              value={mode}
              onChange={setMode}
            />
          </View>
        )}
      </View>
      <View style={styles.formats}>
        {formats.map((f) => {
          const status = card.legalities?.[f.key] ?? 'not_legal'
          const c = STATUS_COLORS[status]
          return (
            <View
              key={f.key}
              style={[styles.format, { backgroundColor: c.bg, borderColor: c.border }]}
              accessible
              accessibilityLabel={`${f.label}: ${LEGALITY_LABEL[status]}. ${LEGALITY_HINT[status]}`}
            >
              <Text style={[styles.formatName, { color: c.name }]} numberOfLines={1}>{f.label}</Text>
              <View style={[styles.pill, { backgroundColor: c.pill }]}>
                <View style={[styles.pillDot, { backgroundColor: c.dot }]} />
                <Text style={[styles.pillLabel, { color: c.pillText }]}>{LEGALITY_LABEL[status]}</Text>
              </View>
            </View>
          )
        })}
      </View>

      <View style={[styles.commander, { backgroundColor: tone.bg, borderColor: tone.border }]}>
        <View style={[styles.commanderIcon, { backgroundColor: tone.iconBg }]}>
          <SymbolView name={{ ios: 'crown', android: 'workspace_premium' }} size={22} tintColor={tone.icon} />
        </View>
        <View style={styles.commanderText}>
          <Text style={styles.commanderTitle}>{commander.title}</Text>
          <Text style={styles.body}>{commander.text}</Text>
        </View>
      </View>

      {keywords.length > 0 && (
        <>
          <Text style={[styles.label, styles.gap]}>{keywords.length === 1 ? 'Keyword' : 'Keywords'}</Text>
          <View style={styles.stack}>
            {keywords.map((k) => {
              const rule = explainKeyword(k, allText)
              return (
                <View key={k} style={styles.panel}>
                  <View style={styles.keywordHead}>
                    <Text style={styles.keyword}>{k}</Text>
                    <Text style={styles.keywordKind}>{KEYWORD_KIND_LABEL[rule.kind]}</Text>
                  </View>
                  <SymbolText text={rule.text} size={13} style={styles.body} />
                </View>
              )
            })}
          </View>
        </>
      )}

      {layout && (
        <>
          <Text style={[styles.label, styles.gap]}>How this card works</Text>
          <View style={styles.panel}>
            <Text style={styles.body}>{layout}</Text>
          </View>
        </>
      )}

      <View style={[styles.sectionHead, styles.gap]}>
        <Text style={styles.label}>Official rulings</Text>
        {rulings && <Text style={styles.count}>{rulings.length} {rulings.length === 1 ? 'ruling' : 'rulings'}</Text>}
      </View>
      {rulings == null ? (
        <ActivityIndicator color={Colors.gold} />
      ) : rulings.length === 0 ? (
        <View style={styles.panel}>
          <Text style={styles.body}>No official rulings for this card.</Text>
        </View>
      ) : (
        <View style={styles.stack}>
          {rulings.map((r, i) => (
            <View key={i} style={styles.panel}>
              <View style={styles.rulingHead}>
                <SymbolView name={{ ios: 'calendar', android: 'calendar_today' }} size={14} tintColor={Colors.goldLight} />
                <Text style={styles.rulingDate}>{longDate(r.published_at)}</Text>
                {r.source === 'wotc' && <Text style={styles.rulingSource}>Wizards of the Coast</Text>}
              </View>
              <SymbolText text={r.comment} size={14} style={styles.ruling} />
            </View>
          ))}
        </View>
      )}

      <Text style={[styles.label, styles.gap]}>Card data</Text>
      <View style={styles.data}>
        {first.released_at && <Row label="First released" value={`${longDate(first.released_at)} · ${first.set.toUpperCase()}`} first />}
        <Row label="Reserved List" value={card.reserved ? 'Yes · never reprinted' : 'No · can be reprinted'} first={!first.released_at} />
        {artist && <Row label="Artist" value={artist} />}
        {watermark && <Row label="Watermark" value={capitalize(watermark)} />}
        {card.games?.length ? <Row label="Played on" value={card.games.map((g) => GAMES[g] ?? capitalize(g)).join(', ')} /> : null}
      </View>
      <Text style={styles.footnote}>
        Card text shown is the Oracle wording, the current official version. It can differ from what&apos;s printed on older copies.
        {card.reserved ? ' Reserved List cards are ones Wizards of the Coast has promised never to reprint.' : ''}
      </Text>
    </View>
  )
}

function Row({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[styles.row, !first && styles.rowRule]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tab: {
    paddingTop: 20,
  },
  sectionHead: {
    marginBottom: 10,
    marginLeft: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  gap: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 2,
  },
  count: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  formats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  format: {
    width: '48.8%',
    flexGrow: 1,
    height: 48,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  formatName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontFamily: Fonts.bold,
  },
  pill: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillLabel: {
    fontSize: 11,
    fontFamily: Fonts.extraBold,
  },
  commander: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  commanderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commanderText: {
    flex: 1,
  },
  commanderTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  body: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  stack: {
    gap: 8,
  },
  panel: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  keywordHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  keyword: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  keywordKind: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  rulingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rulingDate: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  rulingSource: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  ruling: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: Fonts.regular,
    color: Colors.text,
  },
  data: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  row: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowRule: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.07)',
  },
  rowLabel: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.text,
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
