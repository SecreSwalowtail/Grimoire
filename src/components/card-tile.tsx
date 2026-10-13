import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, RarityColors } from '@/constants/theme';
import { entryPrice, type CollectionEntry } from '@/db/collection';
import { artCropUri, capitalize, formatEur } from '@/utils/format';

// One card in the Binder grid: artwork with quantity / foil badges, name, set · rarity, price.
export function CardTile({ entry }: { entry: CollectionEntry }) {
  const price = entryPrice(entry)
  const foil = entry.finish !== 'nonfoil'
  return (
    <View style={styles.tile}>
      <View style={styles.art}>
        <Image source={{ uri: artCropUri(entry.image_uri) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        <View style={styles.innerBorder} />
        <Text style={[styles.badge, styles.qty]}>×{entry.quantity}</Text>
        {foil && (
          <View style={[styles.badge, styles.foil]}>
            <SymbolView name={{ ios: 'sparkle', android: 'auto_awesome' }} size={12} tintColor={Colors.goldLight} />
            <Text style={styles.foilLabel}>{entry.finish === 'etched' ? 'Etched' : 'Foil'}</Text>
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>{entry.name}</Text>
      <View style={styles.meta}>
        <View style={styles.setRow}>
          <View style={[styles.dot, { backgroundColor: RarityColors[entry.rarity] ?? Colors.textMuted }]} />
          <Text style={styles.set} numberOfLines={1}>
            {entry.set_code.toUpperCase()} · {capitalize(entry.rarity)}
          </Text>
        </View>
        <Text style={styles.price}>{price != null ? formatEur(price) : '—'}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    gap: 4,
  },
  art: {
    height: 150,
    marginBottom: 6,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  innerBorder: {
    position: 'absolute',
    top: 7,
    left: 7,
    right: 7,
    bottom: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.14)',
  },
  badge: {
    position: 'absolute',
    top: 12,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(14,13,11,0.75)',
    overflow: 'hidden',
  },
  qty: {
    left: 12,
    paddingHorizontal: 9,
    lineHeight: 24,
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  foil: {
    right: 12,
    paddingLeft: 7,
    paddingRight: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  foilLabel: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  name: {
    minHeight: 38,
    fontSize: 15,
    lineHeight: 19,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  setRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  set: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  price: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
})
