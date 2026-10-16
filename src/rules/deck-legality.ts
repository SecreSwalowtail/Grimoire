import { colorWords } from '@/rules/colors'
import { canShareCommand, commanderStatus } from '@/rules/commander'
import { canBeCommander, copyCount, exactSize, type DeckLine } from '@/rules/deck-stats'
import { copyRule, DECK_FORMAT_KEY, isPlayable, isSingleton, shortName } from '@/rules/formats'
import { hasCommander, type DeckFormat } from '@/utils/deck-store'
import { plural } from '@/utils/format'

// Whether a deck can be played in its format, as a list of checks. Each says what was checked, why
// it passes or what's wrong, and what to do about it. Cards without their full data saved on the
// phone can't be checked for legality or color identity; they're listed so the user can open them.

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'info'

export type LegalCheck = {
  id: string
  status: CheckStatus
  title: string
  detail: string
  // What to do to fix it (fails and warnings).
  fix?: string
  // The cards it's about.
  cards?: string[]
}

type LegalReport = { legal: boolean; checks: LegalCheck[]; problems: number }

const names = (lines: DeckLine[]) => [...new Set(lines.map((l) => l.name))]

const CONSTRUCTED_MIN = 60
const SIDEBOARD_MAX = 15

export function checkDeck(format: DeckFormat, lines: DeckLine[]): LegalReport {
  const checks: LegalCheck[] = []
  const main = lines.filter((l) => l.board === 'main')
  const side = lines.filter((l) => l.board === 'side')
  const mainCount = copyCount(main)
  const sideCount = copyCount(side)
  const key = DECK_FORMAT_KEY[format]
  const commanderFormat = hasCommander(format)
  const size = exactSize(format)

  // ---- Casual: anything goes ----
  if (format === 'Casual') {
    checks.push({
      id: 'casual',
      status: 'pass',
      title: 'Casual has no rules to break',
      detail: `There's no card pool, deck size or copy limit in Casual, so this deck (${plural(mainCount, 'card')}) can be played as it is. Agree on the rules with your table.`,
    })
    return { legal: true, checks, problems: 0 }
  }

  // ---- Deck size ----
  if (size != null) {
    const ok = mainCount === size
    checks.push({
      id: 'size',
      status: ok ? 'pass' : 'fail',
      title: `Deck size ${mainCount} / ${size}`,
      detail: ok
        ? `${format} decks are exactly ${size} cards, commander included, and this one is.`
        : `${format} decks are exactly ${size} cards, commander included. This one has ${mainCount}.`,
      fix: ok
        ? undefined
        : mainCount < size
          ? `Add ${plural(size - mainCount, 'more card')} to the main deck.`
          : `Take ${plural(mainCount - size, 'card')} out of the main deck (or move ${mainCount - size === 1 ? 'it' : 'them'} to Maybe).`,
    })
  } else {
    const ok = mainCount >= CONSTRUCTED_MIN
    checks.push({
      id: 'size',
      status: ok ? 'pass' : 'fail',
      title: `Main deck ${mainCount} cards (at least ${CONSTRUCTED_MIN})`,
      detail: ok
        ? `${format} decks need at least ${CONSTRUCTED_MIN} cards in the main deck, with no upper limit; this one has ${mainCount}.`
        : `${format} decks need at least ${CONSTRUCTED_MIN} cards in the main deck. This one has ${mainCount}.`,
      fix: ok ? undefined : `Add ${plural(CONSTRUCTED_MIN - mainCount, 'more card')} to the main deck.`,
    })
  }

  // ---- Sideboard ----
  if (commanderFormat) {
    if (sideCount > 0) {
      checks.push({
        id: 'side',
        status: 'info',
        title: `Sideboard (${sideCount}) isn't played`,
        detail: `${format} games don't use a sideboard, so these cards are just kept for reference and don't count toward the deck.`,
      })
    }
  } else {
    const ok = sideCount <= SIDEBOARD_MAX
    checks.push({
      id: 'side',
      status: ok ? 'pass' : 'fail',
      title: `Sideboard ${sideCount} / ${SIDEBOARD_MAX}`,
      detail: ok
        ? `A sideboard can have up to ${SIDEBOARD_MAX} cards${sideCount === 0 ? '; this deck has none, which is fine' : ''}.`
        : `A sideboard can have at most ${SIDEBOARD_MAX} cards. This one has ${sideCount}.`,
      fix: ok ? undefined : `Take ${plural(sideCount - SIDEBOARD_MAX, 'card')} out of the sideboard.`,
    })
  }

  // ---- Commander ----
  const commanders = main.filter((l) => l.commander)
  const identity = new Set<string>()
  if (commanderFormat) {
    const leader = format === 'Oathbreaker' ? 'oathbreaker' : 'commander'
    if (commanders.length === 0) {
      checks.push({
        id: 'commander',
        status: 'fail',
        title: `No ${leader}`,
        detail: `A ${format} deck is led by a ${leader}: ${format === 'Oathbreaker' ? 'a planeswalker' : 'a legendary creature'} (or a card that says it can be your commander). Its colors decide which cards the deck can play.`,
        fix: `Hold a card to edit the deck, then drag your ${leader} onto the commander slot at the top.`,
      })
    } else {
      const bad = commanders.filter((c) => !canBeCommander(c) && !(c.card && commanderStatus(c.card).tone === 'partial'))
      const pairOk = commanders.length === 1 || (commanders.length === 2 && canShareCommand(commanders[0], commanders[1]))
      for (const c of commanders) for (const id of c.card?.color_identity ?? c.colors) identity.add(id)
      const who = commanders.map((c) => (c.card ? shortName(c.card) : c.name)).join(' and ')
      if (bad.length) {
        checks.push({
          id: 'commander',
          status: 'fail',
          title: `${names(bad).join(', ')} can't lead a deck`,
          detail: `Only legendary creatures (and cards that say they can be your commander) can be a ${leader}.`,
          fix: 'Drag a legendary creature onto the commander slot to replace it.',
          cards: names(bad),
        })
      } else if (!pairOk) {
        checks.push({
          id: 'commander',
          status: 'fail',
          title: `${who} can't lead together`,
          detail: 'Two commanders are only allowed when they can share command: both with partner, partner with each other, both friends forever, a Doctor and their companion, or a commander that chooses a Background with a Background.',
          fix: 'Keep one of them as commander: drag the one you want onto the commander slot and it takes over alone.',
          cards: commanders.map((c) => c.name),
        })
      } else {
        checks.push({
          id: 'commander',
          status: 'pass',
          title: `Led by ${who}`,
          detail:
            commanders.length === 2
              ? `They can share command, so both lead the deck. Together their color identity is ${colorWords([...identity])}.`
              : `${who} can be your ${leader}. Its color identity is ${colorWords([...identity])}, so every card in the deck must fit within it.`,
        })
      }
      // A commander banned as a commander.
      const bannedLeaders = commanders.filter((c) => key && c.card?.legalities?.[key] === 'banned')
      if (bannedLeaders.length) {
        checks.push({
          id: 'commander-banned',
          status: 'fail',
          title: `${names(bannedLeaders).join(', ')} is banned`,
          detail: `It's on the ${format} ban list, so it can't be your ${leader} (or be in the deck at all).`,
          fix: 'Pick another commander.',
          cards: names(bannedLeaders),
        })
      }
    }
  }

  // Cards without saved data can't be checked further.
  const played = commanderFormat ? main : [...main, ...side]
  const known = played.filter((l) => l.card != null)
  const unknown = played.filter((l) => l.card == null)

  // ---- Card pool (legal / banned / not in the format) ----
  if (key) {
    const banned = known.filter((l) => l.card!.legalities?.[key] === 'banned')
    const notLegal = known.filter((l) => {
      const s = l.card!.legalities?.[key]
      return s !== 'banned' && !isPlayable(s)
    })
    if (banned.length) {
      checks.push({
        id: 'banned',
        status: 'fail',
        title: `${plural(names(banned).length, 'card')} banned in ${format}`,
        detail: `These are on the ${format} ban list and can't be played in it.`,
        fix: `Take ${names(banned).length === 1 ? 'it' : 'them'} out (drag to the trash, or to Maybe to keep ${names(banned).length === 1 ? 'it' : 'them'} around).`,
        cards: names(banned),
      })
    }
    if (notLegal.length) {
      checks.push({
        id: 'pool',
        status: 'fail',
        title: `${plural(names(notLegal).length, 'card')} not in ${format}'s card pool`,
        detail: `${format} only allows cards from its own pool${format === 'Pauper' || format === 'Pauper Commander' ? ' (printed at common)' : ''}; these aren't part of it.`,
        fix: `Swap ${names(notLegal).length === 1 ? 'it' : 'them'} for cards that are legal in ${format}.`,
        cards: names(notLegal),
      })
    }
    if (!banned.length && !notLegal.length && known.length) {
      checks.push({
        id: 'pool',
        status: 'pass',
        title: `Every card is legal in ${format}`,
        detail: `All ${plural(names(known).length, 'card')} checked are in ${format}'s card pool and none are banned.`,
      })
    }
  }

  // ---- Copy limits ----
  const byName = new Map<string, DeckLine[]>()
  for (const l of played) byName.set(l.name, [...(byName.get(l.name) ?? []), l])
  const over: { name: string; n: number; max: number; label: string }[] = []
  for (const [name, ls] of byName) {
    const card = ls.find((l) => l.card)?.card
    if (!card) continue
    const rule = copyRule(card, format)
    const n = copyCount(ls)
    if (rule.max != null && n > rule.max) over.push({ name, n, max: rule.max, label: rule.label })
  }
  const singleton = isSingleton(format)
  checks.push(
    over.length
      ? {
          id: 'copies',
          status: 'fail',
          title: `${plural(over.length, 'card')} over the copy limit`,
          detail: over.map((o) => `${o.name}: ${o.n} copies, ${o.max} allowed`).join('. ') + '.',
          fix: 'Take the extra copies out (move them to Maybe if you want to keep them).',
          cards: over.map((o) => o.name),
        }
      : {
          id: 'copies',
          status: 'pass',
          title: singleton ? 'One copy of each card' : 'Copy limits respected',
          detail: singleton
            ? `${format} is singleton: one copy of each card, except basic lands and cards that say a deck can have any number of them.`
            : `No card has more than 4 copies${commanderFormat ? '' : ' across the deck and sideboard'} (basic lands and cards with their own rule excepted).`,
        },
  )

  // ---- Color identity ----
  if (commanderFormat && commanders.length > 0) {
    const outside = known.filter((l) => !l.commander && (l.card!.color_identity ?? []).some((c) => !identity.has(c)))
    checks.push(
      outside.length
        ? {
            id: 'identity',
            status: 'fail',
            title: `${plural(names(outside).length, 'card')} outside the commander's colors`,
            detail: `Every card's color identity (the mana symbols anywhere on it) must be within ${colorWords([...identity])}.`,
            fix: `Take ${names(outside).length === 1 ? 'it' : 'them'} out, or pick a commander whose colors cover ${names(outside).length === 1 ? 'it' : 'them'}.`,
            cards: names(outside),
          }
        : {
            id: 'identity',
            status: 'pass',
            title: 'Every card fits the color identity',
            detail: `All cards checked use only ${colorWords([...identity])} mana symbols${identity.size < 5 ? ', the commander\'s colors' : ''}.`,
          },
    )
  }

  // ---- Unchecked cards ----
  if (unknown.length) {
    checks.push({
      id: 'unknown',
      status: 'warn',
      title: `${plural(names(unknown).length, 'card')} couldn't be checked`,
      detail: "Their full card data isn't saved on the phone yet, so their legality, colors and copy rules weren't checked.",
      fix: 'Open each one once (tap it in the list) and the check will include it.',
      cards: names(unknown),
    })
  }

  const problems = checks.filter((c) => c.status === 'fail').length
  // Sort: problems first, then warnings, then what passes.
  const order: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2, info: 3 }
  checks.sort((a, b) => order[a.status] - order[b.status])
  return { legal: problems === 0, checks, problems }
}
