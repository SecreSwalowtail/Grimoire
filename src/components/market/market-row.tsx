import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ManaSymbol, parseManaCost } from '@/components/mana-symbol';
import { Colors, Fonts, RarityColors } from '@/constants/theme';
import { cardImage, cardManaCost, cardThumb, rememberCard, type ScryfallCard } from '@/db/scryfall';
import { formatUsd, type PriceSource } from '@/utils/card-prices';
import { capitalize, formatEur } from '@/utils/format';

// Rows and tiles open Card detail; it gets the card from memory, so it opens without a request.
// The design's weekly ▲/▼ % under the price needs price history we don't have for search results yet.

// The chosen market's price: non-foil, else foil (else etched, on TCGplayer).
function price(card: ScryfallCard, source: PriceSource) {
  const p = card.prices
  if (source === 'cardmarket') {
    const eur = p.eur ?? p.eur_foil
    return eur != null ? formatEur(Number(eur)) : '—'
  }
  const usd = p.usd ?? p.usd_foil ?? p.usd_etched
  return usd != null ? formatUsd(Number(usd)) : '—'
}

// fromDeck: the deck whose + opened the Market; adding the card to a deck then goes back to it.
function open(card: ScryfallCard, fromDeck?: string) {
  rememberCard(card)
  router.push({ pathname: '/card/[id]', params: fromDeck ? { id: card.id, fromDeck } : { id: card.id } })
}

function label(card: ScryfallCard, source: PriceSource) {
  return `${card.name}, ${card.set.toUpperCase()} ${capitalize(card.rarity)}, ${price(card, source)}`
}

// List view: thumbnail, name (+ language if not English), mana cost, rarity · set, price.
export function MarketRow({ card, source, fromDeck }: { card: ScryfallCard; source: PriceSource; fromDeck?: string }) {
  const cost = parseManaCost(cardManaCost(card))
  return (
    <Pressable style={styles.row} onPress={() => open(card, fromDeck)} accessibilityRole="button" accessibilityLabel={label(card, source)}>
      <Image source={{ uri: cardThumb(card) ?? undefined }} style={styles.thumb} contentFit="cover" transition={120} />
      <View style={styles.middle}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{card.name}</Text>
          {card.lang !== 'en' && <Text style={styles.lang}>{card.lang.toUpperCase()}</Text>}
        </View>
        <View style={styles.metaRow}>
          {cost.length > 0 && (
            <View style={styles.cost}>
              {cost.map((symbol, i) => <ManaSymbol key={i} symbol={symbol} />)}
            </View>
          )}
          <View style={[styles.dot, { backgroundColor: RarityColors[card.rarity] ?? Colors.textMuted }]} />
          <Text style={styles.meta} numberOfLines={1}>{card.set.toUpperCase()} · {capitalize(card.rarity)}</Text>
        </View>
      </View>
      <Text style={styles.price}>{price(card, source)}</Text>
    </Pressable>
  )
}

// Grid view: the card image with name and price under it, 3 per row like the Binder.
export function MarketTile({ card, source, fromDeck }: { card: ScryfallCard; source: PriceSource; fromDeck?: string }) {
  return (
    <Pressable style={styles.tile} onPress={() => open(card, fromDeck)} accessibilityRole="button" accessibilityLabel={label(card, source)}>
      <Image source={{ uri: cardImage(card) ?? undefined }} style={styles.tileImage} contentFit="cover" transition={150} />
      <Text style={styles.tileName} numberOfLines={1}>{card.name}</Text>
      <Text style={styles.tilePrice}>{price(card, source)}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(237,230,214,0.07)',
  },
  thumb: {
    width: 42,
    height: 58,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
  },
  middle: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  lang: {
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(74,144,208,0.18)',
    lineHeight: 20,
    fontSize: 11,
    fontFamily: Fonts.extraBold,
    color: '#9EC6EC',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cost: {
    flexDirection: 'row',
    gap: 2,
    marginRight: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  meta: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  price: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  tile: {
    flex: 1,
    minWidth: 0,
  },
  tileImage: {
    aspectRatio: 63 / 88,
    marginBottom: 8,
    borderRadius: 6,
    backgroundColor: Colors.surface,
  },
  tileName: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  tilePrice: {
    marginTop: 3,
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
})
