import { useEffect, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { PrimaryButton, SectionLabel, Sheet, SheetHeader } from '@/components/controls'
import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import { checkForAppUpdate, type AppUpdate } from '@/utils/app-update'

// Checks GitHub for a newer release each time the app opens, and offers to download it.
export function UpdateSheet() {
  const [update, setUpdate] = useState<AppUpdate | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    checkForAppUpdate().then((found) => {
      if (!found) return
      setUpdate(found)
      setVisible(true)
    })
  }, [])

  if (!update) return null
  const close = () => setVisible(false)

  return (
    <Sheet visible={visible} onClose={close}>
      <SheetHeader title="Update available" onClose={close} />
      <View style={styles.intro}>
        <View style={styles.badge}>
          <Icon name={{ ios: 'arrow.down.circle', android: 'download' }} size={22} tintColor={Colors.gold} />
        </View>
        <View style={styles.introText}>
          <Text style={styles.version}>Grimoire {update.version}</Text>
          <Text style={styles.meta}>Download it, then open the file to install over this version. Your collection stays.</Text>
        </View>
      </View>

      {update.notes !== '' && (
        <>
          <SectionLabel style={styles.label}>{"What's new"}</SectionLabel>
          <ScrollView style={styles.notes} contentContainerStyle={styles.notesContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.notesText}>{update.notes}</Text>
          </ScrollView>
        </>
      )}

      <View style={styles.actions}>
        <PrimaryButton
          label="Download update"
          onPress={() => {
            Linking.openURL(update.url)
            close()
          }}
        />
        <TouchableOpacity style={styles.later} onPress={close} accessibilityRole="button">
          <Text style={styles.laterLabel}>Later</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  intro: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,166,74,0.35)',
    backgroundColor: 'rgba(212,166,74,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introText: {
    flex: 1,
    gap: 2,
  },
  version: {
    fontSize: 24,
    fontFamily: Fonts.serif,
    color: '#F5EEDD',
  },
  meta: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  label: {
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 2,
  },
  notes: {
    maxHeight: 220,
    flexShrink: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
  },
  notesContent: {
    padding: 14,
  },
  notesText: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  actions: {
    marginTop: 20,
    gap: 4,
  },
  later: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterLabel: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
})
