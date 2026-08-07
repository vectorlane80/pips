import { describe, expect, it } from 'vitest'
import type { Card } from './cards.ts'
import { createStandardDeck } from './deck.ts'
import {
  addCards,
  cardCount,
  createDiscardPile,
  createHand,
  createPlayerZone,
  createPublicZone,
  moveCards,
  recyclePile,
  removeCardsById,
  setZoneVisibility,
  topCard,
} from './zones.ts'
import type { Zone, ZoneVisibility } from './zones.ts'

function makeCard(id: string, suit: 'clubs' = 'clubs', rank: 'A' = 'A'): Card {
  return { id, suit, rank, deckIndex: 0 }
}

function cards(...ids: string[]): Card[] {
  return ids.map((id) => makeCard(id))
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

describe('createHand', () => {
  it('produces a Zone with the expected id, ownerId, visibility, and empty cards', () => {
    const h = createHand('p1')
    expect(h.id).toBe('hand:p1')
    expect(h.ownerId).toBe('p1')
    expect(h.visibility).toBe('private')
    expect(h.cards).toEqual([])
  })
})

describe('createDiscardPile', () => {
  it('defaults to id "discard", ownerId null, visibility public, empty cards', () => {
    const d = createDiscardPile()
    expect(d.id).toBe('discard')
    expect(d.ownerId).toBeNull()
    expect(d.visibility).toBe('public')
    expect(d.cards).toEqual([])
  })

  it('accepts a custom id', () => {
    const d = createDiscardPile('my-discard')
    expect(d.id).toBe('my-discard')
    expect(d.ownerId).toBeNull()
    expect(d.visibility).toBe('public')
    expect(d.cards).toEqual([])
  })
})

describe('createPlayerZone', () => {
  it.each([
    ['public' as ZoneVisibility],
    ['private' as ZoneVisibility],
  ])('produces a player zone with visibility=%s', (visibility) => {
    const z = createPlayerZone('p1', 'melds', visibility)
    expect(z.id).toBe('melds:p1')
    expect(z.ownerId).toBe('p1')
    expect(z.visibility).toBe(visibility)
    expect(z.cards).toEqual([])
  })
})

describe('createPublicZone', () => {
  it('defaults to visibility public', () => {
    const z = createPublicZone('stock')
    expect(z.id).toBe('stock')
    expect(z.ownerId).toBeNull()
    expect(z.visibility).toBe('public')
    expect(z.cards).toEqual([])
  })

  it('accepts explicit visibility', () => {
    const z = createPublicZone('stock', 'private')
    expect(z.id).toBe('stock')
    expect(z.ownerId).toBeNull()
    expect(z.visibility).toBe('private')
    expect(z.cards).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// addCards
// ---------------------------------------------------------------------------

describe('addCards', () => {
  it('appends cards in order to an empty zone', () => {
    const zone = createHand('p1')
    const c = cards('a', 'b', 'c')
    const result = addCards(zone, c)
    expect(result.cards.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('appends to a non-empty zone preserving existing cards and ordering', () => {
    const zone: Zone = { ...createHand('p1'), cards: cards('x', 'y') }
    const result = addCards(zone, cards('z', 'w'))
    expect(result.cards.map((x) => x.id)).toEqual(['x', 'y', 'z', 'w'])
  })

  it('returns a new Zone object', () => {
    const zone = createHand('p1')
    const result = addCards(zone, cards('a'))
    expect(result).not.toBe(zone)
  })

  it('does not mutate the input zone or its cards array', () => {
    const zone = createHand('p1')
    const originalCards = zone.cards
    addCards(zone, cards('a'))
    expect(zone.cards).toHaveLength(0)
    expect(zone.cards).toBe(originalCards)
  })
})

// ---------------------------------------------------------------------------
// removeCardsById
// ---------------------------------------------------------------------------

describe('removeCardsById', () => {
  it('removes targeted cards from anywhere in the zone', () => {
    const zone: Zone = { ...createHand('p1'), cards: cards('a', 'b', 'c', 'd', 'e') }
    const { zone: result, removed } = removeCardsById(zone, ['b', 'd'])
    expect(result.cards.map((x) => x.id)).toEqual(['a', 'c', 'e'])
    expect(removed.map((x) => x.id)).toEqual(['b', 'd'])
  })

  it('returns removed in the requested id order, not zone order', () => {
    const zone: Zone = { ...createHand('p1'), cards: cards('e', 'd', 'c', 'b', 'a') }
    const { removed } = removeCardsById(zone, ['a', 'c', 'e'])
    expect(removed.map((x) => x.id)).toEqual(['a', 'c', 'e'])
  })

  it('returns a new Zone and does not mutate the input', () => {
    const zone: Zone = { ...createHand('p1'), cards: cards('a', 'b', 'c') }
    const originalIds = zone.cards.map((x) => x.id)
    const { zone: result } = removeCardsById(zone, ['b'])
    expect(result).not.toBe(zone)
    expect(zone.cards.map((x) => x.id)).toEqual(originalIds)
  })

  it('silently skips ids not present in the zone', () => {
    const zone: Zone = { ...createHand('p1'), cards: cards('a', 'b') }
    const { zone: result, removed } = removeCardsById(zone, ['x', 'a', 'y'])
    expect(result.cards.map((x) => x.id)).toEqual(['b'])
    expect(removed.map((x) => x.id)).toEqual(['a'])
  })

  it('handles an empty list of ids', () => {
    const zone: Zone = { ...createHand('p1'), cards: cards('a', 'b') }
    const { zone: result, removed } = removeCardsById(zone, [])
    expect(result.cards.map((x) => x.id)).toEqual(['a', 'b'])
    expect(removed).toEqual([])
  })

  it('handles all ids missing', () => {
    const zone: Zone = { ...createHand('p1'), cards: cards('a', 'b') }
    const { zone: result, removed } = removeCardsById(zone, ['x', 'z'])
    expect(result.cards.map((x) => x.id)).toEqual(['a', 'b'])
    expect(removed).toEqual([])
  })

  it('removes all cards when all ids match', () => {
    const zone: Zone = { ...createHand('p1'), cards: cards('a', 'b') }
    const { zone: result, removed } = removeCardsById(zone, ['a', 'b'])
    expect(result.cards).toEqual([])
    expect(removed.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('dedupes duplicate ids: each card is removed at most once', () => {
    const zone: Zone = { ...createHand('p1'), cards: cards('a', 'b') }
    const { zone: result, removed } = removeCardsById(zone, ['a', 'a'])
    expect(removed).toHaveLength(1)
    expect(removed.map((x) => x.id)).toEqual(['a'])
    expect(result.cards).toHaveLength(1)
    expect(result.cards.map((x) => x.id)).toEqual(['b'])
  })
})

// ---------------------------------------------------------------------------
// moveCards
// ---------------------------------------------------------------------------

describe('moveCards', () => {
  it('conserves cards: from no longer has them, to gains them, moved is correct, originals unmutated', () => {
    const hand = { ...createHand('p1'), cards: cards('a', 'b', 'c', 'd', 'e') }
    const discard = createDiscardPile()
    const originalHandIds = hand.cards.map((x) => x.id)
    const originalDiscardIds = discard.cards.map((x) => x.id)

    const { from, to, moved } = moveCards(hand, discard, ['b', 'd'])

    // returned from zone no longer contains 'b' or 'd'
    expect(from.cards.map((x) => x.id)).toEqual(['a', 'c', 'e'])

    // returned to zone contains the moved cards (appended to whatever was there)
    expect(to.cards.map((x) => x.id)).toEqual(['b', 'd'])

    // moved contains the correct cards
    expect(moved.map((x) => x.id)).toEqual(['b', 'd'])

    // original hand/discard are unmutated
    expect(hand.cards.map((x) => x.id)).toEqual(originalHandIds)
    expect(discard.cards.map((x) => x.id)).toEqual(originalDiscardIds)
  })

  it('silently skips ids not present in from', () => {
    const hand = { ...createHand('p1'), cards: cards('a', 'b') }
    const discard = createDiscardPile()

    const { from, to, moved } = moveCards(hand, discard, ['x', 'a', 'y'])

    expect(from.cards.map((x) => x.id)).toEqual(['b'])
    expect(to.cards.map((x) => x.id)).toEqual(['a'])
    expect(moved.map((x) => x.id)).toEqual(['a'])
  })

  it('moved is empty and both zones unchanged when no ids match', () => {
    const hand = { ...createHand('p1'), cards: cards('a', 'b') }
    const discard = createDiscardPile()

    const { from, to, moved } = moveCards(hand, discard, ['x', 'z'])

    expect(from.cards.map((x) => x.id)).toEqual(['a', 'b'])
    expect(to.cards).toEqual([])
    expect(moved).toEqual([])
  })

  it('dedupes duplicate ids: a card requested twice is moved only once', () => {
    const hand = { ...createHand('p1'), cards: cards('c1', 'c2') }
    const discard = createDiscardPile()
    const totalBefore = hand.cards.length + discard.cards.length

    const { from, to, moved } = moveCards(hand, discard, ['c1', 'c1'])

    expect(moved).toHaveLength(1)
    expect(moved.map((x) => x.id)).toEqual(['c1'])
    expect(to.cards).toHaveLength(1)
    expect(from.cards).toHaveLength(1)
    expect(from.cards.map((x) => x.id)).toEqual(['c2'])
    // conservation: total cards across both zones is unchanged
    expect(from.cards.length + to.cards.length).toBe(totalBefore)
  })

  it('returns moved cards in the requested order and appends them to to in that order', () => {
    // zone internal order is d,a,c,b; requested order b,d,c differs from it
    const hand = { ...createHand('p1'), cards: cards('d', 'a', 'c', 'b') }
    const discard: Zone = { ...createDiscardPile(), cards: cards('x') }

    const { from, to, moved } = moveCards(hand, discard, ['b', 'd', 'c'])

    expect(moved.map((x) => x.id)).toEqual(['b', 'd', 'c'])
    expect(to.cards.map((x) => x.id)).toEqual(['x', 'b', 'd', 'c'])
    expect(from.cards.map((x) => x.id)).toEqual(['a'])
  })
})

// ---------------------------------------------------------------------------
// topCard / cardCount
// ---------------------------------------------------------------------------

describe('topCard', () => {
  it('returns undefined for an empty zone', () => {
    expect(topCard(createHand('p1'))).toBeUndefined()
  })

  it('returns the last card for a non-empty zone', () => {
    const zone: Zone = { ...createHand('p1'), cards: cards('a', 'b', 'c') }
    expect(topCard(zone)!.id).toBe('c')
  })
})

describe('cardCount', () => {
  it('returns 0 for an empty zone', () => {
    expect(cardCount(createHand('p1'))).toBe(0)
  })

  it('returns the correct count for a non-empty zone', () => {
    const zone: Zone = { ...createHand('p1'), cards: cards('a', 'b', 'c', 'd') }
    expect(cardCount(zone)).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// setZoneVisibility
// ---------------------------------------------------------------------------

describe('setZoneVisibility', () => {
  it('flips visibility from private to public', () => {
    const zone = createHand('p1')
    const result = setZoneVisibility(zone, 'public')
    expect(result.visibility).toBe('public')
    expect(result.id).toBe(zone.id)
    expect(result.ownerId).toBe(zone.ownerId)
    expect(result.cards).toEqual(zone.cards)
  })

  it('returns a new object', () => {
    const zone = createHand('p1')
    const result = setZoneVisibility(zone, 'public')
    expect(result).not.toBe(zone)
  })

  it('leaves cards untouched', () => {
    const zone: Zone = { ...createHand('p1'), cards: cards('a', 'b') }
    const result = setZoneVisibility(zone, 'public')
    expect(result.cards.map((x) => x.id)).toEqual(['a', 'b'])
    // fresh cards array reference, not the input zone's array
    expect(result.cards).not.toBe(zone.cards)
  })
})

// ---------------------------------------------------------------------------
// recyclePile
// ---------------------------------------------------------------------------

describe('recyclePile', () => {
  const c = cards('c1', 'c2', 'c3', 'c4')

  it('with keepTop: 1, source keeps the original top, dest receives the rest', () => {
    const source: Zone = { ...createDiscardPile(), cards: [...c] }
    const dest: Zone = createPublicZone('stock', 'private')

    const { source: srcAfter, dest: destAfter } = recyclePile(source, dest, { keepTop: 1 })

    expect(srcAfter.cards.map((x) => x.id)).toEqual(['c4'])
    expect(destAfter.cards.map((x) => x.id)).toEqual(['c1', 'c2', 'c3'])

    // total card count is conserved
    expect(srcAfter.cards.length + destAfter.cards.length - dest.cards.length).toBe(source.cards.length)
  })

  it('keepTop: 0 (default) moves everything', () => {
    const source: Zone = { ...createDiscardPile(), cards: [...c] }
    const dest: Zone = createPublicZone('stock', 'private')

    const { source: srcAfter, dest: destAfter } = recyclePile(source, dest)

    expect(srcAfter.cards).toEqual([])
    expect(destAfter.cards.map((x) => x.id)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(srcAfter.cards.length + destAfter.cards.length - dest.cards.length).toBe(source.cards.length)
  })

  it('keepTop > source length moves nothing and does not throw', () => {
    const source: Zone = { ...createDiscardPile(), cards: [...c] }
    const dest: Zone = createPublicZone('stock', 'private')

    const { source: srcAfter, dest: destAfter } = recyclePile(source, dest, { keepTop: 10 })

    expect(srcAfter.cards.map((x) => x.id)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(destAfter.cards).toEqual(dest.cards)
  })

  it('when shuffle is provided, it is invoked and its output ends up in dest', () => {
    const source: Zone = { ...createDiscardPile(), cards: [...c] }
    const dest: Zone = createPublicZone('stock', 'private')

    let shuffleCalled = false
    const reversed = (cards: Card[]): Card[] => {
      shuffleCalled = true
      return [...cards].reverse()
    }

    const { dest: destAfter } = recyclePile(source, dest, { keepTop: 0, shuffle: reversed })

    expect(shuffleCalled).toBe(true)
    // The moved cards (all 4) should be in reversed order: c4, c3, c2, c1
    expect(destAfter.cards.map((x) => x.id)).toEqual(['c4', 'c3', 'c2', 'c1'])
  })

  it('shuffle combined with keepTop: 1 applies shuffle only to the moved cards', () => {
    const source: Zone = { ...createDiscardPile(), cards: [...c] }
    const dest: Zone = createPublicZone('stock', 'private')

    const reversed = (cards: Card[]): Card[] => [...cards].reverse()

    const { source: srcAfter, dest: destAfter } = recyclePile(source, dest, { keepTop: 1, shuffle: reversed })

    // top card c4 stays
    expect(srcAfter.cards.map((x) => x.id)).toEqual(['c4'])
    // moved cards [c1, c2, c3] reversed => [c3, c2, c1]
    expect(destAfter.cards.map((x) => x.id)).toEqual(['c3', 'c2', 'c1'])
  })

  it('leaves original source and dest unmutated', () => {
    const source: Zone = { ...createDiscardPile(), cards: [...c] }
    const dest: Zone = createPublicZone('stock', 'private')
    const origSourceIds = source.cards.map((x) => x.id)
    const origDestIds = dest.cards.map((x) => x.id)

    recyclePile(source, dest, { keepTop: 1 })

    expect(source.cards.map((x) => x.id)).toEqual(origSourceIds)
    expect(dest.cards.map((x) => x.id)).toEqual(origDestIds)
  })

  it('keepTop <= 0 is treated as 0', () => {
    const source: Zone = { ...createDiscardPile(), cards: [...c] }
    const dest: Zone = createPublicZone('stock', 'private')

    const { source: srcAfter, dest: destAfter } = recyclePile(source, dest, { keepTop: -1 })

    expect(srcAfter.cards).toEqual([])
    expect(destAfter.cards.map((x) => x.id)).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('keepTop === source length moves nothing and returns the same source/dest references', () => {
    const source: Zone = { ...createDiscardPile(), cards: [...c] }
    const dest: Zone = createPublicZone('stock', 'private')

    const result = recyclePile(source, dest, { keepTop: 4 })

    // nothing moved: source content unchanged, dest content unchanged
    expect(result.source.cards.map((x) => x.id)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(result.dest.cards).toEqual(dest.cards)
    // intentional no-op: the exact same object references are returned
    expect(result.source).toBe(source)
    expect(result.dest).toBe(dest)
  })

  it('shuffle receives exactly the moved cards and never the kept-behind cards', () => {
    const source: Zone = { ...createDiscardPile(), cards: [...c] }
    const dest: Zone = createPublicZone('stock', 'private')

    let seen: Card[] | undefined
    const spy = (cards: Card[]): Card[] => {
      seen = cards
      return cards
    }

    recyclePile(source, dest, { keepTop: 1, shuffle: spy })

    // c1, c2, c3 moved; c4 kept on top of the source
    expect(seen?.map((x) => x.id)).toEqual(['c1', 'c2', 'c3'])
    expect(seen?.map((x) => x.id)).not.toContain('c4')
  })
})

// ---------------------------------------------------------------------------
// End-to-end conservation test
// ---------------------------------------------------------------------------

describe('end-to-end conservation', () => {
  it('never loses or duplicates a card across stock, hands, and discard', () => {
    const deck = createStandardDeck()

    // 1. Create zones
    const stock = addCards(createPublicZone('stock', 'private'), deck)
    const handP1 = createHand('p1')
    const handP2 = createHand('p2')
    const discard = createDiscardPile()

    const allZoneIds = (s: Zone, h1: Zone, h2: Zone, d: Zone): Set<string> => {
      const ids = [...s.cards, ...h1.cards, ...h2.cards, ...d.cards].map((c) => c.id)
      return new Set(ids)
    }

    const totalCount = (s: Zone, h1: Zone, h2: Zone, d: Zone): number =>
      s.cards.length + h1.cards.length + h2.cards.length + d.cards.length

    expect(totalCount(stock, handP1, handP2, discard)).toBe(52)
    expect(allZoneIds(stock, handP1, handP2, discard).size).toBe(52)

    // 2. Deal 7 cards to each hand from the stock (top of stock = last index)
    const dealFromStock = (
      s: Zone,
      h: Zone,
      count: number,
    ): { stock: Zone; hand: Zone } => {
      // take count cards from the top (last index) of the stock
      const topIds = s.cards.slice(s.cards.length - count).map((c) => c.id)
      const { from, to } = moveCards(s, h, topIds)
      return { stock: from, hand: to }
    }

    let s = stock
    let h1 = handP1
    let h2 = handP2
    let d = discard

    const deal1 = dealFromStock(s, h1, 7)
    s = deal1.stock
    h1 = deal1.hand
    expect(totalCount(s, h1, h2, d)).toBe(52)
    expect(allZoneIds(s, h1, h2, d).size).toBe(52)

    const deal2 = dealFromStock(s, h2, 7)
    s = deal2.stock
    h2 = deal2.hand
    expect(totalCount(s, h1, h2, d)).toBe(52)
    expect(allZoneIds(s, h1, h2, d).size).toBe(52)

    // 3. Move one card from p1's hand to the discard pile
    const discardCardId = h1.cards[0].id
    const discard1 = moveCards(h1, d, [discardCardId])
    h1 = discard1.from
    d = discard1.to
    expect(totalCount(s, h1, h2, d)).toBe(52)
    expect(allZoneIds(s, h1, h2, d).size).toBe(52)

    // 4. Move one card from the discard pile to p2's hand ("draw from discard")
    const drawnCardId = d.cards[d.cards.length - 1].id // top of discard
    const draw1 = moveCards(d, h2, [drawnCardId])
    d = draw1.from
    h2 = draw1.to
    expect(totalCount(s, h1, h2, d)).toBe(52)
    expect(allZoneIds(s, h1, h2, d).size).toBe(52)

    // Final sanity: each zone has expected counts
    expect(s.cards.length).toBe(52 - 14) // 38 remain in stock
    expect(h1.cards.length).toBe(6) // 7 dealt - 1 discarded
    expect(h2.cards.length).toBe(8) // 7 dealt + 1 drawn from discard
    expect(d.cards.length).toBe(0) // discard was drawn from, leaving 0
  })
})
