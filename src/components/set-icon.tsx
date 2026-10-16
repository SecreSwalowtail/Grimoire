import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SvgXml } from 'react-native-svg'

import { Fonts } from '@/constants/theme'

// A set's symbol (Scryfall's SVG), drawn in `color`. Until it has loaded, or if it can't, the set
// code shows instead. `uri`: the set's icon_svg_uri (some sets share another set's symbol); without
// it the symbol is looked up by the code.

// Each symbol is downloaded once per session. A failed download is asked again next time.
const symbols = new Map<string, Promise<string | null>>()

function symbolXml(uri: string) {
  let xml = symbols.get(uri)
  if (!xml) {
    xml = fetch(uri)
      .then((res) => (res.ok ? res.text() : null))
      // Drawn in black: every fill (not "none") becomes the color given.
      .then((text) => text && text.replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"').replace(/fill:\s*#[0-9a-fA-F]{3,8}/g, 'fill:currentColor'))
      .catch(() => {
        symbols.delete(uri)
        return null
      })
    symbols.set(uri, xml)
  }
  return xml
}

export function SetIcon({ code, uri, size, color }: { code: string; uri?: string; size: number; color: string }) {
  const src = uri ?? `https://svgs.scryfall.io/sets/${code.toLowerCase()}.svg`
  const [xml, setXml] = useState<{ src: string; value: string | null } | null>(null)

  useEffect(() => {
    let live = true
    symbolXml(src).then((value) => live && setXml({ src, value }))
    return () => {
      live = false
    }
  }, [src])

  const shown = xml?.src === src ? xml.value : null
  if (!shown) {
    return (
      <Text style={[styles.code, { color }]} numberOfLines={1}>
        {code.toUpperCase()}
      </Text>
    )
  }
  return (
    <View accessible accessibilityLabel={`${code.toUpperCase()} set symbol`}>
      <SvgXml xml={shown} width={size} height={size} color={color} fill={color} />
    </View>
  )
}

const styles = StyleSheet.create({
  code: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    letterSpacing: 0.5,
  },
})
