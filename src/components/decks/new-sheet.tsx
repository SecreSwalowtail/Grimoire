import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SectionLabel, Segmented, Sheet, SheetHeader } from '@/components/controls';
import { CheckBox, ColorPicker, NameField } from '@/components/decks/parts';
import { Colors, Fonts } from '@/constants/theme';
import {
  createDeck,
  createFolder,
  FOLDER_COLORS,
  useDeckStore,
  type DeckFormat,
  type FolderColor,
} from '@/utils/deck-store';

// Formats offered when creating a deck (Deck options adds Legacy).
const NEW_FORMATS: DeckFormat[] = ['Standard', 'Pioneer', 'Modern', 'Pauper', 'Commander', 'Casual']

type Start = 'empty' | 'paste' | 'scan'
const STARTS: { value: Start; label: string; icon: SymbolViewProps['name'] }[] = [
  { value: 'empty', label: 'Empty', icon: { ios: 'plus', android: 'add' } },
  { value: 'paste', label: 'Paste list', icon: { ios: 'doc.on.clipboard', android: 'content_paste' } },
  { value: 'scan', label: 'Scan cards', icon: { ios: 'viewfinder', android: 'document_scanner' } },
]

export type NewKind = 'deck' | 'folder'

// "New deck / New folder" sheet. `folderId` preselects "Put in folder"; `deckIds` pre-checks
// decks to file into a new folder (from Organize and Move).
// "Paste list" only creates the deck for now; "Scan cards" creates it and opens the Scan tab.
export function NewSheet({
  visible,
  kind: initialKind,
  folderId = null,
  deckIds = [],
  onClose,
}: {
  visible: boolean
  kind: NewKind
  folderId?: string | null
  deckIds?: string[]
  onClose: () => void
}) {
  const { folders, decks } = useDeckStore()
  const [kind, setKind] = useState(initialKind)
  const [name, setName] = useState('')
  const [format, setFormat] = useState<DeckFormat>('Modern')
  const [start, setStart] = useState<Start>('empty')
  const [place, setPlace] = useState<string | null>(folderId)
  const [color, setColor] = useState<FolderColor>('gold')
  const [picked, setPicked] = useState<string[]>(deckIds)

  // Start every opening fresh (state adjusted during render, no effect needed).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setKind(initialKind)
      setName('')
      setFormat('Modern')
      setStart('empty')
      setPlace(folderId)
      setColor('gold')
      setPicked(deckIds)
    }
  }

  const isDeck = kind === 'deck'
  // Decks that can go in a new folder: loose ones, plus any passed in from a selection.
  const choosable = decks.filter((d) => d.folderId == null || deckIds.includes(d.id))
  const cta = !isDeck
    ? 'Create folder'
    : start === 'scan' ? 'Create & start scanning'
    : start === 'paste' ? 'Create & paste list'
    : 'Create deck'

  const create = () => {
    if (isDeck) {
      createDeck({ name: name.trim() || 'New deck', format, folderId: place })
      if (start === 'scan') router.navigate('/scan')
    } else {
      createFolder({ name: name.trim() || 'New folder', color }, picked)
    }
    onClose()
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title={isDeck ? 'New deck' : 'New folder'} onClose={onClose} />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" bounces={false}>
        <Segmented
          label="What to create"
          options={[
            { value: 'deck', label: 'Deck' },
            { value: 'folder', label: 'Folder' },
          ]}
          value={kind}
          onChange={setKind}
        />

        <View style={styles.gap}>
          <NameField
            label="Name"
            value={name}
            onChange={setName}
            placeholder={isDeck ? 'e.g. Izzet Murktide' : 'e.g. Legacy'}
            accent
          />
        </View>

        {isDeck ? (
          <>
            <SectionLabel style={styles.label}>Format</SectionLabel>
            <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Format">
              {NEW_FORMATS.map((f) => (
                <Option key={f} label={f} selected={f === format} onPress={() => setFormat(f)} style={styles.third} />
              ))}
            </View>

            <SectionLabel style={styles.label}>Start from</SectionLabel>
            <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Start from">
              {STARTS.map((s) => {
                const selected = s.value === start
                return (
                  <Pressable
                    key={s.value}
                    style={[styles.start, selected && styles.selected]}
                    onPress={() => setStart(s.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  >
                    <View style={[styles.startIcon, selected && styles.startIconSelected]}>
                      <SymbolView name={s.icon} size={18} tintColor={selected ? Colors.onGold : '#CFC7B4'} />
                    </View>
                    <Text style={styles.startLabel}>{s.label}</Text>
                  </Pressable>
                )
              })}
            </View>

            <SectionLabel style={styles.label}>Put in folder</SectionLabel>
            <View style={styles.places} accessibilityRole="radiogroup" accessibilityLabel="Put in folder">
              <Place label="No folder" dot="#5A5446" selected={place == null} onPress={() => setPlace(null)} />
              {folders.map((f) => (
                <Place
                  key={f.id}
                  label={f.name}
                  dot={FOLDER_COLORS[f.color].hex}
                  selected={place === f.id}
                  onPress={() => setPlace(f.id)}
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <SectionLabel style={styles.label}>Color</SectionLabel>
            <ColorPicker value={color} onChange={setColor} />

            <SectionLabel style={styles.label}>Add decks now · optional</SectionLabel>
            {choosable.length === 0 ? (
              <Text style={styles.none}>No decks outside folders yet.</Text>
            ) : (
              <View style={styles.list}>
                {choosable.map((d, i) => {
                  const checked = picked.includes(d.id)
                  return (
                    <Pressable
                      key={d.id}
                      style={[styles.listRow, i > 0 && styles.rule]}
                      onPress={() => setPicked(checked ? picked.filter((id) => id !== d.id) : [...picked, d.id])}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                    >
                      <View style={styles.listText}>
                        <Text style={styles.listName} numberOfLines={1}>{d.name}</Text>
                        <Text style={styles.listMeta}>{d.format}</Text>
                      </View>
                      <CheckBox checked={checked} />
                    </Pressable>
                  )
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
      <PrimaryButton label={cta} onPress={create} />
    </Sheet>
  )
}

// Square-ish selectable tile used for formats (shared with Deck options' chips look).
export function Option({
  label,
  selected,
  onPress,
  style,
}: {
  label: string
  selected: boolean
  onPress: () => void
  style?: object
}) {
  return (
    <Pressable
      style={[styles.option, selected && styles.selected, style]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

function Place({ label, dot, selected, onPress }: { label: string; dot: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.place, selected && styles.selected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <View style={[styles.placeDot, { backgroundColor: dot }]} />
      <Text style={[styles.placeLabel, selected && styles.optionLabelSelected]} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    marginTop: 18,
  },
  bodyContent: {
    paddingBottom: 24,
  },
  gap: {
    marginTop: 20,
  },
  label: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // Three per row.
  third: {
    width: '31%',
    flexGrow: 1,
  },
  option: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  selected: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.12)',
  },
  optionLabel: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  optionLabelSelected: {
    color: Colors.goldLight,
  },
  start: {
    width: '31%',
    flexGrow: 1,
    height: 84,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startIconSelected: {
    backgroundColor: Colors.gold,
  },
  startLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  places: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  place: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  placeDot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  placeLabel: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  none: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  list: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  listRow: {
    height: 56,
    paddingLeft: 16,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rule: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.07)',
  },
  listText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  listName: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  listMeta: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
})
