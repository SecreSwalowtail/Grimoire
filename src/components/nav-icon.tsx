import type { ColorValue } from 'react-native'
import Svg, { Circle, G, Path, Rect } from 'react-native-svg'

// Bottom tab icons from the "Element Icon Set" design canvas (NavIcon), drawn on a 24-unit grid.
type NavIconKind = 'binder' | 'market' | 'scan' | 'decks' | 'settings'

// `bg` is the color behind the icon: Decks and Settings fill some shapes with it, so the lines
// they overlap are hidden.
export function NavIcon({ kind, color, bg, size = 24 }: { kind: NavIconKind; color: ColorValue; bg: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G
        fill="none"
        stroke={color}
        strokeWidth={kind === 'scan' ? 1.9 : 1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === 'binder' && (
          <>
            {/* Binder with ring tabs and a 2 × 2 page of cards */}
            <Rect x={5.5} y={3} width={15} height={18} rx={2.2} />
            <Path d="M3.5 7.5h4 M3.5 12h4 M3.5 16.5h4" />
            <G stroke="none" fill={color}>
              <Rect x={9.6} y={6.6} width={3.6} height={4.6} rx={0.8} />
              <Rect x={14.2} y={6.6} width={3.6} height={4.6} rx={0.8} />
              <Rect x={9.6} y={12.8} width={3.6} height={4.6} rx={0.8} />
              <Rect x={14.2} y={12.8} width={3.6} height={4.6} rx={0.8} />
            </G>
          </>
        )}
        {kind === 'market' && (
          <>
            {/* Price tag with a sparkle */}
            <Path d="M12.6 3H5a2 2 0 0 0-2 2v7.6a2 2 0 0 0 .6 1.4l7.4 7.4a2 2 0 0 0 2.8 0l6.2-6.2a2 2 0 0 0 0-2.8L14 3.6A2 2 0 0 0 12.6 3Z" />
            <Circle cx={7.5} cy={7.5} r={1.3} fill={color} stroke="none" />
            <Path
              d="M14 10 C14.3 12.9 15.1 13.7 18 14 C15.1 14.3 14.3 15.1 14 18 C13.7 15.1 12.9 14.3 10 14 C12.9 13.7 13.7 12.9 14 10 Z"
              fill={color}
              stroke="none"
            />
          </>
        )}
        {kind === 'scan' && (
          <>
            {/* Viewfinder corners around a card */}
            <Path d="M3.5 8V5.5a2 2 0 0 1 2-2H8 M16 3.5h2.5a2 2 0 0 1 2 2V8 M20.5 16v2.5a2 2 0 0 1-2 2H16 M8 20.5H5.5a2 2 0 0 1-2-2V16" />
            <Rect x={8.25} y={6.75} width={7.5} height={10.5} rx={1.3} />
            <Path d="M10.4 14.3h3.2" />
          </>
        )}
        {kind === 'decks' && (
          <>
            {/* Two fanned cards with a gem */}
            <Rect x={4} y={5} width={10} height={14} rx={1.6} rotation={-12} origin="9, 12" />
            <Rect x={10} y={5} width={10} height={14} rx={1.6} fill={bg} />
            <Path d="M15 9.8 L17.2 12 L15 14.2 L12.8 12 Z" fill={color} stroke="none" />
          </>
        )}
        {kind === 'settings' && (
          <>
            {/* Three sliders with gem knobs */}
            <Path d="M3.5 6.5h17 M3.5 12h17 M3.5 17.5h17" />
            <Path d="M9 4.1 L11.4 6.5 L9 8.9 L6.6 6.5 Z" fill={bg} />
            <Path d="M15.5 9.6 L17.9 12 L15.5 14.4 L13.1 12 Z" fill={bg} />
            <Path d="M7.5 15.1 L9.9 17.5 L7.5 19.9 L5.1 17.5 Z" fill={bg} />
          </>
        )}
      </G>
    </Svg>
  )
}
