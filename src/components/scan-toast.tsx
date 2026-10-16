import { Image } from 'expo-image'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import { capitalize } from '@/utils/format'
import { useMoney } from '@/utils/money'

export type ScanToastData =
  | {
      ok: true
      name: string
      set: string
      rarity: string
      // Cardmarket's price in euros, as Scryfall gives it.
      price: string | null
      image: string | null
    }
  | { ok: false; title: string; message: string }

// "Last scanned card" card from the Scan design: thumbnail, result, details, Undo. `where`: what the
// card went into ("Main binder + Izzet Wizards").
export function ScanToast({ data, where = 'Binder', onUndo }: { data: ScanToastData; where?: string; onUndo?: () => void }) {
  const money = useMoney()
  if (!data.ok) {
    return (
      <View style={[styles.toast, styles.toastError]} accessibilityRole="alert">
        <View style={styles.body}>
          <Text style={[styles.label, { color: Colors.negative }]}>{data.title}</Text>
          <Text style={styles.detail} numberOfLines={2}>{data.message}</Text>
        </View>
      </View>
    )
  }

  const rarity = capitalize(data.rarity)
  return (
    <View style={styles.toast} accessibilityLabel={`Added ${data.name} to ${where}`}>
      {data.image ? (
        <Image source={{ uri: data.image }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={styles.thumb} />
      )}
      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Icon name={{ ios: 'checkmark', android: 'check' }} size={13} tintColor={Colors.positive} />
          <Text style={[styles.label, styles.where, { color: Colors.positive }]} numberOfLines={1}>Added to {where}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>{data.name}</Text>
        <Text style={styles.detail} numberOfLines={1}>
          {data.set} · {rarity}
          {data.price != null && <Text style={styles.price}> · {money.eur(Number(data.price))}</Text>}
        </Text>
      </View>
      {onUndo && (
        <TouchableOpacity style={styles.undo} onPress={onUndo} accessibilityRole="button">
          <Text style={styles.undoLabel}>Undo</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  toast: {
    alignSelf: 'stretch',
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(23,21,15,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toastError: {
    borderColor: 'rgba(232,134,106,0.4)',
  },
  thumb: {
    width: 38,
    height: 52,
    borderRadius: 5,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.15)',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  // A long destination shortens rather than wrapping.
  where: {
    flexShrink: 1,
  },
  label: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  name: {
    marginTop: 2,
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  detail: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  price: {
    fontFamily: Fonts.bold,
    color: Colors.goldLight,
  },
  undo: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.16)',
    justifyContent: 'center',
  },
  undoLabel: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
})
