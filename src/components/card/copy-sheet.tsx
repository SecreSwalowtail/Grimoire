import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { Tilt } from '@/components/card-effects/tilt';
import { CardThumb } from '@/components/card/card-thumb';
import { PrimaryButton, Segmented, Sheet, SheetHeader, Toggle } from '@/components/controls';
import { Colors, Fonts } from '@/constants/theme';
import { getBinders, type Binder } from '@/db/binders';
import {
  addToCollection,
  removeEntry,
  updateEntry,
  type CollectionEntry,
  type Condition,
  type Finish,
} from '@/db/collection';
import { cardThumb, type ScryfallCard } from '@/db/scryfall';
import { CONDITIONS, COPY_LANGUAGES, LANGUAGE_NAMES } from '@/rules/collection';
import { FINISH_LABEL, printingLabel } from '@/rules/printings';
import { mainFinish } from '@/utils/card-prices';
import { currencyName, useMoney, type Money } from '@/utils/money';

// C5 · Add / edit a copy. Adding uses the printing on show ("Change" goes to Printings to pick
// another); editing keeps the copy's printing. Under it, the binder the copy goes in (your first
// binder to start with; editing can move the copy). Nothing is saved until the gold button.

type Draft = {
  // null: the first binder, until the binders have loaded.
  binderId: string | null
  qty: number
  finish: Finish
  condition: Condition
  language: string
  paid: string
  forTrade: boolean
}

const parsePaid = (text: string) => {
  const value = Number(text.replace(',', '.'))
  return text.trim() && Number.isFinite(value) && value >= 0 ? value : null
}

// What was paid, typed in the user's currency, kept in euros (to the cent).
const toEur = (value: number | null, money: Money) => (value == null ? null : Math.round(money.toEur(value) * 100) / 100)

export function CopySheet({
  visible,
  card,
  entry,
  onClose,
  onSaved,
  onChangePrinting,
  tilt,
}: {
  visible: boolean
  card: ScryfallCard
  entry: CollectionEntry | null
  onClose: () => void
  onSaved: () => void
  onChangePrinting: () => void
  // For the holographic thumbnail when a foil finish is picked.
  tilt: Tilt
}) {
  const money = useMoney()
  const db = useSQLiteContext()
  const editing = entry != null
  // The copy's own printing when editing (it may not be the one on show).
  const samePrinting = !entry || entry.card_id === card.id
  const finishes = (samePrinting ? card.finishes ?? ['nonfoil'] : ['nonfoil', 'foil']) as Finish[]
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState(false)
  const [binders, setBinders] = useState<Binder[]>([])

  // The binders, fresh each time the sheet opens (they can change on the Binder tab).
  useEffect(() => {
    if (!visible) return
    let live = true
    getBinders(db)
      .then((b) => live && setBinders(b))
      .catch((e) => console.warn('Failed to load binders', e))
    return () => {
      live = false
    }
  }, [visible, db])

  // Fill the form each time the sheet opens (state adjusted during render).
  const openKey = visible ? `${entry?.id ?? 'new'}:${card.id}` : null
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  if (openKey !== loadedFor) {
    setLoadedFor(openKey)
    setConfirmRemove(false)
    if (openKey) {
      setDraft(
        entry
          ? {
              binderId: entry.binder_id,
              qty: entry.quantity,
              finish: entry.finish,
              condition: entry.condition,
              language: entry.language,
              paid: entry.purchase_price != null ? money.fromEur(entry.purchase_price).toFixed(2) : '',
              forTrade: entry.for_trade === 1,
            }
          : {
              binderId: null,
              qty: 1,
              finish: mainFinish(card),
              condition: 'NM',
              language: COPY_LANGUAGES.some((l) => l.code === card.lang) ? card.lang : 'en',
              paid: '',
              forTrade: false,
            },
      )
    }
  }

  if (!draft) return null
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const binder = binders.find((b) => b.id === draft.binderId) ?? binders[0] ?? null
  const binderName = binder?.name ?? 'your binder'
  const condition = CONDITIONS.find((c) => c.code === draft.condition)!
  // The printing's own language isn't always one of the usual seven: offer it too.
  const languages = COPY_LANGUAGES.some((l) => l.code === draft.language)
    ? COPY_LANGUAGES
    : [...COPY_LANGUAGES, { code: draft.language, name: LANGUAGE_NAMES[draft.language] ?? draft.language }]

  const unit = entry && !samePrinting
    ? draft.finish === 'nonfoil' ? entry.price_eur ?? entry.price_eur_foil : entry.price_eur_foil ?? entry.price_eur
    : Number((draft.finish === 'nonfoil' ? card.prices.eur ?? card.prices.eur_foil : card.prices.eur_foil ?? card.prices.eur) ?? NaN)
  const value = unit != null && Number.isFinite(unit) ? money.eur(unit * draft.qty) : '—'
  const printingTitle = entry && !samePrinting
    ? `${entry.set_name} #${entry.collector_number}`
    : `${printingLabel(card)} · ${card.set_name} #${card.collector_number}`
  const thumb = entry && !samePrinting ? entry.image_uri : cardThumb(card)

  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      const changes = {
        binderId: binder?.id ?? entry?.binder_id,
        quantity: draft.qty,
        finish: draft.finish,
        condition: draft.condition,
        language: draft.language,
        purchasePrice: toEur(parsePaid(draft.paid), money),
        forTrade: draft.forTrade,
      }
      if (entry) await updateEntry(db, entry.id, { ...changes, binderId: changes.binderId ?? entry.binder_id })
      else await addToCollection(db, card, changes)
      onSaved()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!entry || busy) return
    setBusy(true)
    try {
      await removeEntry(db, entry.id)
      onSaved()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title={editing ? 'Edit copy' : 'Add to binder'} onClose={onClose} />
      <ScrollView showsVerticalScrollIndicator={false} style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" bounces={false}>
        <Pressable
          style={styles.printing}
          onPress={editing ? undefined : onChangePrinting}
          disabled={editing}
          accessibilityRole={editing ? 'text' : 'button'}
          accessibilityHint={editing ? undefined : 'Pick another printing'}
        >
          <CardThumb uri={thumb} foil={draft.finish !== 'nonfoil'} tilt={tilt} radius={4} style={styles.thumb} />
          <View style={styles.printingText}>
            <Text style={styles.small}>Printing</Text>
            <Text style={styles.printingTitle} numberOfLines={2}>{printingTitle}</Text>
          </View>
          {!editing && <Text style={styles.change}>Change</Text>}
        </Pressable>

        {binders.length > 0 && (
          <>
            <Text style={[styles.label, styles.gap]}>Binder</Text>
            <View style={styles.binders} accessibilityRole="radiogroup" accessibilityLabel="Binder">
              {binders.map((b) => {
                const on = b.id === binder?.id
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.binder, on && styles.optionOn]}
                    onPress={() => set({ binderId: b.id })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                  >
                    <View style={[styles.binderDot, { backgroundColor: b.color }]} />
                    <Text style={[styles.binderLabel, on && styles.optionLabelOn]} numberOfLines={1}>{b.name}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </>
        )}

        <View style={styles.pair}>
          <View style={styles.half}>
            <Text style={styles.label}>Quantity</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.step}
                onPress={() => set({ qty: Math.max(1, draft.qty - 1) })}
                accessibilityRole="button"
                accessibilityLabel="One fewer"
              >
                <Text style={styles.stepLabel}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qty} accessibilityLiveRegion="polite">{draft.qty}</Text>
              <TouchableOpacity
                style={styles.step}
                onPress={() => set({ qty: Math.min(99, draft.qty + 1) })}
                accessibilityRole="button"
                accessibilityLabel="One more"
              >
                <Text style={styles.stepLabel}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Finish</Text>
            <Segmented
              label="Finish"
              options={finishes.map((f) => ({ value: f, label: FINISH_LABEL[f] ?? f }))}
              value={finishes.includes(draft.finish) ? draft.finish : finishes[0]}
              onChange={(finish) => set({ finish })}
            />
          </View>
        </View>

        <Text style={[styles.label, styles.gap]}>Condition</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Condition">
          {CONDITIONS.map((c) => {
            const on = c.code === draft.condition
            return (
              <TouchableOpacity
                key={c.code}
                style={[styles.option, on && styles.optionOn]}
                onPress={() => set({ condition: c.code })}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={c.name}
              >
                <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>{c.code}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        <Text style={styles.hint}>
          <Text style={styles.hintStrong}>{condition.name}</Text> · {condition.hint}
        </Text>

        <Text style={[styles.label, styles.gap]}>Language</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Language">
          {languages.map((l) => {
            const on = l.code === draft.language
            return (
              <TouchableOpacity
                key={l.code}
                style={[styles.option, styles.language, on && styles.optionOn]}
                onPress={() => set({ language: l.code })}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={l.name}
              >
                <Text style={[styles.optionLabel, styles.languageLabel, on && styles.optionLabelOn]}>{l.code.toUpperCase()}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <View style={[styles.pair, styles.gap]}>
          <View style={styles.paidBox}>
            <Text style={styles.label}>Price paid · optional</Text>
            <View style={styles.field}>
              <Text style={styles.currency}>{money.symbol}</Text>
              <TextInput
                style={styles.input}
                value={draft.paid}
                onChangeText={(paid) => set({ paid })}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                accessibilityLabel={`Price paid per copy, in ${currencyName(money.code)}`}
              />
            </View>
          </View>
          <View style={styles.trade}>
            <Text style={styles.tradeLabel}>For trade</Text>
            <Toggle value={draft.forTrade} onChange={(forTrade) => set({ forTrade })} label="Available for trade" />
          </View>
        </View>

        {editing && (
          confirmRemove ? (
            <View style={styles.confirm}>
              <Text style={styles.confirmText}>
                Remove {entry.quantity === 1 ? 'this copy' : `these ${entry.quantity} copies`} from {binderName}?
              </Text>
              <View style={styles.confirmButtons}>
                <TouchableOpacity style={styles.cancel} onPress={() => setConfirmRemove(false)} accessibilityRole="button">
                  <Text style={styles.cancelLabel}>Keep</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeNow} onPress={remove} accessibilityRole="button">
                  <Text style={styles.removeNowLabel}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.remove} onPress={() => setConfirmRemove(true)} accessibilityRole="button">
              <Text style={styles.removeLabel}>Remove from binder</Text>
            </TouchableOpacity>
          )
        )}
      </ScrollView>

      <View style={styles.summary}>
        <Text style={styles.summaryNote}>
          {editing ? 'Worth now' : `Adds to ${binderName}`} · {draft.condition}
          {draft.finish !== 'nonfoil' ? ` ${FINISH_LABEL[draft.finish].toLowerCase()}` : ''}
        </Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
      <PrimaryButton
        label={editing ? 'Save changes' : draft.qty > 1 ? `Add ${draft.qty} copies` : 'Add to binder'}
        onPress={save}
      />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    marginTop: 16,
  },
  bodyContent: {
    paddingBottom: 20,
  },
  printing: {
    height: 68,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumb: {
    width: 36,
    height: 50,
  },
  printingText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  small: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  printingTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  change: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  binders: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  binder: {
    height: 40,
    maxWidth: '100%',
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // A tiny binder: rounded on the right like the covers.
  binderDot: {
    width: 10,
    height: 13,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  binderLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: '#CFC7B4',
  },
  pair: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  label: {
    marginBottom: 8,
    marginLeft: 2,
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  gap: {
    marginTop: 16,
  },
  stepper: {
    height: 48,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  step: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  qty: {
    fontSize: 18,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  option: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.12)',
  },
  optionLabel: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: '#CFC7B4',
  },
  optionLabelOn: {
    color: Colors.goldLight,
  },
  language: {
    height: 40,
  },
  languageLabel: {
    fontSize: 12,
  },
  hint: {
    marginTop: 8,
    marginHorizontal: 2,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  hintStrong: {
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  paidBox: {
    flex: 1,
  },
  field: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  currency: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Colors.textSecondary,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  trade: {
    height: 48,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tradeLabel: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  remove: {
    marginTop: 18,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(238,132,102,0.30)',
    backgroundColor: 'rgba(181,65,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: '#EE8466',
  },
  confirm: {
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(238,132,102,0.45)',
    backgroundColor: 'rgba(181,65,42,0.14)',
    gap: 12,
  },
  confirmText: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  cancel: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  removeNow: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#B5412A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeNowLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: '#FFF4EC',
  },
  summary: {
    marginBottom: 10,
    marginHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryNote: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
})
