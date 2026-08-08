import type { Card } from '../../card-engine/cards.ts'
import type { Zone } from '../../card-engine/zones.ts'
import { deadwoodValue } from './rank.ts'
import { isAceHighRun } from './melds.ts'

// The point value of a single card WITHIN a meld it's part of. Every rank except Ace has a
// fixed value regardless of context (same as deadwoodValue). An Ace is worth 15 in a set of
// aces or an Ace-high run (Q-K-A), 5 in an Ace-low run (A-2-3).
export function meldedCardValue(card: Card, meldCards: Card[]): number {
  if (card.rank !== 'A') return deadwoodValue(card.rank)
  const isSet = meldCards.every((c) => c.rank === 'A')
  if (isSet) return 15
  return isAceHighRun(meldCards) ? 15 : 5
}

// Total point value of one laid-down meld.
export function meldValue(meldCards: Card[]): number {
  return meldCards.reduce((sum, card) => sum + meldedCardValue(card, meldCards), 0)
}

// Unmelded hand penalty — unchanged in shape, but deadwoodValue itself now scores an
// unmelded Ace at 15 (see rank.ts).
export function deadwood(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + deadwoodValue(card.rank), 0)
}

// A player's score contribution THIS ROUND: sum of their melded cards' point values,
// minus the deadwood penalty of whatever's left in their hand (0 for a player who went out).
export function playerRoundScore(melds: Zone[], remainingHand: Card[]): number {
  const meldedTotal = melds.reduce((sum, meld) => sum + meldValue(meld.cards), 0)
  return meldedTotal - deadwood(remainingHand)
}
