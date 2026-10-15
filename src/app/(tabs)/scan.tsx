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

import { ScanToast, ScanToastData } from '@/components/scan-toast';
import { Colors, Fonts } from '@/constants/theme';
import { addToCollection, removeOneCopy } from '@/db/collection';
import { cardImage, getCardBySetNumber, type ScryfallCard } from '@/db/scryfall';
import { onCapturePress, setScanMode, useScanMode } from '@/utils/capture-button';
import { NormalizedRect, processCardFrame, ScanState, ScanStatus } from '@/utils/card-scan';
import { parseCollectorLine } from '@/utils/collector-line';
import { addDeckCards, cardInfoOf, useDeckStore } from '@/utils/deck-store';
import { getScanBinder, getScanDeck, setScanDeck, useScanDeck, type ScanDeck } from '@/utils/scan-binder';

// Where the set code + collector number sit on a card, as fractions of the card. Tune these.
const STRIP = { x: 0, y: 0.88, width: 0.6, height: 0.12 }

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
  // What the last successful scan added, so Undo can take it back off.
  const deckStore = useDeckStore()
  const scanDeck = useScanDeck()
  const intoDeck = scanDeck ? deckStore.decks.find((d) => d.id === scanDeck.deckId) : undefined
  const [lastAdded, setLastAdded] = useState<{ cardId: string; language: string; binderId: string | null; deck: ScanDeck | null } | null>(null)
  const busy = useRef(false)
  const lastRect = useRef<NormalizedRect | null>(null)

  // Both 4:3 so the analysed frames and the photo show the same area of the sensor.
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

  const capture = useCallback(async (rect: NormalizedRect | null) => {
    if (busy.current || !rect) return
    busy.current = true
    setProcessing(true)
    try {
      const { filePath } = await photoOutput.capturePhotoToFile({}, {})

      // Load the real bitmap (EXIF rotation applied) and crop the card using the frame-relative rect.
      const full = await ImageManipulator.manipulate(`file://${filePath}`).renderAsync()
      const width = Math.min(Math.floor(full.width * rect.width), full.width)
      const height = Math.min(Math.floor(full.height * rect.height), full.height)
      const originX = Math.min(Math.max(0, Math.round(full.width * rect.x)), full.width - width)
      const originY = Math.min(Math.max(0, Math.round(full.height * rect.y)), full.height - height)

      const context = ImageManipulator.manipulate(full)
      context.crop({ originX, originY, width, height })
      const card = await context.renderAsync()

      // Second crop: only the strip with set code + collector number, as fractions of the card.
      const stripX = Math.round(card.width * STRIP.x)
      const stripY = Math.round(card.height * STRIP.y)
      const stripW = Math.min(Math.round(card.width * STRIP.width), card.width - stripX)
      const stripH = Math.min(Math.round(card.height * STRIP.height), card.height - stripY)
      const stripContext = ImageManipulator.manipulate(card)
      stripContext.crop({ originX: stripX, originY: stripY, width: stripW, height: stripH })
      const strip = await (await stripContext.renderAsync()).saveAsync({ format: SaveFormat.PNG })

      const recognized = await TextRecognition.recognize(strip.uri)
      console.log('Text recognition result:', recognized.text)

      // OCR text -> set code + collector number -> Scryfall card -> collection.
      const line = parseCollectorLine(recognized.text)
      if (!line) {
        setLastAdded(null)
        setToast({ ok: false, title: "Couldn't read card", message: 'Set code and number not found — try again with less glare.' })
        return
      }
      // Try the likeliest numbers first. If OCR saw a rarity letter, prefer the card that matches it
      // (e.g. a stray "2" must not win over "278" when the card says "M").
      let found: ScryfallCard | null = null
      for (const number of line.collectorNumbers.slice(0, 3)) {
        const card = await getCardBySetNumber(line.set, number)
        if (!card) continue
        if (!line.rarity || card.rarity === line.rarity) {
          found = card
          break
        }
        found ??= card
      }
      if (!found) {
        setLastAdded(null)
        setToast({ ok: false, title: 'Card not found', message: `No card for ${line.set.toUpperCase()} #${line.collectorNumbers[0]}.` })
        return
      }
      const binderId = getScanBinder()
      await addToCollection(db, found, { language: line.language, binderId: binderId ?? undefined })
      const deck = getScanDeck()
      const inDeck = deck != null && addDeckCards(deck.deckId, found.id, cardInfoOf(found), deck.board, 1)
      setLastAdded({ cardId: found.id, language: line.language, binderId, deck: inDeck ? deck : null })
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
      setProcessing(false)
    }
  }, [photoOutput, db])

  const undo = async () => {
    if (!lastAdded) return
    try {
      await removeOneCopy(db, lastAdded.cardId, { language: lastAdded.language, binderId: lastAdded.binderId ?? undefined })
      const { deck } = lastAdded
      const info = deck && deckStore.info[lastAdded.cardId]
      if (deck && info) addDeckCards(deck.deckId, lastAdded.cardId, info, deck.board, -1)
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
        isActive={isFocused}
        resizeMode="cover"
        // Follow the (portrait-locked) UI, not the physical device: pointing down at a table
        // otherwise flips frames/photos to landscape and breaks the card mapping.
        orientationSource="interface"
        torchMode={cameraRunning ? (torch ? 'on' : 'off') : undefined}
        outputs={[photoOutput, frameOutput]}
        onStarted={() => setCameraRunning(true)}
        onStopped={() => {
          // The light goes off with the camera (e.g. switching tabs); keep the button in sync.
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
          {/* Scans also going into a new deck: which one, and a way to stop. */}
          {intoDeck && scanDeck && (
            <TouchableOpacity
              style={styles.deckPill}
              onPress={() => setScanDeck(null)}
              accessibilityRole="button"
              accessibilityLabel={`Adding scans to ${intoDeck.name}, ${BOARD_NAME[scanDeck.board]}. Tap to stop.`}
            >
              <Text style={styles.deckPillLabel} numberOfLines={1}>
                {intoDeck.name} · {BOARD_NAME[scanDeck.board]}
              </Text>
              <SymbolView name={{ ios: 'xmark', android: 'close' }} size={14} tintColor={Colors.goldLight} />
            </TouchableOpacity>
          )}
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
            <ScanToast data={toast} onUndo={toast.ok && lastAdded ? undo : undefined} />
          </View>
        )}
      </View>
    </View>
  )
}

const BRACKET = 34

const BOARD_NAME = { main: 'Main deck', side: 'Sideboard', maybe: 'Maybe' } as const

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
  deckPill: {
    flexShrink: 1,
    height: 36,
    marginHorizontal: 12,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.45)',
    backgroundColor: 'rgba(14,13,11,0.75)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deckPillLabel: {
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
