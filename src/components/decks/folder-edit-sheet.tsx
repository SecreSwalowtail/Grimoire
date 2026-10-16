import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SectionLabel, Segmented, Sheet, SheetHeader, Toggle } from '@/components/controls';
import { ColorPicker, FolderIcon, NameField } from '@/components/decks/parts';
import { Colors, Fonts } from '@/constants/theme';
import { FOLDER_COLORS, updateFolder, useDeckStore, type FolderColor, type FolderSort } from '@/utils/deck-store';

// "Edit folder" sheet: name, color, how decks inside are sorted, pin to top. Changes are a draft
// until Save. "Delete folder…" asks first.
export function FolderEditSheet({
  folderId,
  onClose,
  onDelete,
}: {
  folderId: string | null
  onClose: () => void
  onDelete: (folderId: string) => void
}) {
  const { folders } = useDeckStore()
  const folder = folders.find((f) => f.id === folderId)
  const [name, setName] = useState('')
  const [color, setColor] = useState<FolderColor>('gold')
  const [sort, setSort] = useState<FolderSort>('custom')
  const [pinned, setPinned] = useState(false)

  // Load the folder each time the sheet opens for one (state adjusted during render).
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  if (folder && loadedFor !== folder.id) {
    setLoadedFor(folder.id)
    setName(folder.name)
    setColor(folder.color)
    setSort(folder.sort)
    setPinned(folder.pinned)
  } else if (!folderId && loadedFor != null) {
    setLoadedFor(null)
  }


  return (
    <Sheet visible={folder != null} onClose={onClose}>
      <SheetHeader title="Edit folder" onClose={onClose} />
      <ScrollView showsVerticalScrollIndicator={false} style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" bounces={false}>
        <NameField
          label="Name"
          value={name}
          onChange={setName}
          accent
          icon={<FolderIcon color={FOLDER_COLORS[color].hex} width={30} fill={0.25} />}
        />

        <SectionLabel style={styles.label}>Color</SectionLabel>
        <ColorPicker value={color} onChange={setColor} />

        <SectionLabel style={styles.label}>Sort decks inside</SectionLabel>
        <Segmented
          label="Sort decks inside"
          options={[
            { value: 'custom', label: 'Custom' },
            { value: 'name', label: 'Name' },
            { value: 'value', label: 'Value' },
          ]}
          value={sort}
          onChange={setSort}
        />

        <View style={styles.group}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Pin to top of Decks</Text>
            <Toggle value={pinned} onChange={setPinned} label="Pin to top of Decks" />
          </View>
          <Pressable
            style={[styles.row, styles.rule]}
            onPress={() => folder && onDelete(folder.id)}
            accessibilityRole="button"
          >
            <SymbolView name={{ ios: 'trash', android: 'delete' }} size={20} tintColor={DANGER} />
            <Text style={styles.delete}>Delete folder…</Text>
          </Pressable>
        </View>
      </ScrollView>
      <PrimaryButton
        label="Save changes"
        onPress={() => {
          if (folder) updateFolder(folder.id, { name: name.trim() || folder.name, color, sort, pinned })
          onClose()
        }}
      />
    </Sheet>
  )
}

const DANGER = '#EE8466'

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    marginTop: 20,
  },
  bodyContent: {
    paddingBottom: 24,
  },
  label: {
    marginTop: 20,
    marginBottom: 10,
    marginLeft: 2,
  },
  group: {
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  row: {
    height: 56,
    paddingLeft: 16,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rule: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.07)',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  delete: {
    flex: 1,
    marginLeft: 2,
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: DANGER,
  },
})
