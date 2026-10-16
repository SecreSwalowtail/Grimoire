import { useSyncExternalStore } from 'react'

import { createListeners } from '@/utils/listeners'

// Shared between the Scan screen (owns the camera) and the tab bar, whose center button
// becomes the "Capture" shutter on the Scan tab in Single mode.

// Single: tap Capture for each card. Bulk: hands-free auto-capture, no Capture button.
type ScanMode = 'single' | 'bulk'

let mode: ScanMode = 'single'
const modeChanges = createListeners()

export function setScanMode(next: ScanMode) {
  mode = next
  modeChanges.notify()
}

export const getScanMode = () => mode

export const useScanMode = () => useSyncExternalStore(modeChanges.subscribe, getScanMode)

const presses = createListeners()

export const onCapturePress = presses.subscribe

export const pressCapture = presses.notify
