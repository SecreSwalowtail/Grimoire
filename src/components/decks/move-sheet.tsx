import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { PrimaryButton, Sheet } from '@/components/controls';
import { FolderIcon, RadioDot } from '@/components/decks/parts';
import { Colors, Fonts } from '@/constants/theme';
import { FOLDER_COLORS, moveDecks, useDeckStore, withAlpha } from '@/utils/deck-store';

// "Move to folder" sheet for one or more decks. "New folder…" hands the decks to the New folder
// sheet instead.
export function MoveSheet({
  deckIds,
  onClose,
  onMoved,
  onNewFolder,
}: {
  deckIds: string[] | null
  onClose: () => void
  onMoved?: () => void
  onNewFolder: (deckIds: string[]) => void
}) {
  const { folders, decks } = useDeckStore()
  const moving = decks.filter((d) => deckIds?.includes(d.id))
  // Where the decks are now, if they're all in the same place.
  const current = moving.every((d) => d.folderId === moving[0]?.folderId) ? (moving[0]?.folderId ?? null) : undefined
  const [dest, setDest] = useState<string | null>(null)

  // Start at the current location each time the sheet opens (state adjusted during render).
  const key = deckIds?.join(',') ?? null
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  if (key !== loadedFor) {
    setLoadedFor(key)
    if (key) setDest(current ?? null)
  }

  const destName = folders.find((f) => f.id === dest)?.name
  const title = moving.length === 1 ? `Move ${moving[0].name}` : `Move ${moving.length} decks`
  const count = (folderId: string) => decks.filter((d) => d.folderId === folderId).length

  return (
    <Sheet visible={deckIds != null && moving.length > 0} onClose={onClose}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {moving.length > 1 && <Text style={styles.names} numberOfLines={2}>{moving.map((d) => d.name).join(', ')}</Text>}
        </View>
        <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <SymbolView name={{ ios: 'xmark', android: 'close' }} size={18} tintColor={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.list} bounces={false} accessibilityRole="radiogroup">
        <Destination
          name="No folder"
          meta={current === null ? 'Current location' : 'Outside folders'}
          icon={
            <Svg width={24} height={20} viewBox="0 0 28 24" fill="none">
              <Path
                d="M2 6a2.5 2.5 0 0 1 2.5-2.5h6l2.6 3h10.4A2.5 2.5 0 0 1 26 9v10a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 2 19z"
                stroke={Colors.textSecondary}
                strokeWidth={1.75}
                strokeDasharray="3 3"
                strokeLinejoin="round"
              />
            </Svg>
          }
          tint={Colors.surfaceRaised}
          selected={dest == null}
          onPress={() => setDest(null)}
        />
        {folders.map((f) => {
          const hex = FOLDER_COLORS[f.color].hex
          const n = count(f.id)
          return (
            <Destination
              key={f.id}
              name={f.name}
              meta={current === f.id ? 'Current location' : `${n} ${n === 1 ? 'deck' : 'decks'}`}
              icon={<FolderIcon color={hex} width={24} />}
              tint={withAlpha(hex, 0.14)}
              selected={dest === f.id}
              onPress={() => setDest(f.id)}
            />
          )
        })}
        <TouchableOpacity style={styles.newFolder} onPress={() => deckIds && onNewFolder(deckIds)} accessibilityRole="button">
          <View style={styles.newIcon}>
            <SymbolView name={{ ios: 'plus', android: 'add' }} size={20} tintColor={Colors.goldLight} />
          </View>
          <Text style={styles.newLabel}>New folder…</Text>
        </TouchableOpacity>
      </ScrollView>

      <PrimaryButton
        label={dest == null ? (current === null ? 'Keep out of folders' : 'Move out of folders') : `Move to ${destName}`}
        onPress={() => {
          if (deckIds) moveDecks(deckIds, dest)
          onMoved?.()
          onClose()
        }}
      />
    </Sheet>
  )
}

function Destination({
  name,
  meta,
  icon,
  tint,
  selected,
  onPress,
}: {
  name: string
  meta: string
  icon: ReactNode
  tint: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      style={[styles.dest, selected && styles.destSelected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <View style={[styles.destIcon, { backgroundColor: tint }]}>{icon}</View>
      <View style={styles.destText}>
        <Text style={styles.destName} numberOfLines={1}>{name}</Text>
        <Text style={styles.destMeta}>{meta}</Text>
      </View>
      <RadioDot selected={selected} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  names: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  close: {
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
  list: {
    gap: 8,
    paddingBottom: 24,
  },
  dest: {
    height: 62,
    paddingLeft: 14,
    paddingRight: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  destSelected: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.08)',
  },
  destIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  destName: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  destMeta: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  newFolder: {
    height: 56,
    paddingLeft: 14,
    paddingRight: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(212,166,74,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  newIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
  },
})
