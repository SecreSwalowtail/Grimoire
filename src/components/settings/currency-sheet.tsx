import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { Sheet, SheetHeader } from '@/components/controls'
import { RadioDot } from '@/components/decks/parts'
import { Colors, Fonts } from '@/constants/theme'
import { CURRENCIES, currencyName, phoneCurrency } from '@/utils/money'
import { setSettings, useSettings } from '@/utils/settings'

// Settings → Currency: Automatic (from the phone's language) or any currency the exchange rates
// cover. Picking one closes the sheet.
export function CurrencySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { currency } = useSettings()
  const phone = phoneCurrency()
  const pick = (code: string | null) => {
    setSettings({ currency: code })
    onClose()
  }

  return (
    <Sheet visible={visible} onClose={onClose} fullHeight>
      <SheetHeader title="Currency" onClose={onClose} />
      <ScrollView showsVerticalScrollIndicator={false} style={styles.body} contentContainerStyle={styles.list} accessibilityRole="radiogroup">
        <Option
          label="Automatic"
          detail={`${currencyName(phone)} (${phone}), from your phone's language`}
          selected={currency == null}
          onPress={() => pick(null)}
        />
        {CURRENCIES.map((c) => (
          <Option key={c.code} label={c.name} detail={c.code} selected={currency === c.code} onPress={() => pick(c.code)} />
        ))}
      </ScrollView>
    </Sheet>
  )
}

function Option({ label, detail, selected, onPress }: { label: string; detail: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.option, selected && styles.optionOn]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <View style={styles.optionText}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionDetail}>{detail}</Text>
      </View>
      <RadioDot selected={selected} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    marginTop: 8,
  },
  list: {
    gap: 8,
    paddingBottom: 24,
  },
  option: {
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.10)',
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  optionOn: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212,166,74,0.08)',
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionLabel: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  optionDetail: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
})
