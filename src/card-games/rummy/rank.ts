import type { Rank } from '../../card-engine/cards.ts'

// Numeric value for ordering/run-detection: Ace is LOW (1), no wrap-around (King does not
// connect back to Ace). This is a fixed rule for this Rummy implementation, not configurable.
export const RANK_VALUE: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 11, Q: 12, K: 13, JOKER: 0,   // JOKER is never used by Rummy; 0 is an unreachable placeholder, not a real value
}

export function rankValue(rank: Rank): number {
  return RANK_VALUE[rank]
}

// The score value of a single card for deadwood purposes: face cards (J/Q/K) and 10 all count
// as 10; everything else counts as its numeric rank; Ace counts as 1 (never 11/high).
export function deadwoodValue(rank: Rank): number {
  return Math.min(rankValue(rank), 10)
}
