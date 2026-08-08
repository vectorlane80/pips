import { describe, expect, it } from 'vitest'
import { createPhase10Deck } from './deck.ts'

const COLORS = ['red', 'blue', 'green', 'yellow']
const NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
const KINDS = ['number', 'skip', 'wild']

describe('createPhase10Deck', () => {
  it('creates exactly 108 cards', () => {
    expect(createPhase10Deck()).toHaveLength(108)
  })

  it('creates exactly 24 cards per color', () => {
    const deck = createPhase10Deck()
    for (const color of COLORS) {
      expect(deck.filter((c) => c.suit === color)).toHaveLength(24)
    }
  })

  it('creates exactly 2 cards per (color, number) pair', () => {
    const deck = createPhase10Deck()
    for (const color of COLORS) {
      for (const number of NUMBERS) {
        const matching = deck.filter((c) => c.suit === color && c.rank === number)
        expect(matching).toHaveLength(2)
      }
    }
  })

  it('creates exactly 4 Skip cards and 8 Wild cards', () => {
    const deck = createPhase10Deck()
    expect(deck.filter((c) => c.rank === 'SKIP')).toHaveLength(4)
    expect(deck.filter((c) => c.rank === 'WILD')).toHaveLength(8)
  })

  it('gives every card a unique id', () => {
    const deck = createPhase10Deck()
    expect(new Set(deck.map((c) => c.id)).size).toBe(108)
  })

  it('gives every card a meta.kind that matches its rank', () => {
    const deck = createPhase10Deck()
    for (const card of deck) {
      expect(KINDS).toContain(card.meta?.kind)
      if (card.rank === 'SKIP') {
        expect(card.meta?.kind).toBe('skip')
      } else if (card.rank === 'WILD') {
        expect(card.meta?.kind).toBe('wild')
      } else {
        expect(card.meta?.kind).toBe('number')
      }
    }
  })

  it('uses ranks 1..12 with a color suit for number cards, and the special suit for Skip/Wild', () => {
    const deck = createPhase10Deck()
    const numberCards = deck.filter((c) => c.meta?.kind === 'number')
    expect(numberCards).toHaveLength(96)
    for (const card of numberCards) {
      expect(NUMBERS).toContain(card.rank)
      expect(COLORS).toContain(card.suit)
    }
    for (const card of deck) {
      if (card.rank === 'SKIP' || card.rank === 'WILD') {
        expect(card.suit).toBe('special')
      }
    }
  })

  it('gives every card deckIndex 0', () => {
    const deck = createPhase10Deck()
    for (const card of deck) {
      expect(card.deckIndex).toBe(0)
    }
  })
})
