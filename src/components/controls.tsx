import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import { useAnimationsOff, useModalAnimation } from '@/utils/motion'

// Building blocks shared by the bottom sheets (Market sort & filters, Decks).

// Dragging a sheet down further than this, or flicking it faster (px/s), closes it.
const CLOSE_DISTANCE = 120
const CLOSE_SPEED = 900
const SETTLE = { damping: 22, stiffness: 260 }

// What a sheet's drag areas (the handle and the SheetHeader) move: the sheet's offset, and how to close.
type SheetDrag = { offset: SharedValue<number>; distance: number; close: () => void }
const SheetDragContext = createContext<SheetDrag | null>(null)

// Drag down to close; let go early and it springs back. Content below the header keeps its own
// scrolling, since only the handle and the header pick up the drag.
function useSheetPan(drag: SheetDrag) {
  const { offset, distance, close } = drag
  return Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .onChange((e) => {
      offset.set(Math.max(0, offset.get() + e.changeY))
    })
    .onEnd((e) => {
      if (offset.get() > CLOSE_DISTANCE || e.velocityY > CLOSE_SPEED) {
        offset.set(withTiming(distance, { duration: 200 }, (done) => {
          if (done) scheduleOnRN(close)
        }))
      } else {
        offset.set(withSpring(0, SETTLE))
      }
    })
}

// The part of a sheet you can drag it down by.
function DragArea({ children }: { children: ReactNode }) {
  const drag = useContext(SheetDragContext)
  if (!drag) return children
  return <DragDetector drag={drag}>{children}</DragDetector>
}

function DragDetector({ drag, children }: { drag: SheetDrag; children: ReactNode }) {
  const pan = useSheetPan(drag)
  return <GestureDetector gesture={pan}>{children}</GestureDetector>
}

// Bottom sheet over a dimmed backdrop. Closes from the backdrop, Android's back button, dragging
// it down by its handle or header, or the sheet's own buttons. Built on React Native's Modal: taps
// didn't reach React Native views inside @expo/ui's BottomSheet on Android. `fullHeight` sheets
// fill the screen below the status bar (for scrolling content); others fit their content.
export function Sheet({
  visible,
  onClose,
  fullHeight,
  children,
}: {
  visible: boolean
  onClose: () => void
  fullHeight?: boolean
  children: ReactNode
}) {
  const modalAnimation = useModalAnimation()
  // The modal window covers the whole screen, but on Android React Native lays its content out
  // as if it were the screen minus the status and navigation bars, which left the sheet floating
  // above the bottom edge. Sizing the backdrop to the full screen puts the sheet on the edge.
  const height = Dimensions.get('screen').height
  const insets = useSafeAreaInsets()
  const reducedMotion = useAnimationsOff()
  const offset = useSharedValue(0)
  // The latest onClose, for a drag that ends after the screen re-rendered.
  const latestClose = useRef(onClose)
  useEffect(() => {
    latestClose.current = onClose
  }, [onClose])
  const [drag] = useState<SheetDrag>(() => ({ offset, distance: height, close: () => latestClose.current() }))

  // A sheet dragged away is still down there: bring it back up for the next opening.
  useEffect(() => {
    if (visible) offset.set(0)
  }, [visible, offset])

  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }))

  return (
    <Modal
      visible={visible}
      transparent
      animationType={modalAnimation}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* Gestures inside a Modal need their own root on Android. */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={[styles.sheetRoot, { height }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          <Animated.View style={dragStyle}>
            <Animated.View
              entering={reducedMotion ? undefined : SlideInDown.duration(280)}
              style={[
                styles.sheet,
                { paddingBottom: insets.bottom + 12 },
                fullHeight ? { height: height - insets.top - 12 } : { maxHeight: height - insets.top - 12 },
              ]}
              accessibilityViewIsModal
            >
              <SheetDragContext.Provider value={drag}>
                <DragArea>
                  <View style={styles.handleArea}>
                    <View style={styles.handle} />
                  </View>
                </DragArea>
                {children}
              </SheetDragContext.Provider>
            </Animated.View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

// Title, optional Reset, and a close button unless `onClose` is left out (then the sheet closes by
// dragging it down, the backdrop, or going back). `onBack`: a back button before the title, for a
// step inside the sheet. The sheet can be dragged down by its header.
export function SheetHeader({
  title,
  onClose,
  onReset,
  onBack,
}: {
  title: string
  onClose?: () => void
  onReset?: () => void
  onBack?: () => void
}) {
  return (
    <DragArea>
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity style={styles.close} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
            <Icon name={{ ios: 'chevron.left', android: 'chevron_left' }} size={18} tintColor={Colors.text} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle} accessibilityRole="header">{title}</Text>
        {onReset && (
          <TouchableOpacity style={styles.reset} onPress={onReset} accessibilityRole="button">
            <Text style={styles.resetLabel}>Reset</Text>
          </TouchableOpacity>
        )}
        {onClose && (
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Icon name={{ ios: 'xmark', android: 'close' }} size={18} tintColor={Colors.text} />
          </TouchableOpacity>
        )}
      </View>
    </DragArea>
  )
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text style={styles.sectionLabel} accessibilityRole="header">{children}</Text>
    </View>
  )
}

type SegmentOption<T> = { value: T; label: string; dot?: string }

// Pill-shaped radio group. `small` is the compact version used next to a section label, sized to
// its labels; `fill` makes a small one share out the full width instead.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  small,
  fill,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  small?: boolean
  fill?: boolean
}) {
  return (
    <View style={[styles.segmented, small && styles.segmentedSmall]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={option.value}
            style={[styles.segment, small && styles.segmentSmall, small && fill && styles.segmentFill, selected && styles.segmentSelected]}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
          >
            {option.dot && <View style={[styles.segmentDot, { backgroundColor: option.dot }]} />}
            <Text
              style={[styles.segmentLabel, small && styles.segmentLabelSmall, selected && styles.segmentLabelSelected]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Gold on/off switch from the design (the native switches can't take the gold colors).
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <Pressable
      style={[styles.track, value && styles.trackOn]}
      onPress={() => onChange(!value)}
      hitSlop={6}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
    >
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  )
}

// Title + explanation + Toggle. `bare` drops the card background, for rows grouped in one card.
export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  bare,
  style,
}: {
  title: string
  subtitle: string
  value: boolean
  onChange: (value: boolean) => void
  bare?: boolean
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.toggleRow, !bare && styles.card, style]}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
      <Toggle value={value} onChange={onChange} label={title} />
    </View>
  )
}

// Selectable pill (formats, rarities). `dot` adds a colored dot before the label.
export function Chip({
  label,
  selected,
  onPress,
  dot,
  style,
}: {
  label: string
  selected: boolean
  onPress: () => void
  dot?: string
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {dot && <View style={[styles.chipDot, { backgroundColor: dot }]} />}
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

export function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.primary} onPress={onPress} accessibilityRole="button">
      <Text style={styles.primaryLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  sheetRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8,7,6,0.6)',
  },
  sheet: {
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: 'rgba(23,21,15,0.97)',
    boxShadow: '0 -24px 60px rgba(0,0,0,0.55)',
  },
  gestureRoot: {
    flex: 1,
  },
  // A taller strip than the handle itself, so it's easy to grab.
  handleArea: {
    marginTop: -10,
    paddingTop: 10,
    paddingBottom: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(237,230,214,0.22)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 32,
    lineHeight: 36,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  reset: {
    height: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  resetLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  segmented: {
    height: 46,
    padding: 4,
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
  },
  segmentedSmall: {
    height: 38,
    padding: 3,
    gap: 2,
    borderRadius: 10,
  },
  segment: {
    flex: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentSmall: {
    flex: 0,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  segmentFill: {
    flex: 1,
    paddingHorizontal: 4,
  },
  segmentSelected: {
    backgroundColor: Colors.selected,
  },
  segmentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  segmentLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.textSecondary,
  },
  segmentLabelSmall: {
    fontSize: 12,
  },
  segmentLabelSelected: {
    color: Colors.text,
  },
  track: {
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2E2A22',
    justifyContent: 'center',
  },
  trackOn: {
    backgroundColor: Colors.gold,
  },
  knob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginLeft: 3,
    backgroundColor: Colors.textSecondary,
  },
  knobOn: {
    marginLeft: 23,
    backgroundColor: Colors.onGold,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
  },
  toggleRow: {
    minHeight: 66,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleText: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  toggleSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  chip: {
    height: 38,
    paddingHorizontal: 13,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipSelected: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.14)',
  },
  chipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  chipLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: '#CFC7B4',
  },
  chipLabelSelected: {
    color: '#F0D8A0',
  },
  primary: {
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
})
