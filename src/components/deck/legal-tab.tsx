import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PathIcon } from '@/components/deck/parts';
import { Colors, Fonts } from '@/constants/theme';
import { checkDeck, type CheckStatus, type LegalCheck } from '@/rules/deck-legality';
import type { DeckLine } from '@/rules/deck-stats';
import type { DeckFormat } from '@/utils/deck-store';

const DANGER = '#EE8466'

const LOOK: Record<CheckStatus, { color: string; tint: string; icon: string; label: string }> = {
  pass: { color: Colors.positive, tint: 'rgba(127,199,166,0.14)', icon: 'M5 12.5l4.5 4.5L19 7.5', label: 'Passes' },
  fail: { color: DANGER, tint: 'rgba(181,65,42,0.18)', icon: 'M7 7l10 10M17 7L7 17', label: 'Problem' },
  warn: { color: Colors.goldLight, tint: 'rgba(212,166,74,0.16)', icon: 'M12 7v6M12 17h.01', label: 'Check' },
  info: { color: '#A9C4E2', tint: 'rgba(111,147,186,0.16)', icon: 'M12 11v6M12 7h.01', label: 'Note' },
}

// How many cards a check lists before "+N more".
const SHOWN = 6

// Legal · whether the deck can be played in its format: a verdict, then every check (problems first),
// each saying why it passes or what to do to fix it.
export function LegalTab({ format, lines }: { format: DeckFormat; lines: DeckLine[] }) {
  const report = checkDeck(format, lines)
  const passed = report.checks.filter((c) => c.status === 'pass').length

  return (
    <View style={styles.tab}>
      <View style={[styles.verdict, report.legal ? styles.verdictOk : styles.verdictBad]}>
        <View style={[styles.verdictIcon, { backgroundColor: report.legal ? Colors.positive : DANGER }]}>
          <PathIcon d={report.legal ? LOOK.pass.icon : LOOK.fail.icon} color={Colors.background} size={22} weight={2.6} />
        </View>
        <View style={styles.verdictText}>
          <Text style={styles.verdictTitle}>{report.legal ? `Legal in ${format}` : `Not legal in ${format} yet`}</Text>
          <Text style={styles.verdictSub}>
            {report.legal
              ? `All ${passed} ${passed === 1 ? 'check passes' : 'checks pass'}. This deck can be played.`
              : `${report.problems} ${report.problems === 1 ? 'thing needs' : 'things need'} fixing. Each one below says how.`}
          </Text>
        </View>
      </View>

      <View style={styles.checks}>
        {report.checks.map((c) => (
          <Check key={c.id} check={c} />
        ))}
      </View>
    </View>
  )
}

function Check({ check }: { check: LegalCheck }) {
  const [all, setAll] = useState(false)
  const look = LOOK[check.status]
  const cards = check.cards ?? []
  const shown = all ? cards : cards.slice(0, SHOWN)

  return (
    <View style={styles.check} accessible accessibilityLabel={`${look.label}: ${check.title}. ${check.detail}${check.fix ? ` To fix: ${check.fix}` : ''}`}>
      <View style={[styles.icon, { backgroundColor: look.tint }]}>
        <PathIcon d={look.icon} color={look.color} size={16} weight={2.4} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{check.title}</Text>
        <Text style={styles.detail}>{check.detail}</Text>
        {cards.length > 0 && (
          <View style={styles.cards}>
            {shown.map((name) => (
              <View key={name} style={[styles.chip, { borderColor: look.tint }]}>
                <Text style={styles.chipLabel} numberOfLines={1}>{name}</Text>
              </View>
            ))}
            {cards.length > SHOWN && (
              <Pressable onPress={() => setAll(!all)} style={styles.chip} accessibilityRole="button">
                <Text style={[styles.chipLabel, styles.more]}>{all ? 'Show fewer' : `+${cards.length - SHOWN} more`}</Text>
              </Pressable>
            )}
          </View>
        )}
        {check.fix && (
          <View style={styles.fix}>
            <Text style={styles.fixLabel}>To fix</Text>
            <Text style={styles.fixText}>{check.fix}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  tab: {
    marginTop: 16,
    gap: 14,
  },
  verdict: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  verdictOk: {
    borderColor: 'rgba(127,199,166,0.35)',
    backgroundColor: 'rgba(127,199,166,0.08)',
  },
  verdictBad: {
    borderColor: 'rgba(238,132,102,0.40)',
    backgroundColor: 'rgba(181,65,42,0.12)',
  },
  verdictIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verdictText: {
    flex: 1,
    gap: 3,
  },
  verdictTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  verdictSub: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  checks: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  check: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(237,230,214,0.06)',
    flexDirection: 'row',
    gap: 12,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  detail: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  cards: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    maxWidth: '100%',
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    justifyContent: 'center',
  },
  chipLabel: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  more: {
    color: Colors.goldLight,
  },
  fix: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(212,166,74,0.08)',
    gap: 2,
  },
  fixLabel: {
    fontSize: 11,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.goldLight,
  },
  fixText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
})
