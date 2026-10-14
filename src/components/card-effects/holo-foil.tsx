import { Canvas, Fill, Image, Shader, Skia, useImage, type SkSize } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import type { Tilt } from '@/components/card-effects/tilt';

// Rainbow bands that slide with the phone's tilt, plus a bright spot that follows the light,
// like the holographic layer of a real foil card. Output is premultiplied (rgb <= alpha).
const HOLO = Skia.RuntimeEffect.Make(`
uniform float2 size;
uniform float2 tilt;

half4 main(float2 pos) {
  float2 uv = pos / size;
  float t = (uv.x * 0.8 + uv.y) * 1.6 + tilt.x * 1.2 + tilt.y * 0.8;
  float3 rainbow = 0.5 + 0.5 * cos(6.2831 * (t + float3(0.0, 0.33, 0.67)));
  float2 light = float2(0.5 - tilt.x * 0.45, 0.4 - tilt.y * 0.45);
  float glare = smoothstep(0.65, 0.0, distance(uv, light));
  float a = 0.22 + 0.38 * glare;
  return half4(half3(rainbow * a), half(a));
}
`)!

// Draws the card image with the holographic layer blended on top (color dodge, as on real foils).
// It is the foil card's only image (no <Image> underneath), so the picture is downloaded once.
// Skia redraws only when the tilt changes; pass FLAT for off-screen cards so they never redraw.
export function HoloFoil({ uri, tilt }: { uri: string; tilt: Tilt }) {
  const image = useImage(uri)
  const size = useSharedValue<SkSize>({ width: 0, height: 0 })
  const width = useDerivedValue(() => size.get().width)
  const height = useDerivedValue(() => size.get().height)
  const uniforms = useDerivedValue(() => ({
    size: [Math.max(1, size.get().width), Math.max(1, size.get().height)],
    tilt: [tilt.x.get(), tilt.y.get()],
  }))

  if (!image) return null
  return (
    <Canvas style={StyleSheet.absoluteFill} onSize={size} pointerEvents="none">
      <Image image={image} x={0} y={0} width={width} height={height} fit="cover" />
      <Fill blendMode="colorDodge">
        <Shader source={HOLO} uniforms={uniforms} />
      </Fill>
    </Canvas>
  )
}
