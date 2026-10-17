import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { PrimaryButton, SectionLabel, Sheet, SheetHeader } from '@/components/controls'
import { RadioDot } from '@/components/decks/parts'
import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import { importDeckList } from '@/db/deck-import'
import { importCollection } from '@/db/import-export'
import { useDeckStore } from '@/utils/deck-store'
import { plural } from '@/utils/format'

// Where the cards go: a deck, or a binder (named, for what the sheet says).
export type ImportTarget = { kind: 'deck'; id: string } | { kind: 'binder'; id: string; name: string }

type Result = {
  fileName: string | null
  cards: number // different cards (or rows) added
  copies: number
  failed: { line: number; name: string; reason: string }[]
}

type Source = 'manabox'
const SOURCES: Record<ImportTarget['kind'], { value: Source; label: string; hint: string }[]> = {
  deck: [{ value: 'manabox', label: 'From text', hint: 'A deck list as text (.txt), e.g. exported from Manabox' }],
  binder: [{ value: 'manabox', label: 'From text', hint: 'A card list as text (.txt) or CSV, e.g. exported from Manabox' }],
}

// "Import from…": pick a file on the phone and its cards are added to a deck (Deck options, New
// deck) or a binder (its + button, New binder); the sheet then says what was added and which lines
// it couldn't use. `autoPick`: the file picker opens with the sheet (right after making a new deck
// or binder). `onImported`: after cards went into a binder (the screen reloads).
export function ImportSheet({
  target,
  autoPick = false,
  onClose,
  onImported,
}: {
  target: ImportTarget | null
  autoPick?: boolean
  onClose: () => void
  onImported?: () => void
}) {
  const db = useSQLiteContext()
  const { decks } = useDeckStore()
  const name = target?.kind === 'deck' ? decks.find((d) => d.id === target.id)?.name : target?.name
  const [source, setSource] = useState<Source>('manabox')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fresh each time it opens (state adjusted during render).
  const key = target ? `${target.kind}:${target.id}` : null
  const [openFor, setOpenFor] = useState<string | null>(null)
  if (key !== openFor) {
    setOpenFor(key)
    setResult(null)
    setError(null)
    setBusy(false)
  }

  const pick = async () => {
    if (!target || busy) return
    setBusy(true)
    setError(null)
    try {
      if (target.kind === 'deck') {
        const r = await importDeckList(db, target.id)
        if (!r.canceled) setResult(r)
      } else {
        const r = await importCollection(db, target.id)
        if (!r.canceled) {
          setResult({ fileName: r.fileName, cards: r.imported, copies: r.copies, failed: r.failed })
          onImported?.()
        }
      }
    } catch (e) {
      console.warn('Import failed', e)
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  // Right after a new deck or binder: straight to the file picker (once the sheet is up).
  useEffect(() => {
    if (!autoPick || !key) return
    const frame = requestAnimationFrame(() => {
      pick()
    })
    return () => cancelAnimationFrame(frame)
    // Once per opening, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPick, key])

  const sources = SOURCES[target?.kind ?? 'deck']

  return (
    <Sheet visible={target != null} onClose={busy ? () => {} : onClose}>
      <SheetHeader title={target?.kind === 'binder' ? 'Import cards' : 'Import decklist'} onClose={busy ? undefined : onClose} />
      <ScrollView showsVerticalScrollIndicator={false} style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
        {result ? (
          <View>
            <View style={styles.done}>
              <View style={styles.doneIcon}>
                <Icon name={{ ios: 'checkmark', android: 'check' }} size={22} tintColor={Colors.onGold} weight="bold" />
              </View>
              <View style={styles.doneText}>
                <Text style={styles.doneTitle}>
                  {plural(result.copies, 'card')} added to {name}
                </Text>
                <Text style={styles.hint}>
                  {result.cards} different {result.cards === 1 ? 'card' : 'cards'}
                  {result.fileName ? ` · ${result.fileName}` : ''}
                </Text>
              </View>
            </View>
            {result.failed.length > 0 && (
              <>
                <SectionLabel style={styles.label}>Not added · {result.failed.length}</SectionLabel>
                <View style={styles.failed}>
                  {result.failed.map((f, i) => (
                    <View key={`${f.line}-${i}`} style={[styles.failedRow, i > 0 && styles.rule]}>
                      <Text style={styles.failedName} numberOfLines={1}>{f.name}</Text>
                      <Text style={styles.hint}>Line {f.line} · {f.reason}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        ) : (
          <View>
            {target?.kind === 'binder' ? (
              <Text style={styles.intro}>
                Cards are added to <Text style={styles.strong}>{name}</Text>. Copies of a printing it already holds (same finish,
                condition and language) add up.
              </Text>
            ) : (
              <Text style={styles.intro}>
                Cards are added to <Text style={styles.strong}>{name}</Text>, on top of what it holds. Sideboard and maybe
                sections go to those parts of the deck, and the commander section sets the deck&apos;s commander.
              </Text>
            )}
            <SectionLabel style={styles.label}>Import from</SectionLabel>
            <View style={styles.sources} accessibilityRole="radiogroup" accessibilityLabel="Import from">
              {sources.map((s) => {
                const on = s.value === source
                return (
                  <Pressable
                    key={s.value}
                    style={[styles.source, on && styles.sourceOn]}
                    onPress={() => setSource(s.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                  >
                    <RadioDot selected={on} />
                    <View style={styles.doneText}>
                      <Text style={styles.sourceLabel}>{s.label}</Text>
                      <Text style={styles.hint}>{s.hint}</Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
            {busy && (
              <View style={styles.busy}>
                <ActivityIndicator color={Colors.goldLight} />
                <Text style={styles.hint}>Looking the cards up on Scryfall…</Text>
              </View>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        )}
      </ScrollView>
      {result ? (
        <PrimaryButton label="Done" onPress={onClose} />
      ) : (
        <PrimaryButton label={busy ? 'Importing…' : 'Choose file'} onPress={pick} />
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    marginTop: 14,
  },
  bodyContent: {
    paddingBottom: 20,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  strong: {
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  label: {
    marginTop: 20,
    marginBottom: 10,
  },
  sources: {
    gap: 8,
  },
  source: {
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sourceOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.08)',
  },
  sourceLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  hint: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  busy: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  error: {
    marginTop: 14,
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.danger,
  },
  done: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.28)',
    backgroundColor: 'rgba(212,166,74,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  doneIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  doneTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  failed: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  failedRow: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
  },
  rule: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.07)',
  },
  failedName: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
})
