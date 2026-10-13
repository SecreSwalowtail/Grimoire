import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, RarityColors } from '@/constants/theme';
import { entryPrice, type CollectionEntry } from '@/db/collection';
import { capitalize, formatEur } from '@/utils/format';

// Magic cards are 63 × 88 mm.
const CARD_RATIO = 63 / 88

// One card in the 3-column Binder grid: full card image with quantity / foil badges,
// name, and set code + price. Rarity is shown by the dot (and spoken by screen readers).
export function CardTile({ entry }: { entry: CollectionEntry }) {
  const price = entryPrice(entry)
  const foil = entry.finish !== 'nonfoil'
  const set = entry.set_code.toUpperCase()
  return (
    <View
      style={styles.tile}
      accessible
      accessibilityLabel={`${entry.name}, ${entry.quantity} ${entry.quantity === 1 ? 'copy' : 'copies'}${foil ? `, ${entry.finish}` : ''}, ${set} ${capitalize(entry.rarity)}, ${price != null ? formatEur(price) : 'no price'}`}
    >
      <View style={styles.card}>
        <Image source={{ uri: entry.image_uri ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        {entry.quantity > 1 && <Text style={[styles.badge, styles.qty]}>×{entry.quantity}</Text>}
        {foil && (
          <View style={[styles.badge, styles.foil]}>
            <SymbolView name={{ ios: 'sparkle', android: 'auto_awesome' }} size={11} tintColor={Colors.goldLight} />
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>{entry.name}</Text>
      <View style={styles.meta}>
        <View style={styles.setRow}>
          <View style={[styles.dot, { backgroundColor: RarityColors[entry.rarity] ?? Colors.textMuted }]} />
          <Text style={styles.set} numberOfLines={1}>{set}</Text>
        </View>
        <Text style={styles.price} numberOfLines={1}>{price != null ? formatEur(price) : '—'}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    aspectRatio: CARD_RATIO,
    marginBottom: 8,
    // Real cards have ~3 mm corners on 63 mm: about 5% of the width.
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(237,230,214,0.12)',
  },
  badge: {
    position: 'absolute',
    top: 6,
    height: 20,
    minWidth: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(14,13,11,0.8)',
    overflow: 'hidden',
  },
  qty: {
    left: 6,
    paddingHorizontal: 6,
    lineHeight: 20,
    fontSize: 11,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    textAlign: 'center',
  },
  foil: {
    right: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    minHeight: 32,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  meta: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  setRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  set: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    letterSpacing: 0.3,
    color: Colors.textSecondary,
  },
  price: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
})
