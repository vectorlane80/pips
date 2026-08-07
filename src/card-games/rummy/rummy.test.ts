import { describe, expect, it } from 'vitest'
import { createRummyGame, type RummyPublicState, type RummyPrivateState, type RummyAction } from './state.ts'
import { applyRummyAction, runRummyBotTurn } from './rules.ts'
import { deriveSnapshot } from '../../card-engine/sync.ts'
import { currentPlayer } from '../../card-engine/turn-engine.ts'
import { cardCount } from '../../card-engine/zones.ts'
import type { BotStrategy } from '../../card-engine/bot.ts'

function totalCards(
  session: ReturnType<typeof createRummyGame>,
): number {
  const pub = session.session.publicState
  const priv = session.session.privateStates
  return (
    cardCount(session.stock) +
    cardCount(pub.discardPile) +
    cardCount(priv['p1'].hand) +
    cardCount(priv['p2'].hand)
  )
}

describe('Rummy integration harness', () => {
  it('initial deal is correct', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)

    expect(cardCount(rummy.session.privateStates['p1'].hand)).toBe(7)
    expect(cardCount(rummy.session.privateStates['p2'].hand)).toBe(7)
    expect(cardCount(rummy.stock)).toBe(38)
    expect(cardCount(rummy.session.publicState.discardPile)).toBe(0)
    expect(currentPlayer(rummy.session.publicState.turn)).toBe('p1')
    expect(rummy.session.publicState.turn.phase).toBe('draw')
    expect(totalCards(rummy)).toBe(52)
  })

  it('p1 draws from stock', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)

    const result = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(result.outcome.ok).toBe(true)

    const next = result.rummy
    expect(cardCount(next.session.privateStates['p1'].hand)).toBe(8)
    expect(cardCount(next.stock)).toBe(37)
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
    expect(cardCount(result.rummy.stock)).toBe(38)
  })

  it('hidden information — p2 snapshot does not leak p1 cards', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const { rummy: afterDraw } = applyRummyAction(rummy, 'p1', { type: 'DRAW_FROM_STOCK' })

    const p1CardIds = new Set(afterDraw.session.privateStates['p1'].hand.cards.map((c) => c.id))
    const p2CardIds = new Set(afterDraw.session.privateStates['p2'].hand.cards.map((c) => c.id))

    const p2Snapshot = deriveSnapshot(afterDraw.session, 'p2')

    // p2's private state should be exactly p2's own 7-card hand, not p1's
    expect(p2Snapshot.privateState.hand.cards.length).toBe(7)
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
    expect(cardCount(afterDiscard.session.privateStates['p1'].hand)).toBe(7)
    expect(cardCount(afterDiscard.session.publicState.discardPile)).toBe(1)
    expect(afterDiscard.session.publicState.discardPile.cards[0].id).toBe(discardedId)
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

    const result = applyRummyAction(afterDiscard, 'p2', { type: 'DRAW_FROM_DISCARD' })
    expect(result.outcome.ok).toBe(true)

    const afterP2Draw = result.rummy
    expect(cardCount(afterP2Draw.session.privateStates['p2'].hand)).toBe(8)

    const p2CardIds = afterP2Draw.session.privateStates['p2'].hand.cards.map((c) => c.id)
    expect(p2CardIds).toContain(discardedId)

    expect(cardCount(afterP2Draw.session.publicState.discardPile)).toBe(0)
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
    const { rummy: afterP2Draw } = applyRummyAction(afterP1Discard, 'p2', { type: 'DRAW_FROM_DISCARD' })
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
    const { rummy: afterP2Draw } = applyRummyAction(afterP1Discard, 'p2', { type: 'DRAW_FROM_DISCARD' })
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
    const { rummy: afterP2Draw } = applyRummyAction(afterP1Discard, 'p2', { type: 'DRAW_FROM_DISCARD' })
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
    const { rummy: afterP2Draw } = applyRummyAction(afterP1Discard, 'p2', { type: 'DRAW_FROM_DISCARD' })
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
    // Re-run the full integrated flow
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

    const { rummy: r3 } = applyRummyAction(r2, 'p2', { type: 'DRAW_FROM_DISCARD' })
    expect(totalCards(r3)).toBe(52)

    const p2HandAfterDraw = r3.session.privateStates['p2'].hand
    const { rummy: r4 } = applyRummyAction(r3, 'p2', {
      type: 'DISCARD_CARD',
      cardId: p2HandAfterDraw.cards[0].id,
    })
    expect(totalCards(r4)).toBe(52)

    // Collect all card ids across all four locations
    const allIds = new Set<string>()
    for (const card of r4.stock.cards) allIds.add(card.id)
    for (const card of r4.session.publicState.discardPile.cards) allIds.add(card.id)
    for (const card of r4.session.privateStates['p1'].hand.cards) allIds.add(card.id)
    for (const card of r4.session.privateStates['p2'].hand.cards) allIds.add(card.id)

    expect(allIds.size).toBe(52)

    const total =
      cardCount(r4.stock) +
      cardCount(r4.session.publicState.discardPile) +
      cardCount(r4.session.privateStates['p1'].hand) +
      cardCount(r4.session.privateStates['p2'].hand)
    expect(total).toBe(52)
  })
})
