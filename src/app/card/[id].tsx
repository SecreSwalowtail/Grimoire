import { BlurTargetView } from 'expo-blur';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddToDeckSheet, copiesNeeded } from '@/components/card/add-to-deck-sheet';
import { TiltSensor } from '@/components/card-effects/tilt';
import { CardTabs, TOP_BAR, TopBar, type CardTab } from '@/components/card/card-chrome';
import { CardZoom, type ZoomFrom } from '@/components/card/card-zoom';
import { CopySheet } from '@/components/card/copy-sheet';
import { ACTIONS_HEIGHT, CardHero, HeroBackdrop, OverviewActions, OverviewTab } from '@/components/card/overview-tab';
import { PricesTab } from '@/components/card/prices-tab';
import { PrintingsTab } from '@/components/card/printings-tab';
import { RulesTab } from '@/components/card/rules-tab';
import { NewSheet } from '@/components/decks/new-sheet';
import { Colors, Fonts } from '@/constants/theme';
import { upsertCard } from '@/db/cards';
import type { CollectionEntry, Finish } from '@/db/collection';
import type { ScryfallCard } from '@/db/scryfall';
import { mainFinish } from '@/utils/card-prices';
import { useCard, useLocalCardData, useOracleData } from '@/utils/use-card-detail';
import { cardInfoOf, cardUse, setDeckCardCount, useDeckStore, type Board } from '@/utils/deck-store';
import { record } from '@/utils/perf';

// Card detail (design C1–C6): opened from a Binder card or a Market row with the printing's
// Scryfall id. Overview / Prices / Printings / Rules are tabs on one screen; picking another
// printing in Printings shows that printing everywhere. Price alerts are left out on purpose.
export default function CardScreen() {
  const insets = useSafeAreaInsets()
  const db = useSQLiteContext()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [viewingId, setViewingId] = useState(id)
  const [tab, setTab] = useState<CardTab>('overview')
  const [face, setFace] = useState(0)
  const [copySheet, setCopySheet] = useState<{ entry: CollectionEntry | null } | null>(null)
  const [deckSheet, setDeckSheet] = useState(false)
  const [newDeckBoard, setNewDeckBoard] = useState<Board | null>(null)
  // The finish picked on the Prices tab (null: the printing's main one).
  const [priceFinish, setPriceFinish] = useState<Finish | null>(null)
  const scroll = useRef<ScrollView>(null)
  // Phone tilt for the hero card and holographic thumbnails (see the TiltSensor below).
  const tiltX = useSharedValue(0)
  const tiltY = useSharedValue(0)
  const [tilt] = useState(() => ({ x: tiltX, y: tiltY }))
  const isFocused = useIsFocused()
  const reducedMotion = useReducedMotion()
  // The hero card held out to full screen (card-zoom.tsx), and whether it's on its way back.
  const [zoom, setZoom] = useState<{ from: ZoomFrom; closing: boolean } | null>(null)
  // The page the zoomed card blurs (Android needs it named; iOS blurs whatever is underneath).
  const page = useRef<View>(null)
  // Going back (swipe, Android's back button) puts the card down instead of leaving the screen.
  usePreventRemove(zoom != null, () => setZoom((z) => z && { ...z, closing: true }))

  const { card, failed, missing, retry } = useCard(viewingId)
  const { printings, rulings, loadMore, loadingMore } = useOracleData(card, tab === 'rules')
  const { copies, history, reloadCopies } = useLocalCardData(card)
  const store = useDeckStore()

  // Performance pass: time from opening the screen to having the card to show.
  const [openedAt] = useState(() => Date.now())
  const timedOpen = useRef(false)
  useEffect(() => {
    if (!card || timedOpen.current) return
    timedOpen.current = true
    record('card detail: open → card ready', Date.now() - openedAt)
  }, [card, openedAt])

  const openTab = (next: CardTab) => {
    setTab(next)
    scroll.current?.scrollTo({ y: 0, animated: false })
  }

  if (!card) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          {failed ? (
            <>
              <Text style={styles.stateTitle}>Couldn&apos;t load this card</Text>
              <Text style={styles.stateText}>Check your connection and try again.</Text>
              <TouchableOpacity style={styles.retry} onPress={retry} accessibilityRole="button">
                <Text style={styles.retryLabel}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : missing ? (
            <>
              <Text style={styles.stateTitle}>Card not found</Text>
              <Text style={styles.stateText}>Scryfall doesn&apos;t know this printing any more.</Text>
            </>
          ) : (
            <ActivityIndicator color={Colors.gold} />
          )}
        </View>
        <TopBar />
      </View>
    )
  }

  const owned = copies.reduce((n, c) => n + c.quantity, 0)
  // Another printing may not come in the finish picked before.
  const finish = priceFinish && (card.finishes ?? ['nonfoil']).includes(priceFinish) ? priceFinish : mainFinish(card)
  const headerFoil = tab === 'prices' && finish !== 'nonfoil'
  const use = cardUse(card.name, store)
  const decksUsing = [...use.values()].filter((c) => c.main + c.side > 0).length
  const prices = (printings?.list ?? [])
    .map((p) => Number(p.prices.eur ?? p.prices.eur_foil ?? NaN))
    .filter((v) => Number.isFinite(v))
  const cheapest = prices.length ? Math.min(...prices) : null
  const firstPrinting = (printings?.list ?? []).reduce<ScryfallCard | null>(
    (first, p) => (!first || (p.released_at ?? '') < (first.released_at ?? '') ? p : first),
    null,
  )

  const pickPrinting = (printing: ScryfallCard) => {
    setViewingId(printing.id)
    setFace(0)
  }

  const putInNewDeck = async (deckId: string) => {
    if (newDeckBoard == null) return
    await upsertCard(db, card).catch(() => undefined)
    setDeckCardCount(deckId, card.id, cardInfoOf(card), newDeckBoard, 1)
  }

  return (
    <View style={styles.root}>
      <BlurTargetView ref={page} style={styles.page}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + TOP_BAR,
            paddingBottom: tab === 'overview' ? ACTIONS_HEIGHT + insets.bottom + 24 : insets.bottom + 40,
          },
        ]}
      >
        {/* Every tab shows the same hero; a foil finish picked on Prices makes the card holographic. */}
        <HeroBackdrop card={card} face={face} />
        <CardHero
          card={card}
          face={face}
          tilt={tilt}
          foil={headerFoil}
          hidden={zoom != null}
          onFlip={() => setFace(face === 0 ? 1 : 0)}
          onZoom={(from) => setZoom({ from, closing: false })}
        />
        <View style={styles.tabs}>
          <CardTabs tab={tab} onChange={openTab} />
        </View>

        {tab === 'overview' && (
          <OverviewTab
            card={card}
            copies={copies}
            history={history}
            decksUsing={decksUsing}
            copiesNeeded={copiesNeeded(store, card.name)}
            onTab={openTab}
            onAddToDeck={() => setDeckSheet(true)}
          />
        )}
        {tab === 'prices' && (
          <PricesTab card={card} history={history} copies={copies} finish={finish} onFinish={setPriceFinish} />
        )}
        {tab === 'printings' && (
          <PrintingsTab
            card={card}
            printings={printings}
            loadMore={loadMore}
            loadingMore={loadingMore}
            copies={copies}
            onPick={pickPrinting}
            onEditCopy={(entry) => setCopySheet({ entry })}
            onAddCopy={() => setCopySheet({ entry: null })}
          />
        )}
        {tab === 'rules' && <RulesTab card={card} rulings={rulings} firstPrinting={firstPrinting} />}
      </ScrollView>

      <TopBar />
      {tab === 'overview' && (
        <OverviewActions onAddToDeck={() => setDeckSheet(true)} onAddCopy={() => setCopySheet({ entry: null })} />
      )}
      </BlurTargetView>

      {/* The hero card tilts with the phone on every tab, and so does the held-out card. */}
      {isFocused && !reducedMotion && <TiltSensor tilt={tilt} />}
      {zoom && (
        <CardZoom
          card={card}
          face={face}
          foil={headerFoil || !(card.finishes ?? ['nonfoil']).includes('nonfoil')}
          from={zoom.from}
          closing={zoom.closing}
          tilt={tilt}
          blurTarget={page}
          onClose={() => setZoom({ ...zoom, closing: true })}
          onClosed={() => setZoom(null)}
        />
      )}

      <CopySheet
        visible={copySheet != null}
        card={card}
        entry={copySheet?.entry ?? null}
        onClose={() => setCopySheet(null)}
        onSaved={() => {
          reloadCopies().catch(() => undefined)
        }}
        tilt={tilt}
        onChangePrinting={() => {
          setCopySheet(null)
          openTab('printings')
        }}
      />
      <AddToDeckSheet
        visible={deckSheet}
        card={card}
        owned={owned}
        cheapest={cheapest}
        onClose={() => setDeckSheet(false)}
        onNewDeck={(board) => {
          setDeckSheet(false)
          setNewDeckBoard(board)
        }}
      />
      <NewSheet
        visible={newDeckBoard != null}
        kind="deck"
        onClose={() => {
          // Back to Add to deck, where the new deck now holds the card.
          setNewDeckBoard(null)
          setDeckSheet(true)
        }}
        onDeckCreated={putInNewDeck}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  page: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  tabs: {
    marginTop: 22,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  stateTitle: {
    fontSize: 28,
    fontFamily: Fonts.serif,
    color: Colors.text,
    textAlign: 'center',
  },
  stateText: {
    marginTop: 6,
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  retry: {
    marginTop: 18,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
  },
  retryLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
})
