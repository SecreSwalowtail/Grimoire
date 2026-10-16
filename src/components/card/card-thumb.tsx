import { Image } from 'expo-image'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { HoloFoil } from '@/components/card-effects/holo-foil'
import type { Tilt } from '@/components/card-effects/tilt'
import { Colors } from '@/constants/theme'

// A small card picture for Card detail. With `foil` (a foil finish is picked) it gets the same
// holographic layer as foil cards in the Binder, moving with `tilt`.
export function CardThumb({
  uri,
  foil,
  tilt,
  style,
  radius = 5,
}: {
  uri: string | null
  foil?: boolean
  tilt: Tilt
  // Size, margins and shadow. The picture inside is clipped to `radius`.
  style?: StyleProp<ViewStyle>
  radius?: number
}) {
  return (
    <View style={[{ borderRadius: radius }, style]}>
      <View style={[styles.clip, { borderRadius: radius }]}>
        {foil && uri ? (
          <HoloFoil uri={uri} tilt={tilt} />
        ) : (
          <Image source={{ uri: uri ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  clip: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
})
