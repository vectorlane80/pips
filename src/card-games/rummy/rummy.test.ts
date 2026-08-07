import { describe, expect, it } from 'vitest'
import { createRummyGame, type RummyPublicState, type RummyPrivateState, type RummyAction, type RummyPhase, type RummySession } from './state.ts'
import { applyRummyAction, runRummyBotTurn } from './rules.ts'
import { deriveSnapshot } from '../../card-engine/sync.ts'
import { currentPlayer } from '../../card-engine/turn-engine.ts'
import { cardCount, createHand, createDiscardPile, createPublicZone, addCards, type Zone } from '../../card-engine/zones.ts'
import { createStandardDeck } from '../../card-engine/deck.ts'
import { createRng } from '../../card-engine/rng.ts'
import { createTurnState } from '../../card-engine/turn-engine.ts'
import { createHostSession } from '../../card-engine/sync.ts'
import { classifyMeld } from './melds.ts'
import type { BotStrategy } from '../../card-engine/bot.ts'
import type { Card } from '../../card-engine/cards.ts'

function totalCards(
  rummy: RummySession,
): number {
  const pub = rummy.session.publicState
  const priv = rummy.session.privateStates
  let meldCards = 0
  for (const playerId of Object.keys(pub.melds)) {
    for (const meld of pub.melds[playerId]) {
      meldCards += cardCount(meld)
    }
  }
  return (
    cardCount(rummy.stock) +
    cardCount(pub.discardPile) +
    cardCount(priv['p1'].hand) +
    cardCount(priv['p2'].hand) +
    meldCards
  )
}

function allUniqueCardIds(rummy: RummySession): Set<string> {
  const ids = new Set<string>()
  for (const card of rummy.stock.cards) ids.add(card.id)
  for (const card of rummy.session.publicState.discardPile.cards) ids.add(card.id)
  for (const card of rummy.session.privateStates['p1'].hand.cards) ids.add(card.id)
  for (const card of rummy.session.privateStates['p2'].hand.cards) ids.add(card.id)
  for (const playerId of Object.keys(rummy.session.publicState.melds)) {
    for (const meld of rummy.session.publicState.melds[playerId]) {
      for (const card of meld.cards) ids.add(card.id)
    }
  }
  return ids
}

/** Find any 3 cards in the hand that form a valid meld. Returns their ids, or null. */
function findMeld(cards: Card[]): string[] | null {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      for (let k = j + 1; k < cards.length; k++) {
        const trio = [cards[i], cards[j], cards[k]]
        if (classifyMeld(trio).valid) {
          return trio.map((c) => c.id)
        }
      }
    }
  }
  return null
}

function buildSession(config: {
  p1HandCardIds: string[]
  p2HandCardIds: string[]
  discardCardIds: string[]
  stockCardIds: string[]
  phase?: RummyPhase
  currentPlayerIndex?: number
  scores?: Record<string, number>
  roundOver?: boolean
  roundWinnerId?: string | null
  matchWinnerId?: string | null
  obligatedCardId?: string | null
  melds?: Record<string, Zone[]>
}): RummySession {
  const deck = createStandardDeck()
  const cardMap = new Map(deck.map((c) => [c.id, c]))

  function cardsFor(ids: string[]): Card[] {
    return ids.map((id) => cardMap.get(id)!)
  }

  const p1Hand = addCards(createHand('p1'), cardsFor(config.p1HandCardIds))
  const p2Hand = addCards(createHand('p2'), cardsFor(config.p2HandCardIds))
  const discardPile = addCards(createDiscardPile(), cardsFor(config.discardCardIds))
  const stock = addCards(createPublicZone('stock', 'private'), cardsFor(config.stockCardIds))

  const playerOrder: [string, string] = ['p1', 'p2']
  const turn = createTurnState<RummyPhase>(playerOrder, config.phase ?? 'draw')
  if (config.currentPlayerIndex != null) {
    // createTurnState starts at index 0; advance to desired index by directly setting it
    ;(turn as { currentIndex: number }).currentIndex = config.currentPlayerIndex
  }

  const publicState: RummyPublicState = {
    turn,
    discardPile,
    stockCount: cardCount(stock),
    melds: config.melds ?? { p1: [], p2: [] },
    obligatedCardId: config.obligatedCardId ?? null,
    scores: config.scores ?? { p1: 0, p2: 0 },
    target: 100,
    roundNumber: 1,
    roundOver: config.roundOver ?? false,
    roundWinnerId: config.roundWinnerId ?? null,
    matchWinnerId: config.matchWinnerId ?? null,
  }

  const privateStates: Record<string, RummyPrivateState> = {
    p1: { hand: p1Hand },
    p2: { hand: p2Hand },
  }

  return {
    session: createHostSession(publicState, privateStates),
    stock,
    rng: createRng(0),
  }
}

describe('Rummy integration harness', () => {
  it('initial deal is correct', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)

    expect(cardCount(rummy.session.privateStates['p1'].hand)).toBe(10)
    expect(cardCount(rummy.session.privateStates['p2'].hand)).toBe(10)
    expect(cardCount(rummy.stock)).toBe(31)
    expect(cardCount(rummy.session.publicState.discardPile)).toBe(1)
    expect(currentPlayer(rummy.session.publicState.turn)).toBe('p1')
    expect(rummy.session.publicState.turn.phase).toBe('draw')
    expect(totalCards(rummy)).toBe(52)
  })

  it('p1 draws from stock', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)

    const result = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(result.outcome.ok).toBe(true)

    const next = result.rummy
    expect(cardCount(next.session.privateStates['p1'].hand)).toBe(11)
    expect(cardCount(next.stock)).toBe(30)
    expect(next.session.publicState.stockCount).toBe(cardCount(next.stock))
    expect(next.session.publicState.turn.phase).toBe('discard')
    expect(next.session.revision).toBe(1)
    expect(totalCards(next)).toBe(52)
  })

  it('stockCount stays in sync with the real stock after each action', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)

    // p1 draws from stock
    const r1 = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(r1.outcome.ok).toBe(true)
    expect(r1.rummy.session.publicState.stockCount).toBe(cardCount(r1.rummy.stock))

    // p1 discards (stock untouched, count must still match)
    const p1HandAfterDraw = r1.rummy.session.privateStates['p1'].hand
    const r2 = applyRummyAction(r1.rummy, 'p1', { type: 'DISCARD_CARD', cardId: p1HandAfterDraw.cards[0].id })
    expect(r2.outcome.ok).toBe(true)
    expect(r2.rummy.session.publicState.stockCount).toBe(cardCount(r2.rummy.stock))

    // p2 draws from stock
    const r3 = applyRummyAction(r2.rummy, 'p2', { type: 'DRAW_FROM_STOCK' })
    expect(r3.outcome.ok).toBe(true)
    expect(r3.rummy.session.publicState.stockCount).toBe(cardCount(r3.rummy.stock))

    // p2 discards
    const p2HandAfterDraw = r3.rummy.session.privateStates['p2'].hand
    const r4 = applyRummyAction(r3.rummy, 'p2', { type: 'DISCARD_CARD', cardId: p2HandAfterDraw.cards[0].id })
    expect(r4.outcome.ok).toBe(true)
    expect(r4.rummy.session.publicState.stockCount).toBe(cardCount(r4.rummy.stock))
  })

  it('rejected action leaves the stock object reference-untouched', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const stockBefore = rummy.stock

    // p2 tries to draw when it is p1's turn — rejected
    const result = applyRummyAction(rummy, 'p2', { type: 'DRAW_FROM_STOCK' })
    expect(result.outcome.ok).toBe(false)

    // The stock must be literally untouched (same reference), not just structurally equal
    expect(result.rummy.stock).toBe(stockBefore)
    expect(cardCount(result.rummy.stock)).toBe(31)
  })

  it('hidden information — p2 snapshot does not leak p1 cards', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const { rummy: afterDraw } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })

    const p1CardIds = new Set(afterDraw.session.privateStates['p1'].hand.cards.map((c) => c.id))
    const p2CardIds = new Set(afterDraw.session.privateStates['p2'].hand.cards.map((c) => c.id))

    const p2Snapshot = deriveSnapshot(afterDraw.session, 'p2')

    // p2's private state should be exactly p2's own 10-card hand, not p1's
    expect(p2Snapshot.privateState.hand.cards.length).toBe(10)
    for (const card of p2Snapshot.privateState.hand.cards) {
      expect(p2CardIds.has(card.id)).toBe(true)
      expect(p1CardIds.has(card.id)).toBe(false)
    }

    // JSON.stringify must not leak p1's card ids
    const json = JSON.stringify(p2Snapshot)
    const discardIds = new Set(afterDraw.session.publicState.discardPile.cards.map((c) => c.id))
    for (const id of p1CardIds) {
      if (discardIds.has(id)) continue
      expect(json).not.toContain(id)
    }
  })

  it('p1 discards, turn passes to p2', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const { rummy: afterDraw } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })

    const p1HandAfterDraw = afterDraw.session.privateStates['p1'].hand
    const discardedId = p1HandAfterDraw.cards[0].id

    const result = applyRummyAction(afterDraw, 'p1', { type: 'DISCARD_CARD', cardId: discardedId })
    expect(result.outcome.ok).toBe(true)

    const afterDiscard = result.rummy
    expect(cardCount(afterDiscard.session.privateStates['p1'].hand)).toBe(10)
    expect(cardCount(afterDiscard.session.publicState.discardPile)).toBe(2)
    const discardCards = afterDiscard.session.publicState.discardPile.cards
    expect(discardCards[discardCards.length - 1].id).toBe(discardedId)
    expect(currentPlayer(afterDiscard.session.publicState.turn)).toBe('p2')
    expect(afterDiscard.session.publicState.turn.phase).toBe('draw')
    expect(totalCards(afterDiscard)).toBe(52)
  })

  it('p2 draws from discard', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const { rummy: afterDraw } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    const p1HandAfterDraw = afterDraw.session.privateStates['p1'].hand
    const discardedId = p1HandAfterDraw.cards[0].id
    const { rummy: afterDiscard } = applyRummyAction(afterDraw, 'p1', {
      type: 'DISCARD_CARD',
      cardId: discardedId,
    })

    // Discard pile has 2 cards: initial (index 0) + p1's discard (index 1). Draw the top.
    const result = applyRummyAction(afterDiscard, 'p2', { type: 'DRAW_FROM_DISCARD', index: 1 })
    expect(result.outcome.ok).toBe(true)

    const afterP2Draw = result.rummy
    expect(cardCount(afterP2Draw.session.privateStates['p2'].hand)).toBe(11)

    const p2CardIds = afterP2Draw.session.privateStates['p2'].hand.cards.map((c) => c.id)
    expect(p2CardIds).toContain(discardedId)

    expect(cardCount(afterP2Draw.session.publicState.discardPile)).toBe(1)
    expect(afterP2Draw.session.publicState.turn.phase).toBe('discard')
    expect(totalCards(afterP2Draw)).toBe(52)
  })

  it('p2 discards, turn returns to p1', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const { rummy: afterDraw } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    const p1HandAfterDraw = afterDraw.session.privateStates['p1'].hand
    const { rummy: afterP1Discard } = applyRummyAction(afterDraw, 'p1', {
      type: 'DISCARD_CARD',
      cardId: p1HandAfterDraw.cards[0].id,
    })
    const { rummy: afterP2Draw } = applyRummyAction(afterP1Discard, 'p2', { type: 'DRAW_FROM_DISCARD', index: 1 })
    const p2HandAfterDraw = afterP2Draw.session.privateStates['p2'].hand

    const { rummy: afterP2Discard } = applyRummyAction(afterP2Draw, 'p2', {
      type: 'DISCARD_CARD',
      cardId: p2HandAfterDraw.cards[0].id,
    })

    expect(currentPlayer(afterP2Discard.session.publicState.turn)).toBe('p1')
    expect(afterP2Discard.session.publicState.turn.phase).toBe('draw')
    expect(totalCards(afterP2Discard)).toBe(52)
  })

  it('illegal action rejected — wrong player', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const { rummy: afterDraw } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    const p1HandAfterDraw = afterDraw.session.privateStates['p1'].hand
    const { rummy: afterP1Discard } = applyRummyAction(afterDraw, 'p1', {
      type: 'DISCARD_CARD',
      cardId: p1HandAfterDraw.cards[0].id,
    })
    const { rummy: afterP2Draw } = applyRummyAction(afterP1Discard, 'p2', { type: 'DRAW_FROM_DISCARD', index: 1 })
    const p2HandAfterDraw = afterP2Draw.session.privateStates['p2'].hand
    const { rummy: afterP2Discard } = applyRummyAction(afterP2Draw, 'p2', {
      type: 'DISCARD_CARD',
      cardId: p2HandAfterDraw.cards[0].id,
    })

    // Now it's p1's turn, phase 'draw'
    expect(currentPlayer(afterP2Discard.session.publicState.turn)).toBe('p1')

    const revisionBefore = afterP2Discard.session.revision

    const result = applyRummyAction(afterP2Discard, 'p2', { type: 'DRAW_FROM_STOCK' })
    expect(result.outcome.ok).toBe(false)

    // Session unchanged
    expect(result.rummy.session.revision).toBe(revisionBefore)
    expect(result.rummy.session.publicState).toEqual(afterP2Discard.session.publicState)
    expect(result.rummy.session.privateStates).toEqual(afterP2Discard.session.privateStates)
  })

  it('illegal action rejected — wrong phase', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const { rummy: afterDraw } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    const p1HandAfterDraw = afterDraw.session.privateStates['p1'].hand
    const { rummy: afterP1Discard } = applyRummyAction(afterDraw, 'p1', {
      type: 'DISCARD_CARD',
      cardId: p1HandAfterDraw.cards[0].id,
    })
    const { rummy: afterP2Draw } = applyRummyAction(afterP1Discard, 'p2', { type: 'DRAW_FROM_DISCARD', index: 1 })
    const p2HandAfterDraw = afterP2Draw.session.privateStates['p2'].hand
    const { rummy: afterP2Discard } = applyRummyAction(afterP2Draw, 'p2', {
      type: 'DISCARD_CARD',
      cardId: p2HandAfterDraw.cards[0].id,
    })

    // Now it's p1's turn, phase 'draw'
    expect(currentPlayer(afterP2Discard.session.publicState.turn)).toBe('p1')
    expect(afterP2Discard.session.publicState.turn.phase).toBe('draw')

    const revisionBefore = afterP2Discard.session.revision
    const p1CardId = afterP2Discard.session.privateStates['p1'].hand.cards[0].id

    const result = applyRummyAction(afterP2Discard, 'p1', {
      type: 'DISCARD_CARD',
      cardId: p1CardId,
    })
    expect(result.outcome.ok).toBe(false)

    // Session unchanged
    expect(result.rummy.session.revision).toBe(revisionBefore)
    expect(result.rummy.session.publicState).toEqual(afterP2Discard.session.publicState)
  })

  it('house player bot completes a full turn', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const { rummy: afterDraw } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    const p1HandAfterDraw = afterDraw.session.privateStates['p1'].hand
    const { rummy: afterP1Discard } = applyRummyAction(afterDraw, 'p1', {
      type: 'DISCARD_CARD',
      cardId: p1HandAfterDraw.cards[0].id,
    })
    const { rummy: afterP2Draw } = applyRummyAction(afterP1Discard, 'p2', { type: 'DRAW_FROM_DISCARD', index: 1 })
    const p2HandAfterDraw = afterP2Draw.session.privateStates['p2'].hand
    const { rummy: afterP2Discard } = applyRummyAction(afterP2Draw, 'p2', {
      type: 'DISCARD_CARD',
      cardId: p2HandAfterDraw.cards[0].id,
    })

    // Now it's p1's turn, phase 'draw'
    expect(currentPlayer(afterP2Discard.session.publicState.turn)).toBe('p1')

    const strategy: BotStrategy<RummyPublicState, RummyPrivateState, RummyAction> = (
      publicState,
      privateState,
      _playerId,
    ) => {
      if (publicState.turn.phase === 'draw') return { type: 'DRAW_FROM_STOCK' }
      return { type: 'DISCARD_CARD', cardId: privateState.hand.cards[0].id }
    }

    // First bot action: draw (phase is 'draw')
    const drawResult = runRummyBotTurn(afterP2Discard, 'p1', strategy)
    expect(drawResult.outcome.ok).toBe(true)
    expect(drawResult.rummy.session.publicState.turn.phase).toBe('discard')
    expect(totalCards(drawResult.rummy)).toBe(52)

    // Second bot action: discard (phase is now 'discard')
    const discardResult = runRummyBotTurn(drawResult.rummy, 'p1', strategy)
    expect(discardResult.outcome.ok).toBe(true)
    expect(discardResult.rummy.session.publicState.turn.phase).toBe('draw')
    expect(currentPlayer(discardResult.rummy.session.publicState.turn)).toBe('p2')
    expect(totalCards(discardResult.rummy)).toBe(52)
  })

  it('full-game conservation check after all operations', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    expect(totalCards(rummy)).toBe(52)

    const { rummy: r1 } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(totalCards(r1)).toBe(52)

    const p1HandAfterDraw = r1.session.privateStates['p1'].hand
    const { rummy: r2 } = applyRummyAction(r1, 'p1', {
      type: 'DISCARD_CARD',
      cardId: p1HandAfterDraw.cards[0].id,
    })
    expect(totalCards(r2)).toBe(52)

    const { rummy: r3 } = applyRummyAction(r2, 'p2', { type: 'DRAW_FROM_DISCARD', index: 1 })
    expect(totalCards(r3)).toBe(52)

    const p2HandAfterDraw = r3.session.privateStates['p2'].hand
    const { rummy: r4 } = applyRummyAction(r3, 'p2', {
      type: 'DISCARD_CARD',
      cardId: p2HandAfterDraw.cards[0].id,
    })
    expect(totalCards(r4)).toBe(52)

    // Collect all card ids across all locations
    const allIds = allUniqueCardIds(r4)
    expect(allIds.size).toBe(52)

    const total =
      cardCount(r4.stock) +
      cardCount(r4.session.publicState.discardPile) +
      cardCount(r4.session.privateStates['p1'].hand) +
      cardCount(r4.session.privateStates['p2'].hand)
    expect(total).toBe(52)
  })

  // ── new tests ───────────────────────────────────────────────

  it('LAY_DOWN_MELD with valid meld succeeds', () => {
    // Construct a state with known meld cards: A♣,2♣,3♣ form a run
    const p2Cards = ['c4', 'c5', 'c6', 'c7', 'c8']
    const remaining = createStandardDeck().map(c => c.id).filter(id =>
      id !== 'c0' && id !== 'c1' && id !== 'c2' && id !== 'c3' && !p2Cards.includes(id)
    )

    const rummy = buildSession({
      p1HandCardIds: ['c0', 'c1', 'c2'],
      p2HandCardIds: p2Cards,
      discardCardIds: ['c3'],
      stockCardIds: remaining,
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const meldIds = ['c0', 'c1', 'c2']
    const initialHandSize = cardCount(rummy.session.privateStates['p1'].hand)
    const initialMeldCount = rummy.session.publicState.melds['p1'].length

    const result = applyRummyAction(rummy, 'p1', { type: 'LAY_DOWN_MELD', cardIds: meldIds })
    expect(result.outcome.ok).toBe(true)

    const after = result.rummy
    expect(cardCount(after.session.privateStates['p1'].hand)).toBe(initialHandSize - meldIds.length)
    expect(after.session.publicState.melds['p1'].length).toBe(initialMeldCount + 1)

    const meldZone = after.session.publicState.melds['p1'][initialMeldCount]
    expect(meldZone).toBeDefined()
    const meldIdsInZone = meldZone.cards.map((c) => c.id).sort()
    expect(meldIdsInZone).toEqual([...meldIds].sort())

    expect(totalCards(after)).toBe(52)
  })

  it('invalid meld rejected', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const { rummy: afterDraw } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })

    const hand = afterDraw.session.privateStates['p1'].hand.cards
    // Pick 3 cards of different suits and non-consecutive ranks, or just any 3 random cards
    // that don't form a meld. Try combinations until we find one.
    let nonMeldIds: string[] | null = null
    for (let i = 0; i < hand.length && !nonMeldIds; i++) {
      for (let j = i + 1; j < hand.length && !nonMeldIds; j++) {
        for (let k = j + 1; k < hand.length && !nonMeldIds; k++) {
          const trio = [hand[i], hand[j], hand[k]]
          if (!classifyMeld(trio).valid) {
            nonMeldIds = trio.map((c) => c.id)
          }
        }
      }
    }
    expect(nonMeldIds).not.toBeNull()

    const meldsBefore = afterDraw.session.publicState.melds['p1'].length
    const result = applyRummyAction(afterDraw, 'p1', { type: 'LAY_DOWN_MELD', cardIds: nonMeldIds! })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('not a valid')
    expect(result.rummy.session.publicState.melds['p1'].length).toBe(meldsBefore)
  })

  it('card not in hand rejected for LAY_DOWN_MELD', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const { rummy: afterDraw } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })

    const handIds = afterDraw.session.privateStates['p1'].hand.cards.map((c) => c.id)
    const result = applyRummyAction(afterDraw, 'p1', {
      type: 'LAY_DOWN_MELD',
      cardIds: [handIds[0], handIds[1], 'nonexistent-card-id'],
    })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('card not in hand')
  })

  it('reach-in mechanic — multi-card draw from discard', () => {
    // p2 hand: A♣,2♣,4♣,5♣,6♣,7♣,8♣,9♣,10♣,J♣ (clubs run, missing 3♣)
    // Discard: [K♠, 3♣, Q♣, K♣] — reaching for index 1 (3♣) takes 3 cards and is meldable (A♣,2♣,3♣)
    const p2Cards = ['c0', 'c1', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']
    const discardCards = ['c51', 'c2', 'c11', 'c12']
    const p1Cards = ['c20', 'c21', 'c22', 'c23', 'c24', 'c25', 'c26', 'c27', 'c28', 'c29']
    const used = new Set([...p2Cards, ...discardCards, ...p1Cards])
    const stockCards = createStandardDeck().map(c => c.id).filter(id => !used.has(id))

    const rummy = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: discardCards,
      stockCardIds: stockCards,
      phase: 'draw',
      currentPlayerIndex: 1,
    })

    // Discard pile has 4 cards (indices 0,1,2,3 where 3 is top/newest)
    const pileBefore = rummy.session.publicState.discardPile.cards
    expect(pileBefore.length).toBe(4)

    // Reach for index 1 — takes cards[1], cards[2], cards[3] (3 cards: 3♣, Q♣, K♣)
    const reachedCardId = pileBefore[1].id
    const p2HandSizeBefore = cardCount(rummy.session.privateStates['p2'].hand)

    const result = applyRummyAction(rummy, 'p2', { type: 'DRAW_FROM_DISCARD', index: 1 })
    expect(result.outcome.ok).toBe(true)

    const after = result.rummy
    // Hand should gain 3 cards (indices 1,2,3)
    expect(cardCount(after.session.privateStates['p2'].hand)).toBe(p2HandSizeBefore + 3)
    // Discard pile should shrink to just what was below index 1 (index 0 only = 1 card)
    expect(cardCount(after.session.publicState.discardPile)).toBe(1)
    // obligatedCardId must equal the reached-for card's id
    expect(after.session.publicState.obligatedCardId).toBe(reachedCardId)

    expect(totalCards(after)).toBe(52)
  })

  it('reach-in with top card only — no obligation', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)

    // Play one cycle so discard has 2 cards
    const { rummy: r1 } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    const p1h = r1.session.privateStates['p1'].hand
    const { rummy: r2 } = applyRummyAction(r1, 'p1', { type: 'DISCARD_CARD', cardId: p1h.cards[0].id })

    // Discard pile has 2 cards: index 0 = initial, index 1 = p1's discard (top)
    const pile = r2.session.publicState.discardPile.cards
    expect(pile.length).toBe(2)
    const topIndex = pile.length - 1

    const result = applyRummyAction(r2, 'p2', { type: 'DRAW_FROM_DISCARD', index: topIndex })
    expect(result.outcome.ok).toBe(true)
    // Single card take → no obligation
    expect(result.rummy.session.publicState.obligatedCardId).toBeNull()
  })

  it('obligation enforcement — must meld before discarding after reach-in', () => {
    // p2 hand: A♣,2♣,4♣,5♣,6♣,7♣,8♣,9♣,10♣,J♣ (clubs, missing 3♣)
    // Discard: [K♠, 3♣, Q♣, K♣] — reach for index 1 takes 3♣,Q♣,K♣
    // After reach, A♣,2♣,3♣ form a run (includes obligated 3♣)
    const p2Cards = ['c0', 'c1', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']
    const discardCards = ['c51', 'c2', 'c11', 'c12']
    const p1Cards = ['c20', 'c21', 'c22', 'c23', 'c24', 'c25', 'c26', 'c27', 'c28', 'c29']
    const used = new Set([...p2Cards, ...discardCards, ...p1Cards])
    const stockCards = createStandardDeck().map(c => c.id).filter(id => !used.has(id))

    const rummy = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: discardCards,
      stockCardIds: stockCards,
      phase: 'draw',
      currentPlayerIndex: 1,
    })

    const pileBefore = rummy.session.publicState.discardPile.cards
    const reachedCardId = pileBefore[1].id // 3♣

    const { rummy: r7 } = applyRummyAction(rummy, 'p2', { type: 'DRAW_FROM_DISCARD', index: 1 })
    expect(r7.session.publicState.obligatedCardId).toBe(reachedCardId)

    // Try to discard without melding first → must be rejected
    const p2HandAfterDraw = r7.session.privateStates['p2'].hand
    const discardAttempt = applyRummyAction(r7, 'p2', { type: 'DISCARD_CARD', cardId: p2HandAfterDraw.cards[0].id })
    expect(discardAttempt.outcome.ok).toBe(false)
    expect(discardAttempt.outcome.reason).toContain('must use the card')

    // A♣,2♣,3♣ form a run — meld includes the obligated card
    const meldResult = applyRummyAction(r7, 'p2', { type: 'LAY_DOWN_MELD', cardIds: ['c0', 'c1', reachedCardId] })
    expect(meldResult.outcome.ok).toBe(true)
    // obligatedCardId should be cleared
    expect(meldResult.rummy.session.publicState.obligatedCardId).toBeNull()

    // Now discarding should succeed
    const handAfterMeld = meldResult.rummy.session.privateStates['p2'].hand
    const discardResult = applyRummyAction(meldResult.rummy, 'p2', { type: 'DISCARD_CARD', cardId: handAfterMeld.cards[0].id })
    expect(discardResult.outcome.ok).toBe(true)
  })

  it('going out via meld — round ends, scores update', () => {
    // Construct: p1 has exactly 3 cards forming a meld (run A♣ 2♣ 3♣), p2 has cards for deadwood
    // c0=A♣, c1=2♣, c2=3♣ (run), discard has c3=4♣, p2 has c4=5♣ c5=6♣ c6=7♣ c7=8♣ c8=9♣
    // p2 deadwood = 5+6+7+8+9 = 35
    const p2Cards = ['c4', 'c5', 'c6', 'c7', 'c8']
    const remaining = createStandardDeck().map(c => c.id).filter(id =>
      id !== 'c0' && id !== 'c1' && id !== 'c2' && id !== 'c3' && !p2Cards.includes(id)
    )

    const rummy = buildSession({
      p1HandCardIds: ['c0', 'c1', 'c2'],
      p2HandCardIds: p2Cards,
      discardCardIds: ['c3'],
      stockCardIds: remaining,
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const result = applyRummyAction(rummy, 'p1', { type: 'LAY_DOWN_MELD', cardIds: ['c0', 'c1', 'c2'] })
    expect(result.outcome.ok).toBe(true)

    const pub = result.rummy.session.publicState
    expect(pub.roundOver).toBe(true)
    expect(pub.roundWinnerId).toBe('p1')
    expect(cardCount(result.rummy.session.privateStates['p1'].hand)).toBe(0)

    // p2 deadwood: c4(5♣)=5, c5(6♣)=6, c6(7♣)=7, c7(8♣)=8, c8(9♣)=9 → 35
    expect(pub.scores['p1']).toBe(35)
    expect(pub.scores['p2']).toBe(0)

    expect(totalCards(result.rummy)).toBe(52)
    expect(allUniqueCardIds(result.rummy).size).toBe(52)
  })

  it('going out via discard — round ends, scores update', () => {
    // Construct: p1 has exactly 1 card, p2 has cards for deadwood
    // p1: c0=A♣, p2: c1=2♣ c2=3♣ c3=4♣ (deadwood: 2+3+4=9)
    const p2Cards = ['c1', 'c2', 'c3']
    const remaining = createStandardDeck().map(c => c.id).filter(id =>
      id !== 'c0' && !p2Cards.includes(id)
    )

    const rummy = buildSession({
      p1HandCardIds: ['c0'],
      p2HandCardIds: p2Cards,
      discardCardIds: [remaining[0]],
      stockCardIds: remaining.slice(1),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const result = applyRummyAction(rummy, 'p1', { type: 'DISCARD_CARD', cardId: 'c0' })
    expect(result.outcome.ok).toBe(true)

    const pub = result.rummy.session.publicState
    expect(pub.roundOver).toBe(true)
    expect(pub.roundWinnerId).toBe('p1')
    expect(cardCount(result.rummy.session.privateStates['p1'].hand)).toBe(0)

    // p2 deadwood: c1(2♣)=2, c2(3♣)=3, c3(4♣)=4 → 9
    expect(pub.scores['p1']).toBe(9)

    expect(totalCards(result.rummy)).toBe(52)
  })

  it('match win — score crosses 100', () => {
    // Construct: p1 at 95, going out adds ≥10 → crosses 100 → p1 wins
    // p1 hand: cards forming a meld (c0,c1,c2 = A♣,2♣,3♣), p2 deadwood = 35
    const p2Cards = ['c4', 'c5', 'c6', 'c7', 'c8']
    const remaining = createStandardDeck().map(c => c.id).filter(id =>
      id !== 'c0' && id !== 'c1' && id !== 'c2' && id !== 'c3' && !p2Cards.includes(id)
    )

    const rummy = buildSession({
      p1HandCardIds: ['c0', 'c1', 'c2'],
      p2HandCardIds: p2Cards,
      discardCardIds: ['c3'],
      stockCardIds: remaining,
      phase: 'discard',
      currentPlayerIndex: 0,
      scores: { p1: 95, p2: 0 },
    })

    const result = applyRummyAction(rummy, 'p1', { type: 'LAY_DOWN_MELD', cardIds: ['c0', 'c1', 'c2'] })
    expect(result.outcome.ok).toBe(true)

    const pub = result.rummy.session.publicState
    expect(pub.roundOver).toBe(true)
    expect(pub.roundWinnerId).toBe('p1')
    expect(pub.scores['p1']).toBe(130)
    expect(pub.matchWinnerId).toBe('p1')
  })

  it('stock recycling — empty stock, discard recycled', () => {
    // Construct: empty stock, discard has several cards (≥2)
    // p1 cards: c0, c1, c2 | p2 cards: c3, c4, c5, c6, c7 + remaining
    // discard: c8, c9, c10 (3 cards), stock: empty
    // When p1 draws from stock: recycle discards c8,c9 into stock, keep c10 (top)
    // Then p1 draws top of new stock
    const p1Cards = ['c0', 'c1', 'c2']
    const p2BaseCards = ['c3', 'c4', 'c5', 'c6', 'c7']
    const discardCards = ['c8', 'c9', 'c10']
    const remaining = createStandardDeck().map(c => c.id).filter(id =>
      !p1Cards.includes(id) && !p2BaseCards.includes(id) && !discardCards.includes(id)
    )

    const rummy = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: [...p2BaseCards, ...remaining], // all remaining cards in p2's hand
      discardCardIds: discardCards,
      stockCardIds: [], // empty stock!
      phase: 'draw',
      currentPlayerIndex: 0,
    })

    expect(cardCount(rummy.stock)).toBe(0)
    expect(cardCount(rummy.session.publicState.discardPile)).toBe(3)

    const result = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(result.outcome.ok).toBe(true)

    const after = result.rummy
    // p1 gained 1 card
    expect(cardCount(after.session.privateStates['p1'].hand)).toBe(4)
    // Top discard card (c10) stays in discard
    expect(after.session.publicState.discardPile.cards.length).toBe(1)
    expect(after.session.publicState.discardPile.cards[0].id).toBe('c10')
    // Stock has the recycled cards minus the 1 drawn = 2 - 1 = 1 card (c8,c9 shuffled, then one drawn)
    // Actually: discard had 3 cards (c8@top, c9, c10), keepTop=1 keeps c10, recycles c8,c9 into stock.
    // Stock had 0 cards, gets c8,c9 (shuffled). Then p1 draws 1 from stock → stock has 1 left.
    expect(cardCount(after.stock)).toBe(1)
    // public stockCount matches
    expect(after.session.publicState.stockCount).toBe(cardCount(after.stock))

    // Total conservation
    expect(totalCards(after)).toBe(52)
    expect(allUniqueCardIds(after).size).toBe(52)
  })

  it('recycle impossible — discard has 1 card, stock empty', () => {
    // Empty stock, discard with exactly 1 card → can't recycle, suggest drawing from discard
    const p1Cards = ['c0', 'c1', 'c2']
    const p2BaseCards = ['c3', 'c4', 'c5', 'c6', 'c7']
    const discardCards = ['c8']
    const remaining = createStandardDeck().map(c => c.id).filter(id =>
      !p1Cards.includes(id) && !p2BaseCards.includes(id) && !discardCards.includes(id)
    )

    const rummy = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: [...p2BaseCards, ...remaining],
      discardCardIds: discardCards,
      stockCardIds: [], // empty stock!
      phase: 'draw',
      currentPlayerIndex: 0,
    })

    expect(cardCount(rummy.stock)).toBe(0)
    expect(cardCount(rummy.session.publicState.discardPile)).toBe(1)

    const result = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('discard pile')
  })

  it('true block — empty stock and empty discard', () => {
    // Empty stock, empty discard → round is blocked
    const p1Cards = ['c0', 'c1', 'c2']
    const p2BaseCards = ['c3', 'c4', 'c5', 'c6', 'c7']
    const remaining = createStandardDeck().map(c => c.id).filter(id =>
      !p1Cards.includes(id) && !p2BaseCards.includes(id)
    )

    const rummy = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: [...p2BaseCards, ...remaining],
      discardCardIds: [], // empty discard!
      stockCardIds: [], // empty stock!
      phase: 'draw',
      currentPlayerIndex: 0,
    })

    expect(cardCount(rummy.stock)).toBe(0)
    expect(cardCount(rummy.session.publicState.discardPile)).toBe(0)

    const result = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(result.outcome.ok).toBe(true)
    expect(result.rummy.session.publicState.roundOver).toBe(true)
    expect(result.rummy.session.publicState.roundWinnerId).toBeNull()
  })

  it('START_NEXT_ROUND succeeds — new round dealt, scores preserved, start alternates', () => {
    // Simulate round end via direct state construction
    const p1Cards = ['c0', 'c1', 'c2']
    const p2Cards = ['c4', 'c5', 'c6', 'c7', 'c8']
    const remaining = createStandardDeck().map(c => c.id).filter(id =>
      id !== 'c3' && !p1Cards.includes(id) && !p2Cards.includes(id)
    )

    const afterRound = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['c3'],
      stockCardIds: remaining,
      phase: 'draw',
      currentPlayerIndex: 0,
      scores: { p1: 35, p2: 0 },
      roundOver: true,
      roundWinnerId: 'p1',
    })

    // Only one of the two returned fields changes (alternating start):
    // prev order was [p1, p2] → next order [p2, p1]
    // p1 starts in the new round (playerOrder[0] = 'p2', start index 0), wait:
    // Actually the spec says: const [prevA, prevB] = publicState.turn.playerOrder
    // nextOrder = [prevB, prevA] — so if prev was ['p1','p2'], next is ['p2','p1']
    // createTurnState sets currentIndex=0, so p2 starts
    // That means the player who starts alternates each round.
    const result = applyRummyAction(afterRound, 'p1', { type: 'START_NEXT_ROUND' })
    expect(result.outcome.ok).toBe(true)

    const pub = result.rummy.session.publicState
    expect(pub.roundNumber).toBe(2)
    expect(pub.roundOver).toBe(false)
    expect(pub.roundWinnerId).toBeNull()
    expect(pub.obligatedCardId).toBeNull()

    // Scores carried over
    expect(pub.scores).toEqual({ p1: 35, p2: 0 })

    // Both hands fresh (10 cards each)
    expect(cardCount(result.rummy.session.privateStates['p1'].hand)).toBe(10)
    expect(cardCount(result.rummy.session.privateStates['p2'].hand)).toBe(10)

    // Discard has 1 card (from deal)
    expect(cardCount(pub.discardPile)).toBe(1)

    // Melds reset
    expect(pub.melds).toEqual({ p2: [], p1: [] })

    // Starting player alternated: prev order [p1,p2] → new order [p2,p1], start index 0 = p2
    expect(currentPlayer(pub.turn)).toBe('p2')

    // Total conservation
    expect(totalCards(result.rummy)).toBe(52)
  })

  it('START_NEXT_ROUND rejected when round not over', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    expect(rummy.session.publicState.roundOver).toBe(false)

    const result = applyRummyAction(rummy, 'p1', { type: 'START_NEXT_ROUND' })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('round is not over')
  })

  it('START_NEXT_ROUND rejected when match already won', () => {
    const afterMatch = buildSession({
      p1HandCardIds: ['c0', 'c1', 'c2'],
      p2HandCardIds: ['c4', 'c5', 'c6'],
      discardCardIds: ['c3'],
      stockCardIds: createStandardDeck().map(c => c.id).filter(id =>
        id !== 'c0' && id !== 'c1' && id !== 'c2' && id !== 'c3' && id !== 'c4' && id !== 'c5' && id !== 'c6'
      ),
      phase: 'draw',
      currentPlayerIndex: 0,
      roundOver: true,
      matchWinnerId: 'p1',
    })

    const result = applyRummyAction(afterMatch, 'p2', { type: 'START_NEXT_ROUND' })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('match is already decided')
  })

  it('full-game conservation extended — meld + reach-in + going-out sequence', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    expect(totalCards(rummy)).toBe(52)
    expect(allUniqueCardIds(rummy).size).toBe(52)

    // p1 draws stock, discards
    const { rummy: r1 } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(totalCards(r1)).toBe(52)
    const p1h1 = r1.session.privateStates['p1'].hand
    const { rummy: r2 } = applyRummyAction(r1, 'p1', { type: 'DISCARD_CARD', cardId: p1h1.cards[0].id })
    expect(totalCards(r2)).toBe(52)

    // p2 draws stock, discards
    const { rummy: r3 } = applyRummyAction(r2, 'p2', { type: 'DRAW_FROM_STOCK' })
    expect(totalCards(r3)).toBe(52)
    const p2h1 = r3.session.privateStates['p2'].hand
    const { rummy: r4 } = applyRummyAction(r3, 'p2', { type: 'DISCARD_CARD', cardId: p2h1.cards[0].id })
    expect(totalCards(r4)).toBe(52)

    // Build up discard with more actions
    const { rummy: r5 } = applyRummyAction(r4, 'p1', { type: 'DRAW_FROM_STOCK' })
    const p1h2 = r5.session.privateStates['p1'].hand
    const { rummy: r6 } = applyRummyAction(r5, 'p1', { type: 'DISCARD_CARD', cardId: p1h2.cards[0].id })
    expect(totalCards(r6)).toBe(52)

    const { rummy: r7 } = applyRummyAction(r6, 'p2', { type: 'DRAW_FROM_STOCK' })
    const p2h2 = r7.session.privateStates['p2'].hand
    const { rummy: r8 } = applyRummyAction(r7, 'p2', { type: 'DISCARD_CARD', cardId: p2h2.cards[0].id })
    expect(totalCards(r8)).toBe(52)

    // Now discard has 5 cards. p1 reaches in (multi-card draw).
    const pileBefore = r8.session.publicState.discardPile.cards
    expect(pileBefore.length).toBe(5)

    const { rummy: r9 } = applyRummyAction(r8, 'p1', { type: 'DRAW_FROM_DISCARD', index: 2 })
    expect(totalCards(r9)).toBe(52)

    // Try to find a meld in p1's hand and lay it down
    const p1Hand = r9.session.privateStates['p1'].hand.cards
    const meldIds = findMeld(p1Hand)
    if (meldIds) {
      const { rummy: r10 } = applyRummyAction(r9, 'p1', { type: 'LAY_DOWN_MELD', cardIds: meldIds })
      expect(totalCards(r10)).toBe(52)

      // Discard something (if still have cards and no obligation)
      const p1HandAfterMeld = r10.session.privateStates['p1'].hand.cards
      if (p1HandAfterMeld.length > 0 && !r10.session.publicState.obligatedCardId) {
        const { rummy: r11 } = applyRummyAction(r10, 'p1', { type: 'DISCARD_CARD', cardId: p1HandAfterMeld[0].id })
        expect(totalCards(r11)).toBe(52)

        // Final assertion: 52 unique cards across all locations
        const ids = allUniqueCardIds(r11)
        expect(ids.size).toBe(52)
        expect(totalCards(r11)).toBe(52)
      } else {
        // Still verify conservation even without the discard
        const ids = allUniqueCardIds(r10)
        expect(ids.size).toBe(52)
        expect(totalCards(r10)).toBe(52)
      }
    } else {
      // Discard something
      const { rummy: r10 } = applyRummyAction(r9, 'p1', { type: 'DISCARD_CARD', cardId: p1Hand[0].id })
      expect(totalCards(r10)).toBe(52)
      const ids = allUniqueCardIds(r10)
      expect(ids.size).toBe(52)
    }
  })

  // ── Regression tests for adversarial review ─────────────────────

  it('deadlock prevented — reach-in for unmeldable card rejected', () => {
    // p2 hand: A♣,2♣,4♣,5♣,7♣,8♣,A♦,2♦,4♦,5♦ (no Q/J/10 of clubs, no other Q)
    // Discard: [K♠, Q♣, 2♠, A♠] — reaching for index 1 (Q♣) takes Q♣,2♠,A♠
    // Resulting hand can form A-set and 2-set, but neither includes Q♣ → unmeldable
    const p2Cards = ['c0', 'c1', 'c3', 'c4', 'c6', 'c7', 'c13', 'c14', 'c16', 'c17']
    const discardCards = ['c51', 'c11', 'c40', 'c39']
    const p1Cards = ['c20', 'c21', 'c22', 'c23', 'c24', 'c25', 'c26', 'c27', 'c28', 'c29']
    const used = new Set([...p2Cards, ...discardCards, ...p1Cards])
    const stockCards = createStandardDeck().map(c => c.id).filter(id => !used.has(id))

    const rummy = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: discardCards,
      stockCardIds: stockCards,
      phase: 'draw',
      currentPlayerIndex: 1,
    })

    const pileBefore = rummy.session.publicState.discardPile.cards
    const p2HandBefore = rummy.session.privateStates['p2'].hand
    const obligatedBefore = rummy.session.publicState.obligatedCardId

    const result = applyRummyAction(rummy, 'p2', { type: 'DRAW_FROM_DISCARD', index: 1 })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('cannot be melded')

    // State unchanged — hand, discard, obligation all preserved
    expect(result.rummy.session.privateStates['p2'].hand).toEqual(p2HandBefore)
    expect(result.rummy.session.publicState.discardPile.cards).toEqual(pileBefore)
    expect(result.rummy.session.publicState.obligatedCardId).toBe(obligatedBefore)
    expect(totalCards(result.rummy)).toBe(52)
  })

  it('deadlock allowed when meldable — reach-in succeeds', () => {
    // Same setup as the reach-in mechanic test: p2 can meld A♣,2♣,3♣ after reaching for 3♣
    const p2Cards = ['c0', 'c1', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']
    const discardCards = ['c51', 'c2', 'c11', 'c12']
    const p1Cards = ['c20', 'c21', 'c22', 'c23', 'c24', 'c25', 'c26', 'c27', 'c28', 'c29']
    const used = new Set([...p2Cards, ...discardCards, ...p1Cards])
    const stockCards = createStandardDeck().map(c => c.id).filter(id => !used.has(id))

    const rummy = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: discardCards,
      stockCardIds: stockCards,
      phase: 'draw',
      currentPlayerIndex: 1,
    })

    const result = applyRummyAction(rummy, 'p2', { type: 'DRAW_FROM_DISCARD', index: 1 })
    expect(result.outcome.ok).toBe(true)
    expect(result.rummy.session.publicState.obligatedCardId).not.toBeNull()
    expect(totalCards(result.rummy)).toBe(52)
  })

  it('malformed DRAW_FROM_DISCARD index rejected, not thrown', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)

    // NaN
    let result = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_DISCARD', index: NaN })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('invalid index')

    // non-integer float
    result = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_DISCARD', index: 1.5 })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('invalid index')

    // null (cast)
    result = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_DISCARD', index: null as any })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('invalid index')

    // undefined (cast)
    result = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_DISCARD', index: undefined as any })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('invalid index')
  })

  it('malformed LAY_DOWN_MELD cardIds rejected, not thrown', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const { rummy: afterDraw } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })

    // null (cast)
    let result = applyRummyAction(afterDraw, 'p1', { type: 'LAY_DOWN_MELD', cardIds: null as any })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('invalid cardIds')

    // undefined (cast)
    result = applyRummyAction(afterDraw, 'p1', { type: 'LAY_DOWN_MELD', cardIds: undefined as any })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('invalid cardIds')

    // number (cast)
    result = applyRummyAction(afterDraw, 'p1', { type: 'LAY_DOWN_MELD', cardIds: 5 as any })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('invalid cardIds')
  })

  it('START_NEXT_ROUND rejects non-participant playerId', () => {
    const p1Cards = ['c0', 'c1', 'c2']
    const p2Cards = ['c4', 'c5', 'c6', 'c7', 'c8']
    const remaining = createStandardDeck().map(c => c.id).filter(id =>
      id !== 'c3' && !p1Cards.includes(id) && !p2Cards.includes(id)
    )

    const afterRound = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['c3'],
      stockCardIds: remaining,
      phase: 'draw',
      currentPlayerIndex: 0,
      scores: { p1: 35, p2: 0 },
      roundOver: true,
      roundWinnerId: 'p1',
    })

    const result = applyRummyAction(afterRound, 'not-a-real-player', { type: 'START_NEXT_ROUND' })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('not a player')
    expect(result.rummy.session.publicState.roundNumber).toBe(afterRound.session.publicState.roundNumber)
  })
})
