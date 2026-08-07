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
