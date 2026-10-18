import type { File } from 'expo-file-system'
import { useEffect, useRef, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { PrimaryButton, ProgressBar, SectionLabel, Sheet, SheetHeader } from '@/components/controls'
import { Icon } from '@/components/icon'
import { Colors, Fonts } from '@/constants/theme'
import { canInstallInApp, checkForAppUpdate, downloadUpdate, installUpdate, type AppUpdate } from '@/utils/app-update'

type Step =
  | { kind: 'idle' }
  | { kind: 'downloading'; progress: number }
  | { kind: 'ready'; apk: File }
  | { kind: 'error'; message: string }

// Checks GitHub for a newer release each time the app opens, and offers it. On Android the app
// downloads the APK itself (with a progress bar) and opens the system installer on it, where the
// user taps Install; elsewhere, or with no APK attached, the release opens in the browser.
export function UpdateSheet() {
  const [update, setUpdate] = useState<AppUpdate | null>(null)
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    checkForAppUpdate().then((found) => {
      if (!found) return
      setUpdate(found)
      setVisible(true)
    })
  }, [])

  if (!update) return null
  const inApp = canInstallInApp(update)
  const close = () => {
    abort.current?.abort()
    setVisible(false)
  }

  const install = async (apk: File) => {
    try {
      await installUpdate(apk)
    } catch (e) {
      console.warn('Opening the installer failed', e)
      setStep({ kind: 'error', message: e instanceof Error ? e.message : 'Could not open the installer.' })
    }
  }

  const download = async () => {
    const controller = new AbortController()
    abort.current = controller
    setStep({ kind: 'downloading', progress: 0 })
    try {
      const apk = await downloadUpdate(update, (progress) => setStep({ kind: 'downloading', progress }), controller.signal)
      setStep({ kind: 'ready', apk })
      install(apk)
    } catch (e) {
      if (controller.signal.aborted) {
        setStep({ kind: 'idle' })
        return
      }
      console.warn('Downloading the update failed', e)
      setStep({ kind: 'error', message: e instanceof Error ? e.message : 'The download failed.' })
    } finally {
      abort.current = null
    }
  }

  const megabytes = (bytes: number) => `${Math.round(bytes / 1048576)} MB`

  return (
    <Sheet visible={visible} onClose={close}>
      <SheetHeader title="Update available" onClose={close} />
      <View style={styles.intro}>
        <View style={styles.badge}>
          <Icon name={{ ios: 'arrow.down.circle', android: 'download' }} size={22} tintColor={Colors.gold} />
        </View>
        <View style={styles.introText}>
          <Text style={styles.version}>Grimoire {update.version}</Text>
          <Text style={styles.meta}>
            {inApp
              ? `Downloads here (${megabytes(update.size ?? 0)}), then Android asks you to install it. Your collection stays.`
              : 'Download it, then open the file to install over this version. Your collection stays.'}
          </Text>
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

      {step.kind === 'downloading' && (
        <View style={styles.progress}>
          <ProgressBar value={step.progress} label="Downloading the update" />
          <Text style={styles.meta}>
            Downloading… {Math.round(step.progress * 100)}%{update.size ? ` of ${megabytes(update.size)}` : ''}
          </Text>
        </View>
      )}
      {step.kind === 'error' && <Text style={styles.error}>{step.message}</Text>}

      <View style={styles.actions}>
        {step.kind === 'downloading' ? null : step.kind === 'ready' ? (
          <PrimaryButton label="Install update" onPress={() => install(step.apk)} />
        ) : (
          <PrimaryButton
            label={step.kind === 'error' ? 'Try again' : 'Download update'}
            onPress={() => {
              if (inApp) {
                download()
                return
              }
              Linking.openURL(update.url)
              close()
            }}
          />
        )}
        <TouchableOpacity style={styles.later} onPress={close} accessibilityRole="button">
          <Text style={styles.laterLabel}>{step.kind === 'downloading' ? 'Cancel' : 'Later'}</Text>
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
  progress: {
    marginTop: 20,
    gap: 8,
  },
  error: {
    marginTop: 16,
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.danger,
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
