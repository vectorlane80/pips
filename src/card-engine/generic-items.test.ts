import { describe, expect, it } from 'vitest'
import { createRng } from '../engine/rng.ts'
import { createStandardDeck, dealCards, drawCard, shuffleDeck } from './deck.ts'
import {
  addCards,
  cardCount,
  createPublicZone,
  moveCards,
  removeCardsById,
  topCard,
} from './zones.ts'
import type { Zone } from './zones.ts'

interface Tile {
  id: string
  low: number
  high: number
}

function makeTile(id: string, low: number, high: number): Tile {
  return { id, low, high }
}

function tiles(...specs: Array<[string, number, number]>): Tile[] {
  return specs.map(([id, low, high]) => makeTile(id, low, high))
}

// ---------------------------------------------------------------------------
// shuffleDeck on non-Card items
// ---------------------------------------------------------------------------

describe('shuffleDeck with tiles', () => {
  const dominoes = tiles(['t0', 0, 0], ['t1', 0, 1], ['t2', 1, 1], ['t3', 1, 2], ['t4', 2, 2])

  it('is deterministic with a seeded RNG and preserves the multiset', () => {
    const a = shuffleDeck(dominoes, createRng(1))
    const b = shuffleDeck(dominoes, createRng(1))
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id))

    const sortedA = a.map((t) => t.id).sort()
    const sortedInput = dominoes.map((t) => t.id).sort()
    expect(sortedA).toEqual(sortedInput)
  })

  it('returns a new array and does not mutate the input', () => {
    const inputCopy = [...dominoes]
    const shuffled = shuffleDeck(dominoes, createRng(1))
    expect(shuffled).not.toBe(dominoes)
    expect(dominoes).toEqual(inputCopy)
  })
})

// ---------------------------------------------------------------------------
// dealCards / drawCard on non-Card items
// ---------------------------------------------------------------------------

describe('dealCards with tiles', () => {
  const dominoes = tiles(['t0', 0, 0], ['t1', 0, 1], ['t2', 1, 1], ['t3', 1, 2], ['t4', 2, 2])

  it('deals the correct count from the front and leaves the right remainder', () => {
    const { dealt, remaining } = dealCards(dominoes, 3)
    expect(dealt.map((t) => t.id)).toEqual(['t0', 't1', 't2'])
    expect(remaining.map((t) => t.id)).toEqual(['t3', 't4'])
    expect(dealt.length + remaining.length).toBe(dominoes.length)
  })

  it('deals all tiles when count exceeds length', () => {
    const { dealt, remaining } = dealCards(dominoes, 99)
    expect(dealt).toHaveLength(5)
    expect(remaining).toHaveLength(0)
  })

  it('returns empty dealt and a copy when count is 0', () => {
    const { dealt, remaining } = dealCards(dominoes, 0)
    expect(dealt).toEqual([])
    expect(remaining).toHaveLength(5)
    expect(remaining).not.toBe(dominoes)
  })
})

describe('drawCard with tiles', () => {
  it('draws the first tile and leaves the rest', () => {
    const dominoes = tiles(['t0', 0, 0], ['t1', 0, 1], ['t2', 1, 1])
    const { card, remaining } = drawCard(dominoes)
    expect(card).toEqual({ id: 't0', low: 0, high: 0 })
    expect(remaining.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('returns undefined for an empty array', () => {
    const { card, remaining } = drawCard([] as Tile[])
    expect(card).toBeUndefined()
    expect(remaining).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Zones on non-Card items
// ---------------------------------------------------------------------------

describe('tile zones', () => {
  it('creates a typed zone and tracks addCards/cardCount/topCard', () => {
    const boneyard = createPublicZone<Tile>('boneyard', 'private')
    expect(boneyard.id).toBe('boneyard')
    expect(boneyard.ownerId).toBeNull()
    expect(boneyard.visibility).toBe('private')
    expect(boneyard.cards).toEqual([])

    const filled = addCards(boneyard, tiles(['t0', 0, 0], ['t1', 0, 1], ['t2', 1, 1]))
    expect(cardCount(filled)).toBe(3)
    expect(topCard(filled)).toEqual({ id: 't2', low: 1, high: 1 })
    // inputs unmutated
    expect(boneyard.cards).toEqual([])
  })

  it('moves tiles between two zones by id', () => {
    const hand = createPublicZone<Tile>('hand')
    const boneyard = addCards(
      createPublicZone<Tile>('boneyard', 'private'),
      tiles(['t0', 0, 0], ['t1', 0, 1], ['t2', 1, 1], ['t3', 1, 2]),
    )

    const { from, to, moved } = moveCards(boneyard, hand, ['t1', 't3'])

    expect(from.cards.map((t) => t.id)).toEqual(['t0', 't2'])
    expect(to.cards.map((t) => t.id)).toEqual(['t1', 't3'])
    expect(moved.map((t) => t.id)).toEqual(['t1', 't3'])
    // tile payload preserved through the move
    expect(moved[0]).toEqual({ id: 't1', low: 0, high: 1 })
  })

  it('removes tiles by id', () => {
    const boneyard = addCards(
      createPublicZone<Tile>('boneyard', 'private'),
      tiles(['t0', 0, 0], ['t1', 0, 1], ['t2', 1, 1]),
    )

    const { zone, removed } = removeCardsById(boneyard, ['t0', 't2'])

    expect(zone.cards.map((t) => t.id)).toEqual(['t1'])
    expect(removed.map((t) => t.id)).toEqual(['t0', 't2'])
    expect(removed[0]).toEqual({ id: 't0', low: 0, high: 0 })
  })
})

// ---------------------------------------------------------------------------
// Default type argument: Zone still works with Card
// ---------------------------------------------------------------------------

describe('default Zone remains Card-typed', () => {
  it('a Zone with no type argument accepts Card[] from createStandardDeck()', () => {
    const stock: Zone = createPublicZone('stock', 'private')
    const filled: Zone = addCards(stock, createStandardDeck())
    expect(filled.cards).toHaveLength(52)
    expect(topCard(filled)?.id).toBe('c51')
  })
})
