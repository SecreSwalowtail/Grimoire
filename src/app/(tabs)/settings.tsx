import Constants from 'expo-constants';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, SectionLabel, Segmented, Toggle } from '@/components/controls';
import { DevTools } from '@/components/dev/dev-tools';
import { CurrencySheet } from '@/components/settings/currency-sheet';
import { Colors, Fonts } from '@/constants/theme';
import { exportCollection, importCollection } from '@/db/import-export';
import { CONDITIONS } from '@/rules/collection';
import { currencyName, phoneCurrency, useMoney } from '@/utils/money';
import { setSettings, useSettings } from '@/utils/settings';

type Tab = 'settings' | 'tools'

const VERSION = Constants.expoConfig?.version ?? '1.0.0'

// Settings: prices (currency, which market), scanning (condition), the app (animations,
// vibration), the collection (export / import CSV) and about (version, sources). Tools: to come.
// Holding the title for a second opens the Developer tools (performance pass).
export default function SettingsScreen() {
  const db = useSQLiteContext()
  const settings = useSettings()
  const money = useMoney()
  const [tab, setTab] = useState<Tab>('settings')
  const [devTools, setDevTools] = useState(false)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const phone = phoneCurrency()
  const currency = settings.currency ?? phone
  const currencyText = `${currencyName(currency)} (${money.code === currency ? money.symbol : currency})${settings.currency == null ? ' · automatic' : ''}`

  const run = async (work: () => Promise<string | null>) => {
    if (busy) return
    setBusy(true)
    setStatus(null)
    try {
      setStatus(await work())
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }
  const exportCsv = () =>
    run(async () => {
      const { exported } = await exportCollection(db)
      return `Exported ${exported} ${exported === 1 ? 'card' : 'cards'}.`
    })
  const importCsv = () =>
    run(async () => {
      const result = await importCollection(db)
      if (result.canceled) return null
      const failed = result.failed.length ? ` ${result.failed.length} not found (${result.failed.slice(0, 3).map((f) => f.name).join(', ')}${result.failed.length > 3 ? '…' : ''}).` : ''
      return `Imported ${result.imported} ${result.imported === 1 ? 'card' : 'cards'}.${failed}`
    })

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Pressable onLongPress={() => setDevTools(!devTools)} delayLongPress={900} accessibilityRole="header">
        <Text style={styles.title}>Settings</Text>
      </Pressable>
      <View style={styles.tabs}>
        <Segmented
          label="Settings or tools"
          options={[
            { value: 'settings', label: 'Settings' },
            { value: 'tools', label: 'Tools' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.content}>
        {tab === 'tools' ? (
          <View style={styles.soon}>
            <SymbolView name={{ ios: 'wrench.and.screwdriver', android: 'build' }} size={30} tintColor={Colors.goldLight} />
            <Text style={styles.soonTitle}>More tools in future versions</Text>
            <Text style={styles.soonText}>Handy tools for your collection and decks will show up here.</Text>
          </View>
        ) : (
          <>
            <SectionLabel style={styles.label}>Prices</SectionLabel>
            <View style={styles.group}>
              <Row
                title="Currency"
                subtitle={currencyText}
                onPress={() => setCurrencyOpen(true)}
                trailing={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={16} tintColor={Colors.textMuted} />}
              />
              <View style={[styles.item, styles.rule]}>
                <Text style={styles.itemTitle}>Prices from</Text>
                <Text style={styles.itemSubtitle}>The market the Market and Card detail show first.</Text>
                <View style={styles.control}>
                  <Segmented
                    label="Prices from"
                    small
                    options={[
                      { value: 'cardmarket', label: 'Cardmarket' },
                      { value: 'tcgplayer', label: 'TCGplayer' },
                    ]}
                    value={settings.priceSource}
                    onChange={(priceSource) => setSettings({ priceSource })}
                  />
                </View>
              </View>
            </View>
            <Text style={styles.note}>
              Prices are converted from euros and dollars with the European Central Bank&apos;s daily rates.
            </Text>

            <SectionLabel style={styles.label}>Scanning</SectionLabel>
            <View style={styles.group}>
              <View style={styles.item}>
                <Text style={styles.itemTitle}>Condition of scanned cards</Text>
                <Text style={styles.itemSubtitle}>{CONDITIONS.find((c) => c.code === settings.scanCondition)?.name}. You can change a card&apos;s condition later.</Text>
                <View style={[styles.control, styles.chips]}>
                  {CONDITIONS.map((c) => (
                    <Chip key={c.code} label={c.code} selected={settings.scanCondition === c.code} onPress={() => setSettings({ scanCondition: c.code })} />
                  ))}
                </View>
              </View>
            </View>

            <SectionLabel style={styles.label}>App</SectionLabel>
            <View style={styles.group}>
              <Row
                title="Animations"
                subtitle="Card effects, transitions and bounces. Turn off on slower phones; dragging still works."
                trailing={<Toggle value={settings.animations} onChange={(animations) => setSettings({ animations })} label="Animations" />}
              />
              <Row
                rule
                title="Vibration"
                subtitle="Light taps when you swipe through cards or read the price chart."
                trailing={<Toggle value={settings.haptics} onChange={(haptics) => setSettings({ haptics })} label="Vibration" />}
              />
            </View>

            <SectionLabel style={styles.label}>Collection</SectionLabel>
            <View style={styles.group}>
              <Row title="Export collection" subtitle="Every card in your binders, as a CSV file (Moxfield's format)." onPress={exportCsv} disabled={busy} trailing={<Action icon={{ ios: 'square.and.arrow.up', android: 'ios_share' }} />} />
              <Row rule title="Import collection" subtitle="Add cards from a CSV file, e.g. exported from Moxfield." onPress={importCsv} disabled={busy} trailing={<Action icon={{ ios: 'square.and.arrow.down', android: 'download' }} />} />
            </View>
            {(busy || status) && <Text style={styles.status}>{busy ? 'Working…' : status}</Text>}

            <SectionLabel style={styles.label}>About</SectionLabel>
            <View style={styles.group}>
              <Row title="Version" trailing={<Text style={styles.value}>{VERSION}</Text>} />
              <Row rule title="Card data and images" subtitle="Scryfall. Prices: Cardmarket and TCGplayer, through Scryfall." />
            </View>
            <Text style={styles.note}>
              Grimoire is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of
              the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
            </Text>
          </>
        )}
        {devTools && <DevTools />}
      </ScrollView>

      <CurrencySheet visible={currencyOpen} onClose={() => setCurrencyOpen(false)} />
    </SafeAreaView>
  )
}

// A settings row: title, explanation, something at the end (a toggle, a value, an arrow).
// `onPress` makes the whole row a button.
function Row({
  title,
  subtitle,
  trailing,
  onPress,
  disabled,
  rule,
}: {
  title: string
  subtitle?: string
  trailing?: ReactNode
  onPress?: () => void
  disabled?: boolean
  rule?: boolean
}) {
  const content = (
    <>
      <View style={styles.rowText}>
        <Text style={styles.itemTitle}>{title}</Text>
        {subtitle != null && <Text style={styles.itemSubtitle}>{subtitle}</Text>}
      </View>
      {trailing}
    </>
  )
  if (!onPress) return <View style={[styles.row, rule && styles.rule]}>{content}</View>
  return (
    <TouchableOpacity style={[styles.row, rule && styles.rule, disabled && styles.off]} onPress={onPress} disabled={disabled} accessibilityRole="button">
      {content}
    </TouchableOpacity>
  )
}

function Action({ icon }: { icon: SymbolViewProps['name'] }) {
  return <SymbolView name={icon} size={20} tintColor={Colors.goldLight} />
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  title: {
    marginTop: 16,
    marginHorizontal: 20,
    fontSize: 42,
    fontFamily: Fonts.serif,
    color: Colors.text,
  },
  tabs: {
    marginTop: 12,
    marginHorizontal: 20,
  },
  scroll: {
    flex: 1,
    marginTop: 8,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  label: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 2,
  },
  group: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  row: {
    minHeight: 60,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rule: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(237,230,214,0.07)',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 2,
  },
  itemTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  itemSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  control: {
    marginTop: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  value: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
  note: {
    marginTop: 8,
    marginHorizontal: 4,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  status: {
    marginTop: 8,
    marginHorizontal: 4,
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.goldLight,
  },
  off: {
    opacity: 0.5,
  },
  soon: {
    marginTop: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
  },
  soonTitle: {
    marginTop: 6,
    fontSize: 24,
    fontFamily: Fonts.serif,
    color: Colors.text,
    textAlign: 'center',
  },
  soonText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
})
