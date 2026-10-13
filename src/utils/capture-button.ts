import { useSyncExternalStore } from 'react'

// Shared between the Scan screen (owns the camera) and the tab bar, whose center button
// becomes the "Capture" shutter on the Scan tab in Single mode.

// Single: tap Capture for each card. Bulk: hands-free auto-capture, no Capture button.
export type ScanMode = 'single' | 'bulk'

let mode: ScanMode = 'single'
const modeListeners = new Set<() => void>()

export function setScanMode(next: ScanMode) {
  mode = next
  modeListeners.forEach((listener) => listener())
}

export function getScanMode() {
  return mode
}

export function useScanMode() {
  return useSyncExternalStore((listener) => {
    modeListeners.add(listener)
    return () => {
      modeListeners.delete(listener)
    }
  }, getScanMode)
}

const captureListeners = new Set<() => void>()

export function onCapturePress(listener: () => void) {
  captureListeners.add(listener)
  return () => {
    captureListeners.delete(listener)
  }
}

export function pressCapture() {
  captureListeners.forEach((listener) => listener())
}
