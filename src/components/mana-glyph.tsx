import Svg, { Circle, G, Path } from 'react-native-svg';

// Glyphs from the "Element Icon Set" design canvas, drawn on a 48-unit grid, plus the tap and untap
// arrows ({T}, {Q}) drawn to match.
export type GlyphKind = 'light' | 'water' | 'dark' | 'fire' | 'green' | 'none' | 'snow' | 'tap' | 'untap'

// The flame's inner core is cut out in the fire tile's own color.
const FIRE_CORE = '#ea2261'

const SPARK = 'M22 7 C23 18 27 22 38 23 C27 24 23 28 22 39 C21 28 17 24 6 23 C17 22 21 18 22 7 Z'
const SWELL = 'q4 -4.5 8 0 t8 0 t8 0 t8 0'
const CRESCENT = 'M31 10.5 A15 15 0 1 0 37.5 31 A12 12 0 0 1 31 10.5 Z'
const FLAME = 'M24 5 C27 13 36 18 36 29 A12 12 0 0 1 12 29 C12 22 16.5 18.5 18 13 C20.5 16.5 21 19.5 21.5 21.5 C24 17 25.5 11 24 5 Z'
const FLAME_CORE = 'M24 26 C26 29 29 31 29 34.5 A5 5 0 0 1 19 34.5 C19 31 22 29 24 26 Z'
const LEAF_LEFT = 'M24 29 C24 21 18 16.5 9 16.5 C9 25 15 29 24 29 Z'
const LEAF_RIGHT = 'M24 22 C24 13 30 8.5 39 8.5 C39 17.5 33 22 24 22 Z'
const HEXAGON = 'M24 8 L38 16 L38 32 L24 40 L10 32 L10 16 Z'
const SNOW_ARM = 'M24 7 V41 M19.5 11 L24 15 L28.5 11 M19.5 37 L24 33 L28.5 37'
// Tap: an arrow that rises from the bottom left and turns right. Untap is the same arrow mirrored.
const TAP_SHAFT = 'M13 38 V25 A10 10 0 0 1 23 15 H29'
const TAP_HEAD = 'M28 6.5 L39 15 L28 23.5 Z'

// `simple` is the design's 20px variant for small tiles: no dots or star, two swells instead of
// three, no flame core, and thicker strokes, so the glyph stays readable at 9-15px.
export function ManaGlyph({ kind, color, size, simple }: { kind: GlyphKind; color: string; size: number; simple?: boolean }) {
  const stroke = simple ? 5.5 : 4
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {kind === 'light' && (
        <>
          <Path d={SPARK} fill={color} />
          {!simple && <Circle cx={37} cy={10} r={3} fill={color} />}
        </>
      )}
      {kind === 'water' && (
        <G fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round">
          {(simple ? [18, 30] : [16, 24, 32]).map((y) => <Path key={y} d={`M8 ${y} ${SWELL}`} />)}
        </G>
      )}
      {kind === 'dark' && (
        <>
          <Path d={CRESCENT} fill={color} />
          {!simple && <Circle cx={38} cy={13} r={2.6} fill={color} />}
        </>
      )}
      {kind === 'fire' && (
        <>
          <Path d={FLAME} fill={color} />
          {!simple && <Path d={FLAME_CORE} fill={FIRE_CORE} />}
        </>
      )}
      {kind === 'green' && (
        <>
          <Path d="M24 41 V22" stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" />
          <Path d={LEAF_LEFT} fill={color} />
          <Path d={LEAF_RIGHT} fill={color} />
        </>
      )}
      {kind === 'none' && (
        <>
          <Path d={HEXAGON} fill="none" stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
          {!simple && <Circle cx={24} cy={24} r={3} fill={color} />}
        </>
      )}
      {(kind === 'tap' || kind === 'untap') && (
        <G transform={kind === 'untap' ? 'translate(48 0) scale(-1 1)' : undefined}>
          <Path d={TAP_SHAFT} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
          <Path d={TAP_HEAD} fill={color} />
        </G>
      )}
      {kind === 'snow' && (
        <G fill="none" stroke={color} strokeWidth={simple ? 4.5 : 3.4} strokeLinecap="round" strokeLinejoin="round">
          {[0, 60, 120].map((angle) => (
            <G key={angle} rotation={angle} origin="24, 24">
              <Path d={SNOW_ARM} />
            </G>
          ))}
        </G>
      )}
    </Svg>
  )
}
