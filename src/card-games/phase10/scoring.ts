import type { Card } from '../../card-engine/cards.ts'

// Phase 10's card penalties, summed for the round-loser's hand (lower match score is better):
// numbers 1-9 cost 5, numbers 10-12 cost 10, Skip costs 15, Wild costs 25.
export function cardPenalty(card: Card): number {
  if (card.meta?.kind === 'skip') return 15
  if (card.meta?.kind === 'wild') return 25
  // Every remaining Phase 10 card is a number card — read the rank only here.
  return Number(card.rank) <= 9 ? 5 : 10
}

export function handPenalty(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + cardPenalty(card), 0)
}
