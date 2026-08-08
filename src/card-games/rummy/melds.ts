import type { Card } from '../../card-engine/cards.ts'
import { rankValue, rankValueAceHigh } from './rank.ts'

export type MeldType = 'set' | 'run'

export interface MeldClassification {
  valid: boolean
  type?: MeldType   // present iff valid
}

export function classifyMeld(cards: Card[]): MeldClassification {
  if (cards.length < 3) {
    return { valid: false }
  }

  // Set check: same rank, all different suits
  const firstRank = cards[0].rank
  const allSameRank = cards.every((c) => c.rank === firstRank)
  if (allSameRank) {
    const uniqueSuits = new Set(cards.map((c) => c.suit)).size
    if (uniqueSuits === cards.length) {
      return { valid: true, type: 'set' }
    }
    return { valid: false }
  }

  // Run check: same suit, consecutive rank values
  const firstSuit = cards[0].suit
  const allSameSuit = cards.every((c) => c.suit === firstSuit)
  if (allSameSuit) {
    // Try the default (ace-low) interpretation first
    const valuesLow = cards.map((c) => rankValue(c.rank)).sort((a, b) => a - b)
    if (isConsecutive(valuesLow)) {
      return { valid: true, type: 'run' }
    }

    // If there's an Ace and the low interpretation failed, retry with ace-high
    if (cards.some((c) => c.rank === 'A')) {
      const valuesHigh = cards.map((c) => rankValueAceHigh(c.rank)).sort((a, b) => a - b)
      if (isConsecutive(valuesHigh)) {
        return { valid: true, type: 'run' }
      }
    }
  }

  return { valid: false }
}

function isConsecutive(sortedValues: number[]): boolean {
  for (let i = 0; i < sortedValues.length - 1; i++) {
    if (sortedValues[i + 1] !== sortedValues[i] + 1) {
      return false
    }
  }
  return true
}

// Standalone, re-derivable: true iff `cards` (a complete meld, e.g. from a laid-down Zone)
// is a run where the Ace (if present) is being used HIGH (e.g. Q-K-A). Re-derived by actually
// checking consecutiveness under both interpretations, the same way classifyMeld itself
// decides — NOT by a "contains both an Ace and a King" presence heuristic, which misfires on
// the one edge case where a run is long enough to contain both under the ace-LOW interpretation
// (a full 13-card A..K same-suit run: valid via ace=1, but "contains a King" would wrongly
// suggest ace-high and overvalue the Ace by 10 points). Used by scoring and, if ever needed,
// display-sort — neither needs classifyMeld's transient result from lay-down time.
export function isAceHighRun(cards: Card[]): boolean {
  if (!cards.some((c) => c.rank === 'A')) return false
  const valuesLow = cards.map((c) => rankValue(c.rank)).sort((a, b) => a - b)
  if (isConsecutive(valuesLow)) return false   // ace-low interpretation already validates this run
  const valuesHigh = cards.map((c) => rankValueAceHigh(c.rank)).sort((a, b) => a - b)
  return isConsecutive(valuesHigh)
}

// True iff some 3+ subset of `cards` that includes `requiredId` forms a valid meld
// (set or run) per classifyMeld. Used to validate a discard-pile reach-in: the
// obligated card must actually be usable, or the player would be stuck forever.
export function hasMeldIncluding(cards: Card[], requiredId: string): boolean {
  const required = cards.find((c) => c.id === requiredId)
  if (!required) return false
  const others = cards.filter((c) => c.id !== requiredId)
  // try every subset of `others` of size 2..others.length, combined with `required`
  const n = others.length
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset: Card[] = [required]
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(others[i])
    }
    if (subset.length >= 3 && classifyMeld(subset).valid) {
      return true
    }
  }
  return false
}
