import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { RadioDot } from '@/components/decks/parts'
import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import { deleteFolders, useDeckStore, type Undo } from '@/utils/deck-store'
import { plural } from '@/utils/format'
import { useModalAnimation } from '@/utils/motion'

// Centered "Delete folder?" dialog. When the folders hold decks, asks whether to keep them
// (moved out of folders) or delete them too. The screen shows an Undo toast afterwards.
export function DeleteFolderDialog({
  folderIds,
  onClose,
  onDeleted,
}: {
  folderIds: string[] | null
  onClose: () => void
  onDeleted: (message: string, undo: Undo) => void
}) {
  const modalAnimation = useModalAnimation()
  const { folders, decks } = useDeckStore()
  const targets = folders.filter((f) => folderIds?.includes(f.id))
  const inside = decks.filter((d) => d.folderId != null && folderIds?.includes(d.folderId)).length
  const [withDecks, setWithDecks] = useState(false)

  // Default to keeping the decks each time it opens (state adjusted during render).
  const key = folderIds?.join(',') ?? null
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  if (key !== loadedFor) {
    setLoadedFor(key)
    setWithDecks(false)
  }

  const one = targets.length === 1
  const title = one ? `Delete “${targets[0].name}”?` : `Delete ${targets.length} folders?`
  const decksText = plural(inside, 'deck')
  const choices = [
    { value: false, title: 'Keep the decks', sub: `Move ${inside === 1 ? 'it' : `all ${inside}`} to Decks, outside folders`, accent: Colors.gold, tint: 'rgba(212,166,74,0.08)' },
    { value: true, title: 'Delete decks too', sub: `Remove the ${one ? 'folder' : 'folders'} and ${inside === 1 ? 'its deck' : `its ${inside} decks`}`, accent: Colors.danger, tint: 'rgba(181,65,42,0.12)' },
  ]

  return (
    <Modal
      visible={targets.length > 0}
      transparent
      animationType={modalAnimation}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityRole="alert" accessibilityViewIsModal>
          <View style={styles.icon}>
            <Icon name={{ ios: 'trash', android: 'delete' }} size={26} tintColor={Colors.danger} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>
            {inside === 0
              ? one ? 'This folder is empty.' : 'These folders are empty.'
              : `${one ? 'This folder holds' : 'These folders hold'} ${decksText}. What should happen to them?`}
          </Text>

          {inside > 0 && (
            <View style={styles.choices} accessibilityRole="radiogroup">
              {choices.map((c) => {
                const selected = c.value === withDecks
                return (
                  <Pressable
                    key={String(c.value)}
                    style={[styles.choice, selected && { borderWidth: 1.5, borderColor: c.accent, backgroundColor: c.tint }]}
                    onPress={() => setWithDecks(c.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  >
                    <RadioDot selected={selected} color={c.accent} />
                    <View style={styles.choiceText}>
                      <Text style={styles.choiceTitle}>{c.title}</Text>
                      <Text style={styles.choiceSub}>{c.sub}</Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          )}

          <TouchableOpacity
            style={styles.delete}
            onPress={() => {
              if (!folderIds) return
              const undo = deleteFolders(folderIds, withDecks)
              onDeleted(one ? `${targets[0].name} deleted` : `${targets.length} folders deleted`, undo)
              onClose()
            }}
            accessibilityRole="button"
          >
            <Text style={styles.deleteLabel}>
              {withDecks && inside > 0 ? `Delete ${one ? 'folder' : 'folders'} & ${decksText}` : `Delete ${one ? 'folder' : 'folders'}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.footnote}>Cards stay in your binder either way.</Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    backgroundColor: 'rgba(8,7,6,0.6)',
  },
  dialog: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.12)',
    backgroundColor: Colors.surface,
    boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
  },
  icon: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(238,132,102,0.35)',
    backgroundColor: 'rgba(181,65,42,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 30,
    lineHeight: 32,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  body: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.regular,
    color: '#CFC7B4',
  },
  choices: {
    marginTop: 18,
    gap: 8,
  },
  choice: {
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  choiceText: {
    flex: 1,
    gap: 2,
  },
  choiceTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  choiceSub: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  delete: {
    marginTop: 18,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#B5412A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: '#FFF4EC',
  },
  cancel: {
    marginTop: 8,
    height: 50,
    borderRadius: 16,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  footnote: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
})
