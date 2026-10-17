import { Image } from 'expo-image'
import { useSQLiteContext } from 'expo-sqlite'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'

import { PrintingPicker } from '@/components/card/printing-picker'
import { PrimaryButton, Sheet, SheetHeader } from '@/components/controls'
import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import { upsertCard } from '@/db/cards'
import { editEntries, type CollectionEntry, type Condition, type CopyEdits, type Finish } from '@/db/collection'
import { cardThumb, type ScryfallCard } from '@/db/scryfall'
import { CONDITIONS, FINISH_NAME } from '@/rules/collection'
import { printingLabel } from '@/rules/printings'
import { mainFinish } from '@/utils/card-prices'
import { plural } from '@/utils/format'
import { currencyName, parsePaid, useMoney } from '@/utils/money'

// Edit cards: the printing (when they're all the same card), condition, finish, and whether you
// got them in a trade (checked, the price paid per copy opens under it), for one card (the quick
// look) or every card picked in a binder's edit mode at once. A setting the cards don't share shows
// as mixed and stays as each card has it unless you pick something.

const FINISHES: Finish[] = ['nonfoil', 'foil', 'etched']

// The value every card has, or undefined when they differ.
function shared<T>(entries: CollectionEntry[], get: (e: CollectionEntry) => T): T | undefined {
  if (entries.length === 0) return undefined
  const first = get(entries[0])
  return entries.every((e) => get(e) === first) ? first : undefined
}

export function EditCopiesSheet({
  visible,
  entries,
  onClose,
  onSaved,
}: {
  visible: boolean
  entries: CollectionEntry[]
  onClose: () => void
  // After saving: the undo and how many cards were edited.
  onSaved: (undo: () => Promise<unknown>, cards: number) => void
}) {
  const db = useSQLiteContext()
  const money = useMoney()
  const [condition, setCondition] = useState<Condition | null>(null)
  const [finish, setFinish] = useState<Finish | null>(null)
  // null: mixed.
  const [traded, setTraded] = useState<boolean | null>(null)
  const [paid, setPaid] = useState('')
  // Untouched, the prices stay as they are.
  const [paidTouched, setPaidTouched] = useState(false)
  // Another printing picked for them all (null: each keeps its own).
  const [printing, setPrinting] = useState<ScryfallCard | null>(null)
  // Picking it (the list takes the sheet's place).
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)

  // The printing can change only when they're all the same card.
  const sameName = shared(entries, (e) => e.name)
  const samePrinting = shared(entries, (e) => e.card_id)
  const sameCondition = shared(entries, (e) => e.condition)
  const sameFinish = shared(entries, (e) => e.finish)
  const sameTraded = shared(entries, (e) => e.traded === 1)
  const samePaid = shared(entries, (e) => e.purchase_price)

  // Start from the cards' own settings each time it opens (state adjusted during render).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setCondition(sameCondition ?? null)
      setFinish(sameFinish ?? null)
      setTraded(sameTraded ?? null)
      setPaid(samePaid != null ? money.fromEur(samePaid).toFixed(2) : '')
      setPaidTouched(false)
      setPrinting(null)
      setPicking(false)
    }
  }

  const one = entries.length === 1
  const copies = entries.reduce((n, e) => n + e.quantity, 0)
  const conditionInfo = CONDITIONS.find((c) => c.code === condition)
  // Finishes the picked printing comes in (any, while each keeps its own).
  const finishes = printing ? FINISHES.filter((f) => (printing.finishes ?? ['nonfoil']).includes(f)) : FINISHES

  const pick = (p: ScryfallCard) => {
    setPrinting(p)
    setPicking(false)
    // A finish the printing doesn't come in (the one set, or any copy's) becomes its main one.
    const available = p.finishes ?? ['nonfoil']
    const kept = finish != null ? [finish] : entries.map((e) => e.finish)
    if (kept.some((f) => !available.includes(f))) setFinish(mainFinish(p))
  }

  const save = async () => {
    if (busy || entries.length === 0) return
    const edits: CopyEdits = {}
    const moved = printing && printing.id !== samePrinting ? printing : null
    if (moved) edits.cardId = moved.id
    if (condition != null && condition !== sameCondition) edits.condition = condition
    if (finish != null && finish !== sameFinish) edits.finish = finish
    if (traded != null && traded !== sameTraded) edits.traded = traded
    // The price only opens for traded cards; unchecked, it stays as it is.
    if (traded && paidTouched) {
      // Typed in the user's currency, kept in euros (to the cent).
      const typed = parsePaid(paid)
      const price = typed == null ? null : Math.round(money.toEur(typed) * 100) / 100
      if (price !== samePaid) edits.purchasePrice = price
    }
    if (Object.keys(edits).length === 0) {
      onClose()
      return
    }
    setBusy(true)
    try {
      if (moved) await upsertCard(db, moved)
      const undo = await editEntries(db, entries, edits)
      onSaved(undo, entries.length)
      onClose()
    } catch (e) {
      console.warn('Failed to edit cards', e)
    } finally {
      setBusy(false)
    }
  }

  if (picking && entries.length > 0) {
    return (
      <Sheet visible={visible} onClose={onClose}>
        <PrintingPicker
          printingId={entries[0].card_id}
          selectedId={printing?.id ?? samePrinting ?? null}
          onPick={pick}
          onBack={() => setPicking(false)}
          onClose={onClose}
        />
      </Sheet>
    )
  }

  // The printing row: the one picked, else theirs when they share one.
  const shownEntry = samePrinting != null ? entries[0] : null
  const printingTitle = printing
    ? `${printingLabel(printing)} · ${printing.set_name} #${printing.collector_number}`
    : shownEntry
      ? `${shownEntry.set_name} #${shownEntry.collector_number}`
      : 'Mixed · pick one to set them all'
  const printingThumb = printing ? cardThumb(printing) : shownEntry?.image_uri ?? null

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title={one ? 'Edit card' : `Edit ${entries.length} cards`} onClose={onClose} />
      <ScrollView showsVerticalScrollIndicator={false} style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" bounces={false}>
        <Text style={styles.lead} numberOfLines={2}>
          {one
            ? `${entries[0].name} · ${plural(copies, 'copy', 'copies')}`
            : `${copies} copies · what you set here goes for all of them`}
        </Text>

        {sameName != null && (
          <TouchableOpacity
            style={styles.printing}
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={`Printing: ${printingTitle}`}
            accessibilityHint="Pick another printing"
          >
            <Image source={{ uri: printingThumb ?? undefined }} style={styles.thumb} contentFit="cover" />
            <View style={styles.printingText}>
              <Text style={styles.small}>Printing</Text>
              <Text style={styles.printingTitle} numberOfLines={2}>{printingTitle}</Text>
            </View>
            <Text style={styles.change}>Change</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.label, sameName != null && styles.gap]}>Condition</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Condition">
          {CONDITIONS.map((c) => {
            const on = c.code === condition
            return (
              <TouchableOpacity
                key={c.code}
                style={[styles.option, on && styles.optionOn]}
                onPress={() => setCondition(c.code)}
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
          {conditionInfo ? (
            <>
              <Text style={styles.hintStrong}>{conditionInfo.name}</Text> · {conditionInfo.hint}
            </>
          ) : (
            'Mixed · pick one to set them all'
          )}
        </Text>

        <Text style={[styles.label, styles.gap]}>Finish</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Finish">
          {finishes.map((f) => {
            const on = f === finish
            return (
              <TouchableOpacity
                key={f}
                style={[styles.option, on && styles.optionOn]}
                onPress={() => setFinish(f)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>{FINISH_NAME[f]}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {finish == null && <Text style={styles.hint}>Mixed · pick one to set them all</Text>}

        <Pressable
          style={[styles.check, styles.gap]}
          onPress={() => setTraded(!traded)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: traded == null ? 'mixed' : traded }}
        >
          <View style={[styles.box, traded !== false && styles.boxOn]}>
            {traded != null ? (
              traded && <Icon name={{ ios: 'checkmark', android: 'check' }} size={14} tintColor={Colors.onGold} weight="bold" />
            ) : (
              <View style={styles.dash} />
            )}
          </View>
          <View style={styles.checkText}>
            <Text style={styles.checkTitle}>Got in a trade</Text>
            <Text style={styles.checkHint}>{traded == null ? 'Some of them were' : one ? 'You traded for this card' : 'You traded for these cards'}</Text>
          </View>
        </Pressable>

        {traded && (
          <>
            <Text style={[styles.label, styles.gap]}>Price paid per copy</Text>
            <View style={styles.field}>
              <Text style={styles.currency}>{money.symbol}</Text>
              <TextInput
                style={styles.input}
                value={paid}
                onChangeText={(text) => {
                  setPaid(text)
                  setPaidTouched(true)
                }}
                placeholder={samePaid === undefined && !paidTouched ? 'Different prices' : '0.00'}
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                accessibilityLabel={`Price paid per copy, in ${currencyName(money.code)}`}
              />
              {paid !== '' && (
                <TouchableOpacity
                  style={styles.clear}
                  onPress={() => {
                    setPaid('')
                    setPaidTouched(true)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear the price paid"
                >
                  <Icon name={{ ios: 'xmark.circle.fill', android: 'cancel' }} size={18} tintColor={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            {samePaid === undefined && !paidTouched && <Text style={styles.hint}>Left as it is, each card keeps its own price.</Text>}
          </>
        )}
      </ScrollView>
      <PrimaryButton label={one ? 'Save changes' : `Save ${entries.length} cards`} onPress={save} />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    marginTop: 8,
  },
  bodyContent: {
    paddingBottom: 20,
  },
  lead: {
    marginBottom: 16,
    marginHorizontal: 2,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
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
    borderRadius: 4,
    backgroundColor: Colors.surface,
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
    marginTop: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  option: {
    flex: 1,
    height: 44,
    paddingHorizontal: 4,
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
  check: {
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(237,230,214,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    borderWidth: 0,
    backgroundColor: Colors.gold,
  },
  // Mixed: some cards are, some aren't.
  dash: {
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.onGold,
  },
  checkText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  checkTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  checkHint: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  field: {
    height: 48,
    paddingLeft: 14,
    paddingRight: 4,
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
  clear: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
