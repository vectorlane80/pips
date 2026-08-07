import type { Card } from '../../card-engine/cards.ts'
import { rankValue } from './rank.ts'

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
    const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => a - b)
    let consecutive = true
    for (let i = 0; i < values.length - 1; i++) {
      if (values[i + 1] !== values[i] + 1) {
        consecutive = false
        break
      }
    }
    if (consecutive) {
      return { valid: true, type: 'run' }
    }
  }

  return { valid: false }
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
