import { describe, it, expect } from 'vitest'
import { classifyMeld } from './melds.ts'
import type { Card } from '../../card-engine/cards.ts'

function card(id: string, suit: Card['suit'], rank: Card['rank']): Card {
  return { id, suit, rank, deckIndex: 0 }
}

describe('classifyMeld', () => {
  // --- Too short ---
  it('rejects empty array', () => {
    expect(classifyMeld([])).toEqual({ valid: false })
  })

  it('rejects 1-card selection', () => {
    expect(classifyMeld([card('c1', 'spades', '7')])).toEqual({ valid: false })
  })

  it('rejects 2-card selection', () => {
    expect(classifyMeld([
      card('c1', 'spades', '7'),
      card('c2', 'hearts', '7'),
    ])).toEqual({ valid: false })
  })

  // --- Valid sets ---
  it('classifies 3 cards same rank all different suits as a set', () => {
    const result = classifyMeld([
      card('c1', 'spades', '7'),
      card('c2', 'hearts', '7'),
      card('c3', 'diamonds', '7'),
    ])
    expect(result).toEqual({ valid: true, type: 'set' })
  })

  it('classifies 4 cards same rank all 4 suits as a set', () => {
    const result = classifyMeld([
      card('c1', 'spades', 'K'),
      card('c2', 'hearts', 'K'),
      card('c3', 'diamonds', 'K'),
      card('c4', 'clubs', 'K'),
    ])
    expect(result).toEqual({ valid: true, type: 'set' })
  })

  // --- Invalid sets ---
  it('rejects same-rank cards with duplicate suits', () => {
    // Two 7 of spades (different id/deckIndex but same suit)
    const result = classifyMeld([
      card('c1', 'spades', '7'),
      card('c2', 'spades', '7'),
      card('c3', 'hearts', '7'),
    ])
    expect(result).toEqual({ valid: false })
  })

  // --- Valid runs ---
  it('classifies 3 consecutive same-suit cards as a run', () => {
    const result = classifyMeld([
      card('c1', 'hearts', '3'),
      card('c2', 'hearts', '4'),
      card('c3', 'hearts', '5'),
    ])
    expect(result).toEqual({ valid: true, type: 'run' })
  })

  it('classifies 5-card consecutive same-suit run', () => {
    const result = classifyMeld([
      card('c1', 'clubs', '5'),
      card('c2', 'clubs', '6'),
      card('c3', 'clubs', '7'),
      card('c4', 'clubs', '8'),
      card('c5', 'clubs', '9'),
    ])
    expect(result).toEqual({ valid: true, type: 'run' })
  })

  // --- Invalid runs ---
  it('rejects same-suit cards with a gap', () => {
    const result = classifyMeld([
      card('c1', 'hearts', '3'),
      card('c2', 'hearts', '4'),
      card('c3', 'hearts', '6'),
    ])
    expect(result).toEqual({ valid: false })
  })

  it('rejects same-suit cards with a duplicate rank', () => {
    const result = classifyMeld([
      card('c1', 'hearts', '3'),
      card('c2', 'hearts', '4'),
      card('c3', 'hearts', '4'),
    ])
    expect(result).toEqual({ valid: false })
  })

  it('rejects consecutive ranks with different suits', () => {
    const result = classifyMeld([
      card('c1', 'hearts', '3'),
      card('c2', 'spades', '4'),
      card('c3', 'hearts', '5'),
    ])
    expect(result).toEqual({ valid: false })
  })

  // --- Ace-low, no wrap ---
  it('rejects Q-K-A (no wrap-around)', () => {
    const result = classifyMeld([
      card('c1', 'spades', 'Q'),
      card('c2', 'spades', 'K'),
      card('c3', 'spades', 'A'),
    ])
    expect(result).toEqual({ valid: false })
  })

  it('classifies A-2-3 same-suit as a valid run', () => {
    const result = classifyMeld([
      card('c1', 'spades', 'A'),
      card('c2', 'spades', '2'),
      card('c3', 'spades', '3'),
    ])
    expect(result).toEqual({ valid: true, type: 'run' })
  })

  // --- Mixed nonsense ---
  it('rejects mixed ranks and suits with no meld relationship', () => {
    const result = classifyMeld([
      card('c1', 'spades', '7'),
      card('c2', 'hearts', '2'),
      card('c3', 'diamonds', 'K'),
    ])
    expect(result).toEqual({ valid: false })
  })

  // --- Unsorted input ---
  it('classifies unsorted run cards correctly', () => {
    const result = classifyMeld([
      card('c1', 'hearts', '5'),
      card('c2', 'hearts', '3'),
      card('c3', 'hearts', '4'),
    ])
    expect(result).toEqual({ valid: true, type: 'run' })
  })

  it('classifies a run crossing the 9-10 boundary as valid (numeric, not lexicographic, sort)', () => {
    const result = classifyMeld([
      card('c1', 'hearts', '10'),
      card('c2', 'hearts', '8'),
      card('c3', 'hearts', '9'),
    ])
    expect(result).toEqual({ valid: true, type: 'run' })
  })
})
