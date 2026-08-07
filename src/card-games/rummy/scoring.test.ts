import { describe, it, expect } from 'vitest'
import { deadwood } from './scoring.ts'
import type { Card } from '../../card-engine/cards.ts'

function card(id: string, suit: Card['suit'], rank: Card['rank']): Card {
  return { id, suit, rank, deckIndex: 0 }
}

describe('deadwood', () => {
  it('returns 0 for empty hand', () => {
    expect(deadwood([])).toBe(0)
  })

  it('sums deadwood values for a mixed hand', () => {
    const hand: Card[] = [
      card('c1', 'spades', 'A'),   // 1
      card('c2', 'hearts', '5'),   // 5
      card('c3', 'diamonds', 'J'), // 10
      card('c4', 'clubs', 'Q'),    // 10
      card('c5', 'spades', 'K'),   // 10
    ]
    expect(deadwood(hand)).toBe(36)
  })

  it('counts each face card as 10', () => {
    const hand: Card[] = [
      card('c1', 'spades', 'J'),
      card('c2', 'hearts', 'Q'),
      card('c3', 'diamonds', 'K'),
    ]
    expect(deadwood(hand)).toBe(30)
  })

  it('counts 10 as 10 (not its numeric rank beyond 10)', () => {
    const hand: Card[] = [
      card('c1', 'spades', '10'),
      card('c2', 'hearts', '10'),
      card('c3', 'diamonds', 'K'),
    ]
    expect(deadwood(hand)).toBe(30) // 10 + 10 + 10
  })

  it('counts Ace as 1', () => {
    const hand: Card[] = [card('c1', 'spades', 'A')]
    expect(deadwood(hand)).toBe(1)
  })
})
