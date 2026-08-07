import { describe, expect, it } from 'vitest'
import { createStandardDeck, dealCards, drawCard, shuffleDeck } from './deck.ts'
import { createRng } from './rng.ts'

describe('createStandardDeck', () => {
  it('returns 52 cards with no jokers by default', () => {
    const deck = createStandardDeck()
    expect(deck).toHaveLength(52)
    expect(deck.some((c) => c.rank === 'JOKER')).toBe(false)
  })

  it('contains every (suit, rank) pair exactly once', () => {
    const deck = createStandardDeck()
    const seen = new Set<string>()
    for (const card of deck) {
      const key = `${card.suit}|${card.rank}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
    // 4 suits × 13 ranks = 52
    expect(seen.size).toBe(52)
  })

  it('has all unique ids', () => {
    const deck = createStandardDeck()
    const ids = deck.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('with numberOfDecks: 2 returns 104 cards with all unique ids', () => {
    const deck = createStandardDeck({ numberOfDecks: 2 })
    expect(deck).toHaveLength(104)
    const ids = deck.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('with numberOfDecks: 2 produces exactly 2 cards with suit clubs and rank A', () => {
    const deck = createStandardDeck({ numberOfDecks: 2 })
    const clubsAces = deck.filter((c) => c.suit === 'clubs' && c.rank === 'A')
    expect(clubsAces).toHaveLength(2)
    // They have different ids
    expect(clubsAces[0].id).not.toBe(clubsAces[1].id)
  })

  it('with includeJokers: true returns 54 cards', () => {
    const deck = createStandardDeck({ includeJokers: true })
    expect(deck).toHaveLength(54)
    const jokers = deck.filter((c) => c.rank === 'JOKER')
    expect(jokers).toHaveLength(2)
    expect(jokers.every((j) => j.suit === 'joker')).toBe(true)
  })

  it('with numberOfDecks: 2 and includeJokers: true returns 108 cards', () => {
    const deck = createStandardDeck({ numberOfDecks: 2, includeJokers: true })
    expect(deck).toHaveLength(108)
    const jokers = deck.filter((c) => c.rank === 'JOKER')
    expect(jokers).toHaveLength(4)
  })

  it('clamps numberOfDecks to 1 when given 0 or negative', () => {
    const deck0 = createStandardDeck({ numberOfDecks: 0 })
    expect(deck0).toHaveLength(52)

    const deckNeg = createStandardDeck({ numberOfDecks: -1 })
    expect(deckNeg).toHaveLength(52)
  })
})

describe('shuffleDeck', () => {
  it('returns a new array reference and does not mutate the input', () => {
    const deck = createStandardDeck()
    const inputCopy = [...deck]
    const shuffled = shuffleDeck(deck, createRng(99))
    expect(shuffled).not.toBe(deck)
    expect(deck).toEqual(inputCopy)
  })

  it('preserves the set of card ids (shuffle integrity)', () => {
    const deck = createStandardDeck()
    const shuffled = shuffleDeck(deck, createRng(1))
    const inputIds = deck.map((c) => c.id).sort()
    const shuffledIds = shuffled.map((c) => c.id).sort()
    expect(shuffledIds).toEqual(inputIds)
  })

  it('is deterministic with a seeded RNG', () => {
    const deck = createStandardDeck()
    const rngA = createRng(42)
    const rngB = createRng(42)
    const shuffled1 = shuffleDeck(deck, rngA)
    const shuffled2 = shuffleDeck(deck, rngB)
    expect(shuffled1.map((c) => c.id)).toEqual(shuffled2.map((c) => c.id))
  })

  it('actually changes the order (not identical to input)', () => {
    const deck = createStandardDeck()
    const shuffled = shuffleDeck(deck, createRng(7))
    const inputIds = deck.map((c) => c.id)
    const shuffledIds = shuffled.map((c) => c.id)
    // At least one position must differ
    const anyDiffer = inputIds.some((id, i) => id !== shuffledIds[i])
    expect(anyDiffer).toBe(true)
  })

  it('produces all permutations of a small deck at roughly equal frequency (fairness)', () => {
    const small = createStandardDeck().slice(0, 3) // 3 cards -> 6 possible orderings
    const rng = createRng(12345)
    const counts: Record<string, number> = {}
    const trials = 60000
    for (let i = 0; i < trials; i++) {
      const order = shuffleDeck(small, rng).map((c) => c.id).join(',')
      counts[order] = (counts[order] ?? 0) + 1
    }
    const seen = Object.keys(counts)
    expect(seen).toHaveLength(6) // all 6 permutations must occur at least once
    const expected = trials / 6
    for (const key of seen) {
      // loose bound: real Fisher-Yates over 60k trials keeps every bucket within +/-35% of expected;
      // a biased shuffle (e.g. off-by-one in the swap index) produces only 2-3 buckets and/or wildly
      // skewed counts, which this bound catches without being a flaky statistical test.
      expect(counts[key]).toBeGreaterThan(expected * 0.65)
      expect(counts[key]).toBeLessThan(expected * 1.35)
    }
  })
})

describe('dealCards', () => {
  it('deals the correct count from the front', () => {
    const deck = createStandardDeck()
    const { dealt, remaining } = dealCards(deck, 5)
    expect(dealt).toHaveLength(5)
    expect(remaining).toHaveLength(47)
    expect(dealt.map((c) => c.id)).toEqual(deck.slice(0, 5).map((c) => c.id))
  })

  it('dealt and remaining ids are disjoint and union equals original', () => {
    const deck = createStandardDeck()
    const { dealt, remaining } = dealCards(deck, 7)
    const dealtIds = new Set(dealt.map((c) => c.id))
    const remainingIds = new Set(remaining.map((c) => c.id))

    // disjoint
    for (const id of dealtIds) {
      expect(remainingIds.has(id)).toBe(false)
    }

    // union equals original
    const union = new Set([...dealtIds, ...remainingIds])
    const originalIds = new Set(deck.map((c) => c.id))
    expect(union).toEqual(originalIds)
  })

  it('deals all cards when count > length without throwing', () => {
    const deck = createStandardDeck()
    const { dealt, remaining } = dealCards(deck, 100)
    expect(dealt).toHaveLength(52)
    expect(remaining).toHaveLength(0)
  })

  it('returns empty dealt and a copy of input when count is 0', () => {
    const deck = createStandardDeck()
    const { dealt, remaining } = dealCards(deck, 0)
    expect(dealt).toHaveLength(0)
    expect(remaining).toHaveLength(52)
    expect(remaining).not.toBe(deck)
    expect(remaining.map((c) => c.id)).toEqual(deck.map((c) => c.id))
  })

  it('does not mutate the input array', () => {
    const deck = createStandardDeck()
    const before = deck.length
    dealCards(deck, 5)
    expect(deck).toHaveLength(before)
  })
})

describe('drawCard', () => {
  it('returns the top card and remaining from a non-empty deck', () => {
    const deck = createStandardDeck()
    const { card, remaining } = drawCard(deck)
    expect(card).toBeDefined()
    expect(card!.id).toBe(deck[0].id)
    expect(remaining).toHaveLength(51)
    expect(remaining.map((c) => c.id)).toEqual(deck.slice(1).map((c) => c.id))
  })

  it('returns undefined card and empty remaining for an empty array', () => {
    const { card, remaining } = drawCard([])
    expect(card).toBeUndefined()
    expect(remaining).toEqual([])
  })
})
