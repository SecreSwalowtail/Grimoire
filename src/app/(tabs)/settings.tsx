import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Toggle } from '@/components/controls';
import { Colors, Fonts } from '@/constants/theme';
import { clearDatabase, hasTestData, seedTestData } from '@/utils/dev-seed';
import { clearTimings, setFpsMeter, useFpsMeter, useTimings } from '@/utils/perf';

// Settings isn't designed in the app yet. Holding the title for a second opens the Developer
// tools for the performance pass: test data, the frame-rate meter and recent timings. They work
// in release builds and stay hidden otherwise.
export default function SettingsScreen() {
  const [devTools, setDevTools] = useState(false)
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Pressable onLongPress={() => setDevTools(!devTools)} delayLongPress={900} accessibilityRole="header">
        <Text style={styles.title}>Settings</Text>
      </Pressable>
      {devTools && <DevTools />}
    </SafeAreaView>
  )
}

function DevTools() {
  const db = useSQLiteContext()
  const meter = useFpsMeter()
  const timings = useTimings()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  // Clearing erases your own cards and decks too: the first tap only asks.
  const [confirmClear, setConfirmClear] = useState(false)

  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await work()
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const fill = () =>
    run(async () => {
      if (await hasTestData(db)) {
        setStatus('Test data is already there. Clear the database first.')
        return
      }
      await seedTestData(db, setStatus)
    })

  const clear = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      setStatus('This erases everything: your binder, decks, folders and price history. Tap again to confirm.')
      return
    }
    setConfirmClear(false)
    run(async () => {
      setStatus('Clearing the database…')
      await clearDatabase(db)
      setStatus('Database cleared.')
    })
  }

  return (
    <ScrollView style={styles.tools} contentContainerStyle={styles.toolsContent}>
      <Text style={styles.label}>Developer tools</Text>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Test data</Text>
        <Text style={styles.body}>
          About 2,000 real cards in the binder (1 in 5 foil, 30 days of prices) and 50 decks of 100–200 cards. Needs internet; takes a
          minute. Clear database erases everything, your own cards and decks too.
        </Text>
        <View style={styles.buttons}>
          <TouchableOpacity style={[styles.button, styles.primary, busy && styles.off]} onPress={fill} disabled={busy} accessibilityRole="button">
            <Text style={styles.primaryLabel}>Fill with test data</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, confirmClear && styles.danger, busy && styles.off]}
            onPress={clear}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonLabel, confirmClear && styles.dangerLabel]}>{confirmClear ? 'Tap to erase' : 'Clear database'}</Text>
          </TouchableOpacity>
        </View>
        {status && <Text style={styles.status}>{status}</Text>}
      </View>

      <View style={[styles.panel, styles.row]}>
        <View style={styles.rowText}>
          <Text style={styles.panelTitle}>Frame-rate meter</Text>
          <Text style={styles.body}>UI and JS frames per second, and the slowest frame, top right.</Text>
        </View>
        <Toggle value={meter} onChange={setFpsMeter} label="Frame-rate meter" />
      </View>

      <View style={styles.panel}>
        <View style={styles.row}>
          <Text style={[styles.panelTitle, styles.rowText]}>Timings</Text>
          <TouchableOpacity onPress={clearTimings} accessibilityRole="button">
            <Text style={styles.link}>Clear</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.body}>Newest first, last 100. Also in the device log as [perf] lines.</Text>
        {timings.length === 0 ? (
          <Text style={styles.status}>Nothing yet: use the app, then come back.</Text>
        ) : (
          timings.map((t, i) => (
            <View key={`${t.at}-${i}`} style={styles.timing}>
              <Text style={styles.timingName} numberOfLines={2}>
                {t.name}
                {t.detail ? <Text style={styles.timingDetail}> · {t.detail}</Text> : null}
              </Text>
              <Text style={styles.timingMs}>{t.ms} ms</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  title: {
    marginTop: 16,
    fontSize: 42,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  tools: {
    flex: 1,
    marginTop: 16,
  },
  toolsContent: {
    gap: 12,
    paddingBottom: 120,
  },
  label: {
    marginLeft: 2,
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  panel: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 8,
  },
  panelTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  buttons: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.surfaceRaised,
    justifyContent: 'center',
  },
  primary: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.gold,
  },
  off: {
    opacity: 0.5,
  },
  danger: {
    backgroundColor: '#B5412A',
  },
  dangerLabel: {
    color: '#FFF4EC',
  },
  primaryLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.onGold,
  },
  buttonLabel: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  status: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.goldLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  link: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Colors.gold,
  },
  timing: {
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timingName: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
  timingDetail: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  timingMs: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
})
