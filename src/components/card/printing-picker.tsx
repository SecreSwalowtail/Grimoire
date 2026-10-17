import { Image } from 'expo-image'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { SheetHeader } from '@/components/controls'
import { Colors, Fonts } from '@/constants/theme'
import { getSavedCard } from '@/db/cards'
import { cachedCard, cardThumb, getCard, type ScryfallCard } from '@/db/scryfall'
import { finishesText, printingLabel } from '@/rules/printings'
import { cardEuros } from '@/utils/card-prices'
import { useMoney } from '@/utils/money'
import { usePrintings } from '@/utils/use-card-detail'

// The step inside Edit copy / Edit card where you pick another printing of the card: every
// printing, newest first, with its finishes and price. It takes the sheet's place (no sheet over a
// sheet) and goes back on picking one.

const eur = (value: string | null) => (value == null ? null : Number(value))

// The card's oracle id, from any one of its printings: memory, the phone, else Scryfall.
// undefined: still looking; null: couldn't be found.
function useOracleIdOf(printingId: string, known: string | undefined) {
  const db = useSQLiteContext()
  const [found, setFound] = useState<{ key: string; value: string | null } | null>(null)
  const quick = known ?? cachedCard(printingId)?.oracle_id
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (quick) return
    let live = true
    const look = async () => {
      const saved = await getSavedCard(db, printingId).catch(() => null)
      return saved?.card.oracle_id ?? (await getCard(printingId))?.oracle_id ?? null
    }
    look()
      .then((value) => live && setFound({ key: printingId, value }))
      .catch(() => live && setFound({ key: printingId, value: null }))
    return () => {
      live = false
    }
  }, [db, printingId, quick, attempt])

  return {
    oracleId: quick ?? (found?.key === printingId ? found.value : undefined),
    retry: () => {
      setFound(null)
      setAttempt((n) => n + 1)
    },
  }
}

export function PrintingPicker({
  printingId,
  oracleId: knownOracleId,
  selectedId,
  onPick,
  onBack,
  onClose,
}: {
  // Any printing of the card (the copy's own), to find the others.
  printingId: string
  // The card's oracle id when it's already known.
  oracleId?: string
  // The printing marked as picked (null: none, e.g. copies of mixed printings).
  selectedId: string | null
  onPick: (printing: ScryfallCard) => void
  onBack: () => void
  onClose: () => void
}) {
  const money = useMoney()
  const { oracleId, retry: retryOracle } = useOracleIdOf(printingId, knownOracleId)
  const { printings, loadMore, loadingMore, failed, retry } = usePrintings(oracleId ?? null)
  const list = printings?.list ?? []

  const notFound = oracleId === null || failed
  return (
    <>
      <SheetHeader title="Printing" onBack={onBack} onClose={onClose} />
      <ScrollView showsVerticalScrollIndicator={false} style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
        {notFound ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>Couldn&apos;t load the printings. Check your connection and try again.</Text>
            <TouchableOpacity
              style={styles.more}
              onPress={() => (oracleId === null ? retryOracle() : retry())}
              accessibilityRole="button"
            >
              <Text style={styles.moreLabel}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : printings == null ? (
          <ActivityIndicator style={styles.loading} color={Colors.gold} />
        ) : (
          <View style={styles.prints} accessibilityRole="radiogroup" accessibilityLabel="Printing">
            {list.map((p) => {
              const on = p.id === selectedId
              const price = eur(p.prices.eur)
              const foil = eur(p.prices.eur_foil)
              // Cardmarket's, else TCGplayer's (see cardEuros).
              const main = price ?? foil ?? cardEuros(p)
              const year = p.released_at?.slice(0, 4)
              return (
                <Pressable
                  key={p.id}
                  style={[styles.print, on && styles.printOn]}
                  onPress={() => onPick(p)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${printingLabel(p)}, ${p.set_name} number ${p.collector_number}`}
                >
                  <Image source={{ uri: cardThumb(p) ?? undefined }} style={styles.thumb} contentFit="cover" />
                  <View style={styles.text}>
                    <Text style={[styles.title, on && styles.titleOn]} numberOfLines={1}>{printingLabel(p)}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[p.set_name, `#${p.collector_number}`, year].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={styles.finishes}>{finishesText(p.finishes)}</Text>
                  </View>
                  <Text style={styles.price}>{main != null ? money.eur(main) : '—'}</Text>
                </Pressable>
              )
            })}
            {printings.more && (
              <TouchableOpacity style={styles.more} onPress={loadMore} disabled={loadingMore} accessibilityRole="button">
                {loadingMore ? (
                  <ActivityIndicator color={Colors.gold} />
                ) : (
                  <Text style={styles.moreLabel}>Load {Math.min(printings.total - list.length, 175)} more printings</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    marginTop: 12,
  },
  bodyContent: {
    paddingBottom: 12,
  },
  loading: {
    marginVertical: 32,
  },
  state: {
    gap: 14,
    paddingVertical: 12,
  },
  stateText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  prints: {
    gap: 8,
  },
  print: {
    minHeight: 76,
    paddingVertical: 9,
    paddingLeft: 9,
    paddingRight: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  printOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.10)',
  },
  thumb: {
    width: 40,
    height: 56,
    borderRadius: 4,
    backgroundColor: Colors.surface,
    boxShadow: '0 0 0 1px rgba(237,230,214,0.16)',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  titleOn: {
    color: Colors.goldLight,
  },
  meta: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  finishes: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: '#CFC7B4',
  },
  price: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
  more: {
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
