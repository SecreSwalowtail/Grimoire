import { router } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { BinderCover } from '@/components/binder/binder-cover'
import { ColorSpectrum } from '@/components/color-spectrum'
import { PrimaryButton, SectionLabel, Sheet, SheetHeader } from '@/components/controls'
import { StartOptions, type Start } from '@/components/decks/new-sheet'
import { NameField } from '@/components/decks/parts'
import { BINDER_PRESETS, createBinder, updateBinder, type Binder } from '@/db/binders'
import { moveEntries, type CollectionEntry } from '@/db/collection'
import { plural } from '@/utils/format'
import { setScanBinder } from '@/utils/scan-target'

const PREVIEW_SCALE = 0.85
const PRESETS = Object.values(BINDER_PRESETS)
const FIRST_COLOR = BINDER_PRESETS.gold.hex

// "New binder" sheet: name, any cover color (the binder at the top shows it) and how to start.
// "Empty" and "Paste list" create the binder and open it (pasting a list isn't built yet);
// "Scan cards" creates it, sends scanned cards into it and opens the Scan tab.
// Given a `binder`, it's "Edit binder" instead: name and color, saved with Save.
// Given `entries` (cards picked in a binder's edit mode), the new binder is made with those cards,
// moved out of where they were: no "Start from", and no binder opens. `onCreated` gets its id and
// name.
export function BinderSheet({
  visible,
  binder,
  entries,
  onClose,
  onCreated,
}: {
  visible: boolean
  binder?: Binder | null
  entries?: CollectionEntry[]
  onClose: () => void
  onCreated?: (id: string, name: string) => void
}) {
  const db = useSQLiteContext()
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(FIRST_COLOR)
  // No scrolling while a color is being dragged.
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState<Start>('empty')

  // Start every opening fresh (state adjusted during render, no effect needed).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setName(binder?.name ?? '')
      setColor(binder?.color ?? FIRST_COLOR)
      setStart('empty')
    }
  }

  const copies = entries?.reduce((n, e) => n + e.quantity, 0) ?? 0
  const cta =
    binder ? 'Save'
    : entries ? `Create binder with ${plural(copies, 'card')}`
    : start === 'scan' ? 'Create & start scanning'
    : start === 'paste' ? 'Create & paste list'
    : 'Create binder'

  const create = async () => {
    try {
      if (binder) {
        await updateBinder(db, binder.id, { name: name.trim() || binder.name, color })
        onClose()
        return
      }
      const binderName = name.trim() || 'New binder'
      const id = await createBinder(db, { name: binderName, color })
      if (entries) {
        await moveEntries(db, entries.map((e) => e.id), id)
        onClose()
        onCreated?.(id, binderName)
        return
      }
      onClose()
      if (start === 'scan') {
        setScanBinder(id)
        router.navigate('/scan')
      } else {
        router.push({ pathname: '/binder/[id]', params: { id } })
      }
    } catch (e) {
      console.warn('Failed to create binder', e)
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title={binder ? 'Edit binder' : 'New binder'} onClose={onClose} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        scrollEnabled={!dragging}
      >
        {/* The binder is drawn flush left in its box; the margin centers what you see. */}
        <View style={styles.preview} accessible accessibilityLabel="Preview of the binder">
          <View style={{ marginLeft: 56 * PREVIEW_SCALE }}>
            <BinderCover color={color} scale={PREVIEW_SCALE} />
          </View>
        </View>

        <NameField label="Name" value={name} onChange={setName} placeholder="e.g. Trade Binder" accent />

        <SectionLabel style={styles.label}>Color</SectionLabel>
        <ColorSpectrum value={color} onChange={setColor} presets={PRESETS} onDragging={setDragging} />

        {!binder && !entries && (
          <>
            <SectionLabel style={styles.label}>Start from</SectionLabel>
            <StartOptions value={start} onChange={setStart} />
          </>
        )}
      </ScrollView>
      <PrimaryButton label={cta} onPress={create} />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    marginTop: 12,
  },
  bodyContent: {
    paddingBottom: 24,
  },
  preview: {
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 2,
  },
})
