import type { Rank } from '../../card-engine/cards.ts'

// Numeric value for ordering/run-detection: Ace is LOW (1). This is a stable ordering used
// throughout the codebase for connectivity scoring, hand sort, and as the default run-check
// interpretation. For ace-high runs (Q-K-A), use rankValueAceHigh instead.
export const RANK_VALUE: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 11, Q: 12, K: 13, JOKER: 0,   // JOKER is never used by Rummy; 0 is an unreachable placeholder, not a real value
}

export function rankValue(rank: Rank): number {
  return RANK_VALUE[rank]
}

// Ace's alternate value when used as the HIGH end of a run (Q-K-A). Every other rank is
// identical to rankValue — only Ace differs (14 instead of 1).
export function rankValueAceHigh(rank: Rank): number {
  return rank === 'A' ? 14 : rankValue(rank)
}

// The score value of a single card for deadwood purposes (Rummy 500 values): 2–9 count as 5;
// face cards (J/Q/K) and 10 count as 10; an unmelded Ace counts as 15.
export function deadwoodValue(rank: Rank): number {
  if (rank === 'A') return 15
  return rankValue(rank) >= 10 ? 10 : 5
}
