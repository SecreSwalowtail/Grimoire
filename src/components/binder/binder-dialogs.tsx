import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { RadioDot } from '@/components/decks/parts';
import { Colors, Fonts } from '@/constants/theme';
import type { Binder } from '@/db/binders';

const DANGER = '#EE8466'

const cardsText = (n: number) => `${n} ${n === 1 ? 'card' : 'cards'}`

// Centered dialog in the style of Decks' "Delete folder?": icon, serif title, text, optional
// choices, then the action and Cancel.
function Dialog({
  visible,
  icon,
  danger,
  title,
  body,
  action,
  onAction,
  onClose,
  children,
}: {
  visible: boolean
  icon: SymbolViewProps['name']
  danger?: boolean
  title: string
  body: string
  action: string
  onAction: () => void
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityRole="alert" accessibilityViewIsModal>
          <View style={[styles.icon, danger ? styles.iconDanger : styles.iconGold]}>
            <SymbolView name={icon} size={26} tintColor={danger ? DANGER : Colors.goldLight} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {children}
          <TouchableOpacity style={[styles.action, danger ? styles.actionDanger : styles.actionGold]} onPress={onAction} accessibilityRole="button">
            <Text style={[styles.actionLabel, !danger && styles.actionLabelGold]}>{action}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// "Remove binder?" for one or more binders: when they hold cards, move them to another binder
// (the first one picked) or delete them too.
export function RemoveBinderDialog({
  binders,
  cards,
  others,
  onRemove,
  onClose,
}: {
  binders: Binder[]
  cards: number
  others: Binder[]
  onRemove: (moveTo: string | null) => void
  onClose: () => void
}) {
  const [moveTo, setMoveTo] = useState<string | null>(null)
  // Default to keeping the cards, in the first other binder, each time it opens.
  const key = binders.map((b) => b.id).join(',')
  const [openFor, setOpenFor] = useState('')
  if (key !== openFor) {
    setOpenFor(key)
    setMoveTo(others[0]?.id ?? null)
  }
  const one = binders.length === 1

  const choices = [
    ...others.map((b) => ({ id: b.id as string | null, title: `Move to ${b.name}`, sub: `Keep the ${cardsText(cards)}`, dot: b.color, accent: Colors.gold })),
    { id: null, title: 'Delete the cards too', sub: `Remove ${one ? 'the binder and its' : 'the binders and their'} ${cardsText(cards)}`, dot: null, accent: DANGER },
  ]
  const deleting = cards > 0 && moveTo == null

  return (
    <Dialog
      visible={binders.length > 0}
      icon={{ ios: 'trash', android: 'delete' }}
      danger
      title={one ? `Remove “${binders[0].name}”?` : `Remove ${binders.length} binders?`}
      body={
        cards === 0
          ? one ? 'This binder is empty.' : 'These binders are empty.'
          : `${one ? 'It holds' : 'They hold'} ${cardsText(cards)}. What should happen to them?`
      }
      action={`Remove ${one ? 'binder' : `${binders.length} binders`}${deleting ? ` & ${cardsText(cards)}` : ''}`}
      onAction={() => onRemove(cards > 0 ? moveTo : null)}
      onClose={onClose}
    >
      {cards > 0 && (
        <ScrollView style={styles.choicesBox} bounces={false}>
          <View accessibilityRole="radiogroup" style={styles.choices}>
            {choices.map((c) => {
              const selected = c.id === moveTo
              return (
                <Pressable
                  key={c.id ?? 'delete'}
                  style={[styles.choice, selected && { borderWidth: 1.5, borderColor: c.accent, backgroundColor: c.id ? 'rgba(212,166,74,0.08)' : 'rgba(181,65,42,0.12)' }]}
                  onPress={() => setMoveTo(c.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                >
                  <RadioDot selected={selected} color={c.accent} />
                  <View style={styles.choiceText}>
                    <Text style={styles.choiceTitle} numberOfLines={1}>{c.title}</Text>
                    <Text style={styles.choiceSub}>{c.sub}</Text>
                  </View>
                  {c.dot && <View style={[styles.dot, { backgroundColor: c.dot }]} />}
                </Pressable>
              )
            })}
          </View>
        </ScrollView>
      )}
    </Dialog>
  )
}

// "Merge binders?" after dropping one binder on another.
export function MergeBindersDialog({
  from,
  into,
  cards,
  onMerge,
  onClose,
}: {
  from: Binder | null
  into: Binder | null
  cards: number
  onMerge: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      visible={from != null && into != null}
      icon={{ ios: 'arrow.triangle.merge', android: 'merge' }}
      title="Merge binders?"
      body={
        cards === 0
          ? `“${from?.name}” is empty, so it's just removed. “${into?.name}” stays as it is.`
          : `The ${cardsText(cards)} in “${from?.name}” move into “${into?.name}”, and “${from?.name}” is removed. Copies of the same printing add up.`
      }
      action="Merge"
      onAction={onMerge}
      onClose={onClose}
    />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDanger: {
    borderColor: 'rgba(238,132,102,0.35)',
    backgroundColor: 'rgba(181,65,42,0.16)',
  },
  iconGold: {
    borderColor: 'rgba(212,166,74,0.35)',
    backgroundColor: 'rgba(212,166,74,0.12)',
  },
  title: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 30,
    lineHeight: 34,
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
  choicesBox: {
    marginTop: 18,
    maxHeight: 280,
    flexGrow: 0,
  },
  choices: {
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
  dot: {
    width: 12,
    height: 12,
    borderRadius: 4,
  },
  action: {
    marginTop: 18,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDanger: {
    backgroundColor: '#B5412A',
  },
  actionGold: {
    backgroundColor: Colors.gold,
  },
  actionLabel: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: '#FFF4EC',
  },
  actionLabelGold: {
    color: Colors.onGold,
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
})
