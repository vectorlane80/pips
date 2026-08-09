import { describe, it, expect } from 'vitest'
import { meldedCardValue, meldValue, deadwood } from './scoring.ts'
import type { Card } from '../../card-engine/cards.ts'

function card(id: string, suit: Card['suit'], rank: Card['rank']): Card {
  return { id, suit, rank, deckIndex: 0 }
}

describe('meldedCardValue', () => {
  it('Ace in A-2-3 run → 5', () => {
    const meld = [card('c0', 'clubs', 'A'), card('c1', 'clubs', '2'), card('c2', 'clubs', '3')]
    expect(meldedCardValue(meld[0], meld)).toBe(5) // Ace-low run
  })

  it('Ace in Q-K-A run → 15', () => {
    const meld = [card('c10', 'spades', 'Q'), card('c11', 'spades', 'K'), card('c12', 'spades', 'A')]
    expect(meldedCardValue(meld[2], meld)).toBe(15) // Ace-high run
  })

  it('Ace in a set of 3 aces → 15 (each)', () => {
    const meld = [card('c0', 'clubs', 'A'), card('c13', 'diamonds', 'A'), card('c26', 'hearts', 'A')]
    for (const c of meld) {
      expect(meldedCardValue(c, meld)).toBe(15)
    }
  })

  it('Ace in a set of 4 aces → 15 (each)', () => {
    const meld = [card('c0', 'clubs', 'A'), card('c13', 'diamonds', 'A'), card('c26', 'hearts', 'A'), card('c39', 'spades', 'A')]
    for (const c of meld) {
      expect(meldedCardValue(c, meld)).toBe(15)
    }
  })

  it('non-Ace card in a meld → its normal deadwoodValue (7♣ → 5)', () => {
    const meld = [card('c6', 'clubs', '7'), card('c7', 'clubs', '8'), card('c8', 'clubs', '9')]
    expect(meldedCardValue(meld[0], meld)).toBe(5)
  })

  it('face card (K♦) in a meld → 10', () => {
    const meld = [card('c50', 'diamonds', 'Q'), card('c51', 'diamonds', 'K')]
    // meldedCardValue doesn't require the meld to be valid — just uses it for ace context
    expect(meldedCardValue(meld[1], meld)).toBe(10)
  })
})

describe('meldValue', () => {
  it('A-2-3 ace-low run → 5 + 5 + 5 = 15', () => {
    const meld = [card('c0', 'clubs', 'A'), card('c1', 'clubs', '2'), card('c2', 'clubs', '3')]
    expect(meldValue(meld)).toBe(15)
  })

  it('Q-K-A ace-high run → 10 + 10 + 15 = 35', () => {
    const meld = [card('c10', 'spades', 'Q'), card('c11', 'spades', 'K'), card('c12', 'spades', 'A')]
    expect(meldValue(meld)).toBe(35)
  })

  it('3-ace set → 15 + 15 + 15 = 45', () => {
    const meld = [card('c0', 'clubs', 'A'), card('c13', 'diamonds', 'A'), card('c26', 'hearts', 'A')]
    expect(meldValue(meld)).toBe(45)
  })

  it('4-King set → 10 + 10 + 10 + 10 = 40', () => {
    const meld = [card('c11', 'clubs', 'K'), card('c24', 'diamonds', 'K'), card('c37', 'hearts', 'K'), card('c50', 'spades', 'K')]
    expect(meldValue(meld)).toBe(40)
  })
})

describe('deadwood', () => {
  it('unmelded Ace contributes 15 (not 1)', () => {
    const cards = [card('c0', 'clubs', 'A'), card('c17', 'diamonds', '5')]
    // Ace=15, 5=5 → 20
    expect(deadwood(cards)).toBe(20)
  })

  it('face cards and 10 contribute 10', () => {
    const cards = [card('c49', 'spades', 'J'), card('c50', 'spades', 'Q'), card('c51', 'spades', 'K'), card('c9', 'clubs', '10')]
    // J=10, Q=10, K=10, 10=10 → 40
    expect(deadwood(cards)).toBe(40)
  })

  it('pips contribute 5 each', () => {
    const cards = [card('c1', 'clubs', '2'), card('c6', 'clubs', '7'), card('c0', 'clubs', 'A')]
    // 2=5, 7=5, A=15 → 25
    expect(deadwood(cards)).toBe(25)
  })
})
