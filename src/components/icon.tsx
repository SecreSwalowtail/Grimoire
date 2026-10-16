import { SymbolView, type SymbolViewProps } from 'expo-symbols'
import { Platform, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { ICON_BOX, MATERIAL_ICONS, MATERIAL_ICONS_BOLD } from '@/constants/material-icons'

export type IconName = SymbolViewProps['name']

// The app's icons: SF Symbols on iOS; on Android the same Material Symbols expo-symbols uses, but
// drawn as vectors exactly in the middle of their box (the icon font's glyphs sit off center, so
// icons in round and square buttons looked misplaced). A name missing from the vector set falls
// back to the font (constants/material-icons.ts lists the ones there).
export function Icon({
  name,
  size = 24,
  tintColor,
  weight,
  style,
}: {
  name: IconName
  size?: number
  tintColor?: string
  weight?: SymbolViewProps['weight']
  style?: StyleProp<ViewStyle>
}) {
  if (Platform.OS === 'android' && typeof name === 'object' && name.android) {
    const d = (weight === 'bold' && MATERIAL_ICONS_BOLD[name.android]) || MATERIAL_ICONS[name.android]
    if (d) {
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${ICON_BOX} ${ICON_BOX}`} style={style}>
          <Path d={d} fill={tintColor ?? '#FFFFFF'} />
        </Svg>
      )
    }
  }
  return <SymbolView name={name} size={size} tintColor={tintColor} weight={weight} style={style} />
}
