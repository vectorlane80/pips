import { describe, expect, it } from 'vitest'
import { createSkipBoDeck } from './deck.ts'

const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

describe('createSkipBoDeck', () => {
  it('creates exactly 162 cards', () => {
    expect(createSkipBoDeck()).toHaveLength(162)
  })

  it('creates exactly 144 numbered cards and 18 wild cards', () => {
    const deck = createSkipBoDeck()
    expect(deck.filter((c) => c.meta?.kind === 'number')).toHaveLength(144)
    expect(deck.filter((c) => c.meta?.kind === 'wild')).toHaveLength(18)
  })

  it('creates exactly 12 copies of each rank 1-12', () => {
    const deck = createSkipBoDeck()
    for (const rank of RANKS) {
      const matching = deck.filter((c) => c.meta?.kind === 'number' && c.rank === rank)
      expect(matching).toHaveLength(12)
    }
  })

  it('uses suit "number" and meta.kind "number" for numbered cards, "special"/"wild" for wilds', () => {
    const deck = createSkipBoDeck()
    for (const card of deck) {
      if (card.meta?.kind === 'number') {
        expect(card.suit).toBe('number')
        expect(RANKS).toContain(card.rank)
      } else {
        expect(card.suit).toBe('special')
        expect(card.rank).toBe('WILD')
        expect(card.meta?.kind).toBe('wild')
      }
    }
  })

  it('gives every card a unique sequential sb-N id', () => {
    const deck = createSkipBoDeck()
    expect(deck.map((c) => c.id)).toEqual(Array.from({ length: 162 }, (_, i) => `sb-${i}`))
  })

  it('gives every card deckIndex 0', () => {
    for (const card of createSkipBoDeck()) {
      expect(card.deckIndex).toBe(0)
    }
  })
})
