import TextRecognition from '@react-native-ml-kit/text-recognition';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useIsFocused } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutRectangle, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  CameraRef,
  CommonResolutions,
  Frame,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
} from 'react-native-vision-camera';

import { scanDecks, ScanTargetSheet, scanTargetLabel } from '@/components/scan-target-sheet';
import { ScanToast, ScanToastData } from '@/components/scan-toast';
import { Colors, Fonts } from '@/constants/theme';
import { getBinders, type Binder } from '@/db/binders';
import { addToCollection, removeOneCopy } from '@/db/collection';
import { cardImage, getCardBySetNumber, getSets, type ScryfallCard } from '@/db/scryfall';
import { onCapturePress, setScanMode, useScanMode } from '@/utils/capture-button';
import { NormalizedRect, processCardFrame, ScanState, ScanStatus } from '@/utils/card-scan';
import { ocrRows, parseCollectorLine } from '@/utils/collector-line';
import { addCardsToDecks, cardInfoOf, getDeckStore, useDeckStore, type Undo } from '@/utils/deck-store';
import { getScanTarget, useScanTarget, type ScanTarget } from '@/utils/scan-target';

// Where the set code + collector number sit on a card, as fractions of the card: the bottom-left
// corner, with room around it (it reaches past the card's edges) because the card found in the
// photo can be off by a few percent. In test scans the two lines sat between 88% and 105% of the
// card's height and left of 45% of its width; a small strip reads much faster than a big one.
// The text in it is found by what it says, not where it is.
const STRIP = { x: -0.03, y: 0.84, width: 0.48, height: 0.23 }
// Photos taken of one card before giving up on reading it.
const MAX_ATTEMPTS = 2

const BRACKET_COLORS: Record<ScanState, string> = {
  searching: Colors.goldLight,
  adjusting: Colors.goldLight,
  ready: Colors.positive,
  done: Colors.positive,
}

export default function ScanScreen() {
  const camera = useRef<CameraRef>(null)
  const db = useSQLiteContext()
  const insets = useSafeAreaInsets()
  // Tabs stay mounted, so stop the camera while another tab is shown.
  const isFocused = useIsFocused()
  const { hasPermission, requestPermission } = useCameraPermission()

  // Shared with the tab bar, which hides the Capture button in Bulk mode.
  const mode = useScanMode()
  const [torch, setTorch] = useState(false)
  // Torch commands fail with "Camera is not active" unless the session is running.
  const [cameraRunning, setCameraRunning] = useState(false)
  const [previewStarted, setPreviewStarted] = useState(false)
  const [cardRect, setCardRect] = useState<LayoutRectangle | null>(null)
  const [cardCameraPoints, setCardCameraPoints] = useState<{ x: number; y: number }[] | null>(null)
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [processing, setProcessing] = useState(false)
  const [toast, setToast] = useState<ScanToastData | null>(null)
  // Where scans go (the "Scan into" sheet), and the binders, for its button's name.
  const { decks } = useDeckStore()
  const target = useScanTarget()
  const [targetOpen, setTargetOpen] = useState(false)
  const [binders, setBinders] = useState<Binder[]>([])
  useEffect(() => {
    if (!isFocused) return
    let live = true
    getBinders(db)
      .then((list) => live && setBinders(list))
      .catch((e) => console.warn('Failed to load binders', e))
    return () => {
      live = false
    }
  }, [isFocused, db])
  // What the last successful scan added, and where, so Undo can take it back off.
  const [lastAdded, setLastAdded] = useState<{
    cardId: string
    language: string
    target: ScanTarget
    // Taking it back out of the decks (null: it went into none).
    deckUndo: Undo | null
  } | null>(null)
  const busy = useRef(false)
  const lastRect = useRef<NormalizedRect | null>(null)
  // Whether the camera is running: a retake only happens while it is.
  const running = useRef(false)
  // Every set code, to tell the set line from other text (loaded once a session; offline, any
  // code-looking word passes).
  const setCodes = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!isFocused || setCodes.current) return
    getSets()
      .then((list) => {
        setCodes.current = new Set(list.map((s) => s.code))
      })
      .catch((e) => console.warn('Failed to load the set list', e))
  }, [isFocused])

  // Both 4:3 so the analysed frames and the photo show the same area of the sensor. 12 MP: smaller
  // photos load faster but read the small collector text worse.
  const photoOutput = usePhotoOutput({ targetResolution: CommonResolutions.UHD_4_3 })

  // Card frame corners: view coordinates -> camera coordinates, once the preview is running.
  useEffect(() => {
    if (!previewStarted || !cardRect || !camera.current) return
    try {
      const { x, y, width, height } = cardRect
      setCardCameraPoints([
        { x, y },
        { x: x + width, y },
        { x, y: y + height },
        { x: x + width, y: y + height },
      ].map((p) => camera.current!.convertViewPointToCameraPoint(p)))
    } catch (e) {
      console.warn('Failed to map card frame to camera coordinates', e)
    }
  }, [previewStarted, cardRect])

  // `attempt`: a card that couldn't be read or found is photographed once more by itself (it's
  // still in the frame), before saying so.
  const capture = useCallback(async (rect: NormalizedRect | null, attempt = 1) => {
    if (busy.current || !rect) return
    let again = false
    // Decks only, but none picked (or they're gone): nowhere to put the card.
    const target = getScanTarget()
    if (!target.binder && scanDecks(target, getDeckStore().decks).length === 0) {
      setLastAdded(null)
      setToast({ ok: false, title: 'No deck picked', message: 'Tap the button at the top to pick the decks scans go into.' })
      return
    }
    busy.current = true
    setProcessing(true)
    try {
      const { filePath } = await photoOutput.capturePhotoToFile({}, {})

      // Load the real bitmap (EXIF rotation applied). The card, in its pixels, from the frame-relative rect.
      const full = await ImageManipulator.manipulate(`file://${filePath}`).renderAsync()
      const cardX = full.width * rect.x
      const cardY = full.height * rect.y
      const cardW = full.width * rect.width
      const cardH = full.height * rect.height

      // The strip with the set code + collector number (fractions of the card, reaching past its
      // edges), clamped to the photo.
      const x0 = Math.max(0, Math.round(cardX + cardW * STRIP.x))
      const y0 = Math.max(0, Math.round(cardY + cardH * STRIP.y))
      const x1 = Math.min(full.width, Math.round(cardX + cardW * (STRIP.x + STRIP.width)))
      const y1 = Math.min(full.height, Math.round(cardY + cardH * (STRIP.y + STRIP.height)))
      const stripContext = ImageManipulator.manipulate(full)
      stripContext.crop({ originX: x0, originY: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) })
      const strip = await (await stripContext.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.92 })

      const recognized = await TextRecognition.recognize(strip.uri)
      const lines = recognized.blocks.flatMap((b) => b.lines.map((l) => ({ text: l.text, frame: l.frame })))

      // OCR text -> set code + collector number -> Scryfall card -> collection.
      const line = parseCollectorLine(ocrRows(lines), setCodes.current)
      if (!line) {
        again = attempt < MAX_ATTEMPTS && running.current
        if (again) return
        setLastAdded(null)
        setToast({ ok: false, title: "Couldn't read card", message: 'Set code and number not found — try again with less glare.' })
        return
      }
      // Try the likeliest numbers first. If OCR saw a rarity letter, only a card of that rarity
      // will do (e.g. a stray "2" must not win over "278" when the card says "M"): a card that
      // doesn't match is a misread, and a wrong card is worse than taking the photo again.
      let found: ScryfallCard | null = null
      for (const number of line.collectorNumbers.slice(0, 3)) {
        const card = await getCardBySetNumber(line.set, number)
        if (card && (!line.rarity || card.rarity === line.rarity)) {
          found = card
          break
        }
      }
      if (!found) {
        again = attempt < MAX_ATTEMPTS && running.current
        if (again) return
        setLastAdded(null)
        setToast({ ok: false, title: 'Card not found', message: `No card for ${line.set.toUpperCase()} #${line.collectorNumbers[0]}.` })
        return
      }
      // Into the binder and / or decks picked in "Scan into" (decks deleted meanwhile are skipped).
      const into = getScanTarget()
      if (into.binder) await addToCollection(db, found, { language: line.language, binderId: into.binderId ?? undefined })
      const deckUndo =
        into.decks && into.deckIds.length > 0
          ? addCardsToDecks(into.deckIds, [{ cardId: found.id, info: cardInfoOf(found), quantity: 1 }], into.board)
          : null
      setLastAdded({ cardId: found.id, language: line.language, target: into, deckUndo })
      setToast({
        ok: true,
        name: found.name,
        set: found.set.toUpperCase(),
        rarity: found.rarity,
        price: found.prices.eur,
        image: cardImage(found),
      })
    } catch (e) {
      console.warn('Failed to scan card', e)
      setLastAdded(null)
      setToast({ ok: false, title: 'Scan failed', message: e instanceof Error ? e.message : 'Something went wrong.' })
    } finally {
      busy.current = false
      if (again) setTimeout(() => captureRef.current(lastRect.current ?? rect, attempt + 1), 0)
      else setProcessing(false)
    }
  }, [photoOutput, db])
  const captureRef = useRef(capture)
  useEffect(() => {
    captureRef.current = capture
  }, [capture])

  const undo = async () => {
    if (!lastAdded) return
    try {
      const { target: into } = lastAdded
      if (into.binder) await removeOneCopy(db, lastAdded.cardId, { language: lastAdded.language, binderId: into.binderId ?? undefined })
      lastAdded.deckUndo?.()
      setLastAdded(null)
      setToast(null)
    } catch (e) {
      console.warn('Failed to undo', e)
    }
  }

  // The tab bar's Capture button (the Scan tab pressed while on it).
  useEffect(() => onCapturePress(() => capture(lastRect.current)), [capture])

  const onStatus = useCallback((next: ScanStatus) => {
    lastRect.current = next.rect
    setStatus(next)
  }, [])

  const onReady = useCallback((rect: NormalizedRect) => {
    lastRect.current = rect
    capture(rect)
  }, [capture])

  const autoCapture = mode === 'bulk'
  const onFrame = useCallback((frame: Frame) => {
    'worklet'
    try {
      if (cardCameraPoints != null) {
        processCardFrame(frame, cardCameraPoints, 0, autoCapture, onStatus, onReady)
      }
    } catch (e) {
      console.log(`[scan-error] ${String(e)}`)
    } finally {
      frame.dispose()
    }
  }, [cardCameraPoints, autoCapture, onStatus, onReady])

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'yuv',
    // Frames stay in sensor orientation: convertCameraPointToFramePoint ignores physical rotation.
    // card-scan.ts rotates the result itself using frame.orientation.
    enablePhysicalBufferRotation: false,
    onFrame,
  })

  if (!hasPermission) {
    return (
      <View style={[styles.root, styles.center, { paddingHorizontal: 32 }]}>
        <Text style={styles.permissionTitle}>Scan your cards</Text>
        <Text style={styles.permissionText}>Grimoire needs the camera to read the set code and number on your cards.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnLabel}>Allow camera</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const state = status?.state ?? 'searching'
  const hint = processing
    ? 'Reading card…'
    : state === 'done' && toast && !toast.ok
      ? 'Take the card out and place it again to retry'
      : status?.hint ?? 'Hold steady — fit the card in the frame'

  return (
    <View style={styles.root}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device="back"
        // Paused while "Scan into" is open, so Bulk mode adds nothing meanwhile.
        isActive={isFocused && !targetOpen}
        resizeMode="cover"
        // Follow the (portrait-locked) UI, not the physical device: pointing down at a table
        // otherwise flips frames/photos to landscape and breaks the card mapping.
        orientationSource="interface"
        torchMode={cameraRunning ? (torch ? 'on' : 'off') : undefined}
        outputs={[photoOutput, frameOutput]}
        onStarted={() => {
          running.current = true
          setCameraRunning(true)
        }}
        onStopped={() => {
          // The light goes off with the camera (e.g. switching tabs); keep the button in sync.
          running.current = false
          setCameraRunning(false)
          setTorch(false)
        }}
        onPreviewStarted={() => setPreviewStarted(true)}
        onError={(e) => console.warn('Camera error', e)}
      />

      {/* The card frame must stay a direct child of this full-screen overlay:
          its onLayout position is used as camera-view coordinates. */}
      <View pointerEvents="box-none" style={[styles.overlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Scan</Text>
          {/* Where scans go: tap to pick a binder, decks, or both. */}
          <TouchableOpacity
            style={styles.targetPill}
            onPress={() => setTargetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Scanning into ${scanTargetLabel(target, binders, decks)}. Tap to change`}
          >
            <SymbolView
              name={target.decks && !target.binder ? { ios: 'rectangle.stack', android: 'style' } : { ios: 'books.vertical', android: 'collections_bookmark' }}
              size={15}
              tintColor={Colors.goldLight}
            />
            <Text style={styles.targetPillLabel} numberOfLines={1}>
              {scanTargetLabel(target, binders, decks)}
            </Text>
            <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} size={14} tintColor={Colors.goldLight} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, torch && styles.iconBtnOn]}
            onPress={() => setTorch((t) => !t)}
            disabled={!cameraRunning}
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Turn off flash' : 'Turn on flash'}
            accessibilityState={{ selected: torch }}
          >
            <SymbolView
              name={torch ? { ios: 'bolt.fill', android: 'flash_on' } : { ios: 'bolt', android: 'flash_off' }}
              size={20}
              tintColor={torch ? Colors.onGold : Colors.text}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.segmented}>
          {(['single', 'bulk'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.segment, mode === m && styles.segmentActive]}
              onPress={() => setScanMode(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m }}
            >
              <Text style={[styles.segmentLabel, mode === m && styles.segmentLabelActive]}>
                {m === 'single' ? 'Single' : 'Bulk'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View
          pointerEvents="none"
          style={styles.frame}
          onLayout={(e) => setCardRect(e.nativeEvent.layout)}
        >
          {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map((corner) => (
            <View key={corner} style={[styles.bracket, styles[corner], { borderColor: BRACKET_COLORS[state] }]} />
          ))}
          <View style={styles.scanLine} />
        </View>

        <Text style={styles.hint} accessibilityLiveRegion="polite">{hint}</Text>


        {toast && (
          <View style={styles.toastWrap}>
            <ScanToast
              data={toast}
              where={lastAdded ? scanTargetLabel(lastAdded.target, binders, decks) : undefined}
              onUndo={toast.ok && lastAdded ? undo : undefined}
            />
          </View>
        )}
      </View>

      <ScanTargetSheet visible={targetOpen} binders={binders} onClose={() => setTargetOpen(false)} />
    </View>
  )
}

const BRACKET = 34

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
  },
  header: {
    alignSelf: 'stretch',
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1, // above the frame's scrim
  },
  targetPill: {
    flexShrink: 1,
    height: 36,
    marginHorizontal: 12,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.45)',
    backgroundColor: 'rgba(14,13,11,0.75)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  targetPillLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  title: {
    fontSize: 42,
    lineHeight: 46,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.16)',
    backgroundColor: 'rgba(14,13,11,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnOn: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  segmented: {
    marginTop: 12,
    width: 200,
    height: 40,
    gap: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: 'rgba(14,13,11,0.7)',
    flexDirection: 'row',
    zIndex: 1, // above the frame's scrim
  },
  segment: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: Colors.text,
  },
  segmentLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: '#CFC7B4',
  },
  segmentLabelActive: {
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
  frame: {
    marginTop: 18,
    width: '65%',
    aspectRatio: 252 / 352,
    borderRadius: 16,
    // Darkens everything outside the frame.
    boxShadow: '0 0 0 2000px rgba(7,6,5,0.62)',
  },
  bracket: {
    position: 'absolute',
    width: BRACKET,
    height: BRACKET,
  },
  topLeft: {
    left: -2,
    top: -2,
    borderLeftWidth: 3,
    borderTopWidth: 3,
    borderTopLeftRadius: 16,
  },
  topRight: {
    right: -2,
    top: -2,
    borderRightWidth: 3,
    borderTopWidth: 3,
    borderTopRightRadius: 16,
  },
  bottomLeft: {
    left: -2,
    bottom: -2,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderBottomLeftRadius: 16,
  },
  bottomRight: {
    right: -2,
    bottom: -2,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderBottomRightRadius: 16,
  },
  scanLine: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: '58%',
    height: 2,
    borderRadius: 1,
    experimental_backgroundImage:
      'linear-gradient(to right, rgba(232,192,106,0), #E8C06A 30%, #E8C06A 70%, rgba(232,192,106,0))',
    boxShadow: '0 0 14px rgba(232,192,106,0.8)',
  },
  hint: {
    marginTop: 14,
    paddingHorizontal: 20,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: '#DCD4C2',
  },
  toastWrap: {
    marginTop: 14,
    alignSelf: 'stretch',
    paddingHorizontal: 20,
  },
  permissionTitle: {
    fontSize: 36,
    fontFamily: Fonts.serif,
    color: Colors.text,
    textAlign: 'center',
  },
  permissionText: {
    marginTop: 8,
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 24,
    height: 52,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
  },
  primaryBtnLabel: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
})
