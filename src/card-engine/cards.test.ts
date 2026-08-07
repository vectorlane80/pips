import { describe, expect, it } from 'vitest'
import type { Card } from './cards.ts'
import { cardsEqual, findCard, removeCard } from './cards.ts'

function makeCard(id: string, suit: Card['suit'] = 'hearts', rank: Card['rank'] = 'A', deckIndex = 0): Card {
  return { id, suit, rank, deckIndex }
}

describe('cardsEqual', () => {
  it('returns true when ids match', () => {
    expect(cardsEqual(makeCard('c0'), makeCard('c0'))).toBe(true)
  })

  it('returns false when ids differ, even if suit/rank/deckIndex all match', () => {
    const a = { id: 'c0', suit: 'clubs' as const, rank: '7' as const, deckIndex: 1 }
    const b = { id: 'c1', suit: 'clubs' as const, rank: '7' as const, deckIndex: 1 }
    expect(cardsEqual(a, b)).toBe(false)
  })
})

describe('findCard', () => {
  it('finds a card by id', () => {
    const cards = [makeCard('c0'), makeCard('c1'), makeCard('c2')]
    const found = findCard(cards, 'c1')
    expect(found).toBeDefined()
    expect(found!.id).toBe('c1')
  })

  it('returns undefined for a missing id', () => {
    const cards = [makeCard('c0'), makeCard('c1')]
    expect(findCard(cards, 'c99')).toBeUndefined()
  })
})

describe('removeCard', () => {
  it('removes the targeted card by id', () => {
    const cards = [makeCard('c0'), makeCard('c1'), makeCard('c2')]
    const { card, remaining } = removeCard(cards, 'c1')
    expect(card).toBeDefined()
    expect(card!.id).toBe('c1')
    expect(remaining).toHaveLength(2)
    expect(remaining.map((c) => c.id)).toEqual(['c0', 'c2'])
  })

  it('returns a new array reference', () => {
    const cards = [makeCard('c0'), makeCard('c1')]
    const { remaining } = removeCard(cards, 'c0')
    expect(remaining).not.toBe(cards)
  })

  it('does not mutate the original input array', () => {
    const cards = [makeCard('c0'), makeCard('c1'), makeCard('c2')]
    const originalLength = cards.length
    const originalIds = cards.map((c) => c.id)
    removeCard(cards, 'c1')
    expect(cards).toHaveLength(originalLength)
    expect(cards.map((c) => c.id)).toEqual(originalIds)
  })

  it('returns card=undefined and an unchanged copy when id is not found', () => {
    const cards = [makeCard('c0'), makeCard('c1')]
    const { card, remaining } = removeCard(cards, 'c99')
    expect(card).toBeUndefined()
    expect(remaining).toHaveLength(2)
    expect(remaining).not.toBe(cards)
    expect(remaining.map((c) => c.id)).toEqual(['c0', 'c1'])
  })
})
