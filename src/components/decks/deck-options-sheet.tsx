import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { PrimaryButton, SectionLabel, Sheet } from '@/components/controls';
import { Option } from '@/components/decks/new-sheet';
import { DeckThumb, NameField } from '@/components/decks/parts';
import { Colors, Fonts } from '@/constants/theme';
import {
  deleteDecks,
  duplicateDecks,
  FORMATS,
  updateDeck,
  useDeckStore,
  type DeckFormat,
  type Undo,
} from '@/utils/deck-store';

const DANGER = '#EE8466'

// "Deck options" sheet: rename, change format, move to a folder, duplicate, delete (asks first,
// then the screen shows an Undo toast). Export is UI only for now.
export function DeckOptionsSheet({
  deckId,
  onClose,
  onMove,
  onDeleted,
}: {
  deckId: string | null
  onClose: () => void
  onMove: (deckId: string) => void
  onDeleted: (name: string, undo: Undo) => void
}) {
  const { folders, decks } = useDeckStore()
  const deck = decks.find((d) => d.id === deckId)
  const [name, setName] = useState('')
  const [format, setFormat] = useState<DeckFormat>('Modern')
  const [confirming, setConfirming] = useState(false)

  // Load the deck each time the sheet opens for one (state adjusted during render).
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  if (deck && loadedFor !== deck.id) {
    setLoadedFor(deck.id)
    setName(deck.name)
    setFormat(deck.format)
    setConfirming(false)
  } else if (!deckId && loadedFor != null) {
    setLoadedFor(null)
  }

  const folder = folders.find((f) => f.id === deck?.folderId)

  return (
    <Sheet visible={deck != null} onClose={onClose}>
      <View style={styles.header}>
        <DeckThumb large />
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>{name || deck?.name}</Text>
          <Text style={styles.meta}>
            0 cards · <Text style={styles.value}>€0</Text>
          </Text>
        </View>
        <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <SymbolView name={{ ios: 'xmark', android: 'close' }} size={18} tintColor={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" bounces={false}>
        <NameField label="Deck name" value={name} onChange={setName} />

        <SectionLabel style={styles.label}>Format</SectionLabel>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel="Format"
        >
          {FORMATS.map((f) => (
            <Option key={f} label={f} selected={f === format} onPress={() => setFormat(f)} style={styles.chip} />
          ))}
        </ScrollView>

        <View style={styles.group}>
          <Row
            icon={{ ios: 'folder', android: 'drive_file_move' }}
            first
            label="Folder"
            value={folder?.name ?? 'None'}
            chevron
            onPress={() => deck && onMove(deck.id)}
          />
          <Row
            icon={{ ios: 'plus.square.on.square', android: 'content_copy' }}
            label="Duplicate deck"
            onPress={() => {
              if (deck) duplicateDecks([deck.id])
              onClose()
            }}
          />
          <Row icon={{ ios: 'square.and.arrow.up', android: 'ios_share' }} label="Export decklist" value="Arena, MTGO, text" small />
        </View>

        {confirming ? (
          <View style={styles.confirm} accessibilityRole="alert">
            <View>
              <Text style={styles.confirmTitle}>Delete {deck?.name}?</Text>
              <Text style={styles.confirmText}>Its cards stay in your binder. You can undo right after.</Text>
            </View>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={styles.cancel} onPress={() => setConfirming(false)} accessibilityRole="button">
                <Text style={styles.cancelLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDelete}
                onPress={() => {
                  if (!deck) return
                  onDeleted(deck.name, deleteDecks([deck.id]))
                  onClose()
                }}
                accessibilityRole="button"
              >
                <Text style={styles.confirmDeleteLabel}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.delete} onPress={() => setConfirming(true)} accessibilityRole="button">
            <SymbolView name={{ ios: 'trash', android: 'delete' }} size={20} tintColor={DANGER} />
            <Text style={styles.deleteLabel}>Delete deck</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <PrimaryButton
        label="Save"
        onPress={() => {
          if (deck) updateDeck(deck.id, { name: name.trim() || deck.name, format })
          onClose()
        }}
      />
    </Sheet>
  )
}

function Row({
  icon,
  label,
  value,
  chevron,
  small,
  first,
  onPress,
}: {
  icon: SymbolViewProps['name']
  label: string
  value?: string
  chevron?: boolean
  small?: boolean
  first?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable style={[styles.row, !first && styles.rowRule]} onPress={onPress} accessibilityRole="button">
      <SymbolView name={icon} size={20} tintColor="#CFC7B4" />
      <Text style={styles.rowLabel}>{label}</Text>
      {value != null && <Text style={[styles.rowValue, small && styles.rowValueSmall]}>{value}</Text>}
      {chevron && <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={16} tintColor={Colors.textMuted} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 30,
    lineHeight: 32,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  meta: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  value: {
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
  close: {
    alignSelf: 'flex-start',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexShrink: 1,
    marginTop: 20,
  },
  bodyContent: {
    paddingBottom: 24,
  },
  label: {
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 2,
  },
  // Chips scroll edge to edge, past the sheet's side padding.
  chipScroll: {
    marginHorizontal: -20,
  },
  chips: {
    paddingHorizontal: 20,
    gap: 8,
  },
  chip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  group: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  row: {
    height: 54,
    paddingLeft: 16,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowRule: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.07)',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  rowValue: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  rowValueSmall: {
    fontSize: 13,
  },
  delete: {
    marginTop: 12,
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(238,132,102,0.30)',
    backgroundColor: 'rgba(181,65,42,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: DANGER,
  },
  confirm: {
    marginTop: 12,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(238,132,102,0.45)',
    backgroundColor: 'rgba(181,65,42,0.14)',
    gap: 12,
  },
  confirmTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  confirmText: {
    marginTop: 3,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  cancel: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  confirmDelete: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#B5412A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: '#FFF4EC',
  },
})
