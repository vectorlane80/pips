import type { BotStrategy } from '../../engine/bot.ts'
import { topCard } from '../../card-engine/zones.ts'
import type { UnoCard, UnoColor } from './deck.ts'
import type { UnoAction, UnoPrivateState, UnoPublicState } from './state.ts'
import { isUnoPlayable } from './state.ts'

const COLOR_ORDER: UnoColor[] = ['red', 'yellow', 'green', 'blue']

// Play-preference rank: action cards (skip/reverse/draw2) highest, plain numbers middle,
// wild/wild4 lowest — hold wilds in reserve when a non-wild option works.
function cardRank(card: UnoCard): number {
  if (card.kind === 'wild' || card.kind === 'wild4') return 0
  if (card.kind === 'skip' || card.kind === 'reverse' || card.kind === 'draw2') return 2
  return 1
}

function pickBest(playable: UnoCard[]): string {
  let best = playable[0]
  for (const card of playable) {
    if (cardRank(card) > cardRank(best)) best = card
  }
  return best.id
}

// Deterministic policy: pending wild → choose the color the bot holds most of (ties broken by
// red/yellow/green/blue order); else play the best-ranked legal card; else draw; after a draw
// that produced a playable card, play it, otherwise pass. Bot turns run as a sequence of
// runBotTurn calls until the turn passes — a wild/wild4 play's color choice happens on the
// next invocation while pendingWild is still set.
export const unoBotStrategy: BotStrategy<UnoPublicState, UnoPrivateState, UnoAction> = (
  publicState,
  privateState,
  playerId,
) => {
  const hand = privateState.hand.cards
  const top = topCard(publicState.discardPile)!

  if (publicState.pendingSevenSwap !== null) {
    // The bot just played a 7, so it owes a swap-target choice. Find the opponent with the fewest cards,
    // tie-broken by seat order.
    let targetPlayerId = ''
    let minCards = Infinity
    for (const seatPlayerId of publicState.seatOrder) {
      if (seatPlayerId === playerId) continue
      const seatCardCount = publicState.handCounts[seatPlayerId] ?? 0
      if (seatCardCount < minCards) {
        minCards = seatCardCount
        targetPlayerId = seatPlayerId
      }
    }
    return { type: 'CHOOSE_SWAP_TARGET', targetPlayerId }
  }

  if (publicState.pendingWild !== null) {
    // The bot just played a wild/wild4, so it owes a color choice. An empty hand is
    // unreachable (going out on a wild never sets pendingWild) but keep the function total.
    if (hand.length === 0) return { type: 'CHOOSE_COLOR', color: 'red' }
    const counts: Record<UnoColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 }
    for (const card of hand) {
      if (card.color !== 'wild') counts[card.color]++
    }
    let best: UnoColor = 'red'
    for (const color of COLOR_ORDER) {
      if (counts[color] > counts[best]) best = color
    }
    return { type: 'CHOOSE_COLOR', color: best }
  }

  // Check for pending stack (after pendingWild, since a wild4 stack still routes through pendingWild for color choice)
  if (publicState.pendingStack !== null) {
    const stackMatching = hand.filter((card) => card.kind === publicState.pendingStack!.kind)
    if (stackMatching.length > 0) {
      // Play the first matching card (deterministic)
      return { type: 'PLAY_CARD', cardId: stackMatching[0].id }
    }
    // No matching card: draw the pile
    return { type: 'DRAW_CARD' }
  }

  const playable = hand.filter((card) => isUnoPlayable(card, top, publicState.activeColor))

  // Already drew this turn: play the drawn card now that it's playable, else pass.
  if (publicState.hasDrawnThisTurn) {
    if (playable.length === 0) return { type: 'PASS' }
    return { type: 'PLAY_CARD', cardId: pickBest(playable) }
  }

  if (playable.length > 0) return { type: 'PLAY_CARD', cardId: pickBest(playable) }
  return { type: 'DRAW_CARD' }
}
