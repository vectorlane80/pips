import type { BotStrategy } from '../../engine/bot.ts'
import { topCard } from '../../card-engine/zones.ts'
import { chooseBuildPile, selectEmptiestDiscardPile } from './rules.ts'
import type { Card } from '../../card-engine/cards.ts'
import type { SkipBoPublicState, SkipBoPrivateState, SkipBoAction } from './state.ts'

/**
 * Pick the card to discard when nothing is playable: the highest-value (highest-rank)
 * numbered card — a 12 is the hardest card to ever play, a 1 the easiest. A wild is never
 * chosen while ANY numbered card remains (wilds are precious — discarded only when the whole
 * hand is wilds, then the first one in hand order goes).
 */
export function selectSkipBoDiscard(hand: Card[]): string {
  let best: Card | null = null
  for (const card of hand) {
    if (card.meta?.kind === 'wild') continue
    if (!best || Number(card.rank) > Number(best.rank)) {
      best = card
    }
  }
  if (!best) return hand[0].id
  return best.id
}

// Mirrors rummyBotStrategy's shape: a pure function returning ONE action per call — the host's
// bot-turn loop re-invokes it after every successful action, so each rung is checked against
// the fresh state each time. Priority order is locked by spec 40.
export const skipBoBotStrategy: BotStrategy<
  SkipBoPublicState,
  SkipBoPrivateState,
  SkipBoAction
> = (publicState, privateState, playerId) => {
  const stockTop = publicState.stockTops[playerId] ?? null
  const hand = privateState.hand.cards
  const discards = privateState.discards
  const buildPiles = publicState.buildPiles

  // 1. Stock top first — never sit on a playable stockpile card.
  if (stockTop) {
    const target = chooseBuildPile(stockTop, buildPiles)
    if (target !== -1) return { type: 'PLAY_STOCK', buildPileIndex: target }
  }

  // 2. Own discard-pile tops — lowest pile index among qualifying piles.
  for (let i = 0; i < discards.length; i++) {
    const top = topCard(discards[i])
    if (top) {
      const target = chooseBuildPile(top, buildPiles)
      if (target !== -1) return { type: 'PLAY_DISCARD', pileIndex: i, buildPileIndex: target }
    }
  }

  // 3. Numbered hand cards — first legal match in hand order.
  for (const card of hand) {
    if (card.meta?.kind === 'number') {
      const target = chooseBuildPile(card, buildPiles)
      if (target !== -1) return { type: 'PLAY_HAND', cardId: card.id, buildPileIndex: target }
    }
  }

  // 4. Wilds last among hand cards — hoard them until genuinely stuck (always legal).
  const wild = hand.find((c) => c.meta?.kind === 'wild')
  if (wild) {
    const target = chooseBuildPile(wild, buildPiles)
    if (target !== -1) return { type: 'PLAY_HAND', cardId: wild.id, buildPileIndex: target }
  }

  // 5. Nothing playable anywhere: pass an empty hand, otherwise discard the least useful card
  //    onto the emptiest of the player's own 4 discard piles (ties -> lowest index).
  if (hand.length === 0) {
    return { type: 'PASS' }
  }
  return {
    type: 'DISCARD',
    cardId: selectSkipBoDiscard(hand),
    pileIndex: selectEmptiestDiscardPile(discards),
  }
}
