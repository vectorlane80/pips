import { describe, expect, it } from 'vitest'
import type { Card } from '../../card-engine/cards.ts'
import { createPhase10Deck } from './deck.ts'
import { cardPenalty, handPenalty } from './scoring.ts'

describe('Phase 10 scoring', () => {
  it('cardPenalty: numbers 1-9 cost 5', () => {
    const deck = createPhase10Deck()
    expect(cardPenalty(deck.find((c) => c.meta?.kind === 'number' && c.rank === '1')!)).toBe(5)
    expect(cardPenalty(deck.find((c) => c.meta?.kind === 'number' && c.rank === '5')!)).toBe(5)
    expect(cardPenalty(deck.find((c) => c.meta?.kind === 'number' && c.rank === '9')!)).toBe(5)
  })

  it('cardPenalty: numbers 10-12 cost 10', () => {
    const deck = createPhase10Deck()
    expect(cardPenalty(deck.find((c) => c.meta?.kind === 'number' && c.rank === '10')!)).toBe(10)
    expect(cardPenalty(deck.find((c) => c.meta?.kind === 'number' && c.rank === '12')!)).toBe(10)
  })

  it('cardPenalty: Skip costs 15', () => {
    const deck = createPhase10Deck()
    expect(cardPenalty(deck.find((c) => c.meta?.kind === 'skip')!)).toBe(15)
  })

  it('cardPenalty: Wild costs 25', () => {
    const deck = createPhase10Deck()
    expect(cardPenalty(deck.find((c) => c.meta?.kind === 'wild')!)).toBe(25)
  })

  it('handPenalty: an empty hand costs 0', () => {
    expect(handPenalty([])).toBe(0)
  })

  it('handPenalty: a full 10-card mixed hand computed by hand', () => {
    const deck = createPhase10Deck()
    const n5 = deck.find((c) => c.meta?.kind === 'number' && c.rank === '5')!
    const n10 = deck.find((c) => c.meta?.kind === 'number' && c.rank === '10')!
    const skip = deck.find((c) => c.meta?.kind === 'skip')!
    const wild = deck.find((c) => c.meta?.kind === 'wild')!
    // 4 × 5 + 2 × 10 + 2 × 15 + 2 × 25 = 20 + 20 + 30 + 50 = 120
    const hand: Card[] = [n5, n5, n5, n5, n10, n10, skip, skip, wild, wild]
    expect(handPenalty(hand)).toBe(120)
  })
})
