import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { ManaSymbol, parseManaCost } from '@/components/mana-symbol';
import { Colors, Fonts, RarityColors } from '@/constants/theme';
import { cardImage, cardManaCost, cardThumb, type ScryfallCard } from '@/db/scryfall';
import { capitalize, formatEur } from '@/utils/format';

// Not tappable yet: rows will open Card detail once that screen exists.
// The design's weekly ▲/▼ % under the price needs price history we don't have for search results yet.

function price(card: ScryfallCard) {
  const eur = card.prices.eur ?? card.prices.eur_foil
  return eur != null ? formatEur(Number(eur)) : '—'
}

function label(card: ScryfallCard) {
  return `${card.name}, ${card.set.toUpperCase()} ${capitalize(card.rarity)}, ${price(card)}`
}

// List view: thumbnail, name (+ language if not English), mana cost, rarity · set, price.
export function MarketRow({ card }: { card: ScryfallCard }) {
  const cost = parseManaCost(cardManaCost(card))
  return (
    <View style={styles.row} accessible accessibilityLabel={label(card)}>
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
      <Text style={styles.price}>{price(card)}</Text>
    </View>
  )
}

// Grid view: the card image with name and price under it, 3 per row like the Binder.
export function MarketTile({ card }: { card: ScryfallCard }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={label(card)}>
      <Image source={{ uri: cardImage(card) ?? undefined }} style={styles.tileImage} contentFit="cover" transition={150} />
      <Text style={styles.tileName} numberOfLines={1}>{card.name}</Text>
      <Text style={styles.tilePrice}>{price(card)}</Text>
    </View>
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
