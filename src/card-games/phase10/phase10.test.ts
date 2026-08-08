import { describe, expect, it } from 'vitest'
import { createPhase10Game, type Phase10PublicState, type Phase10PrivateState, type Phase10Action, type Phase10TurnPhase, type Phase10Session, type Phase10Group, type Phase10Hit } from './state.ts'
import { applyPhase10Action, runPhase10BotTurn } from './rules.ts'
import { deriveSnapshot } from '../../card-engine/sync.ts'
import { currentPlayer, createTurnState } from '../../card-engine/turn-engine.ts'
import { cardCount, createHand, createDiscardPile, createPublicZone, createPlayerZone, addCards } from '../../card-engine/zones.ts'
import { createPhase10Deck } from './deck.ts'
import { createRng } from '../../card-engine/rng.ts'
import { createHostSession } from '../../card-engine/sync.ts'
import type { BotStrategy } from '../../card-engine/bot.ts'
import type { Card } from '../../card-engine/cards.ts'

// Phase 10 deck id layout (108 cards): red 1-12 ×2 = p10-0..p10-23, blue 1-12 ×2 =
// p10-24..p10-47, green 1-12 ×2 = p10-48..p10-71, yellow 1-12 ×2 = p10-72..p10-95,
// Skip = p10-96..p10-99, Wild = p10-100..p10-107.

function totalCards(game: Phase10Session): number {
  const pub = game.session.publicState
  const priv = game.session.privateStates
  let groupCards = 0
  for (const playerId of Object.keys(pub.groups)) {
    for (const group of pub.groups[playerId]) {
      groupCards += cardCount(group.zone)
    }
  }
  const hitCards = pub.hits.reduce((sum, h) => sum + h.cards.length, 0)
  return (
    cardCount(game.stock) +
    cardCount(pub.discardPile) +
    cardCount(priv['p1'].hand) +
    cardCount(priv['p2'].hand) +
    groupCards +
    hitCards
  )
}

function allUniqueCardIds(game: Phase10Session): Set<string> {
  const ids = new Set<string>()
  for (const card of game.stock.cards) ids.add(card.id)
  for (const card of game.session.publicState.discardPile.cards) ids.add(card.id)
  for (const card of game.session.privateStates['p1'].hand.cards) ids.add(card.id)
  for (const card of game.session.privateStates['p2'].hand.cards) ids.add(card.id)
  for (const playerId of Object.keys(game.session.publicState.groups)) {
    for (const group of game.session.publicState.groups[playerId]) {
      for (const card of group.zone.cards) ids.add(card.id)
    }
  }
  for (const h of game.session.publicState.hits) {
    for (const card of h.cards) ids.add(card.id)
  }
  return ids
}

function cardMap(): Map<string, Card> {
  return new Map(createPhase10Deck().map((c) => [c.id, c]))
}

/** Every deck card id NOT in `used` — handy for filling stock with the rest of the deck. */
function remainingDeckIds(used: string[]): string[] {
  const usedSet = new Set(used)
  return createPhase10Deck().map((c) => c.id).filter((id) => !usedSet.has(id))
}

function buildSession(config: {
  p1HandCardIds: string[]
  p2HandCardIds: string[]
  discardCardIds: string[]
  stockCardIds: string[]
  phase?: Phase10TurnPhase
  currentPlayerIndex?: number
  scores?: Record<string, number>
  phaseIdx?: Record<string, number>
  hasLaidPhase?: Record<string, boolean>
  skipUsed?: Record<string, boolean>
  groups?: Record<string, Phase10Group[]>
  hits?: Phase10Hit[]
  roundOver?: boolean
  roundWinnerId?: string | null
  matchWinnerId?: string | null
  handCounts?: Record<string, number>
}): Phase10Session {
  const map = cardMap()

  function cardsFor(ids: string[]): Card[] {
    return ids.map((id) => map.get(id)!)
  }

  const p1Hand = addCards(createHand('p1'), cardsFor(config.p1HandCardIds))
  const p2Hand = addCards(createHand('p2'), cardsFor(config.p2HandCardIds))
  const discardPile = addCards(createDiscardPile(), cardsFor(config.discardCardIds))
  const stock = addCards(createPublicZone('stock', 'private'), cardsFor(config.stockCardIds))

  const playerOrder: [string, string] = ['p1', 'p2']
  const turn = createTurnState<Phase10TurnPhase>(playerOrder, config.phase ?? 'draw')
  if (config.currentPlayerIndex != null) {
    // createTurnState starts at index 0; advance to desired index by directly setting it
    ;(turn as { currentIndex: number }).currentIndex = config.currentPlayerIndex
  }

  const publicState: Phase10PublicState = {
    turn,
    discardPile,
    stockCount: cardCount(stock),
    groups: config.groups ?? { p1: [], p2: [] },
    hits: config.hits ?? [],
    hasLaidPhase: config.hasLaidPhase ?? { p1: false, p2: false },
    phaseIdx: config.phaseIdx ?? { p1: 0, p2: 0 },
    skipUsed: config.skipUsed ?? { p1: false, p2: false },
    scores: config.scores ?? { p1: 0, p2: 0 },
    roundNumber: 1,
    roundOver: config.roundOver ?? false,
    roundWinnerId: config.roundWinnerId ?? null,
    matchWinnerId: config.matchWinnerId ?? null,
    handCounts: config.handCounts ?? { p1: config.p1HandCardIds.length, p2: config.p2HandCardIds.length },
  }

  const privateStates: Record<string, Phase10PrivateState> = {
    p1: { hand: p1Hand },
    p2: { hand: p2Hand },
  }

  return {
    session: createHostSession(publicState, privateStates),
    stock,
    rng: createRng(0),
  }
}

describe('Phase 10 integration harness', () => {
  it('initial deal is correct — 10 each, 1 discard, 87 stock, unique ids, both on Phase 1', () => {
    const game = createPhase10Game(['p1', 'p2'], 42)

    expect(cardCount(game.session.privateStates['p1'].hand)).toBe(10)
    expect(cardCount(game.session.privateStates['p2'].hand)).toBe(10)
    expect(cardCount(game.stock)).toBe(87)
    expect(cardCount(game.session.publicState.discardPile)).toBe(1)
    expect(currentPlayer(game.session.publicState.turn)).toBe('p1')
    expect(game.session.publicState.turn.phase).toBe('draw')
    expect(game.session.publicState.handCounts).toEqual({ p1: 10, p2: 10 })
    expect(game.session.publicState.phaseIdx).toEqual({ p1: 0, p2: 0 })
    expect(totalCards(game)).toBe(108)
    expect(allUniqueCardIds(game).size).toBe(108)
  })

  it('p1 draws from stock — phase moves to discard, stock decrements', () => {
    const game = createPhase10Game(['p1', 'p2'], 42)

    const result = applyPhase10Action(game, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(result.outcome.ok).toBe(true)

    const next = result.game
    expect(cardCount(next.session.privateStates['p1'].hand)).toBe(11)
    expect(cardCount(next.stock)).toBe(86)
    expect(next.session.publicState.stockCount).toBe(86)
    expect(next.session.publicState.turn.phase).toBe('discard')
    expect(next.session.revision).toBe(1)
    expect(totalCards(next)).toBe(108)
  })

  it('p2 draws from discard — top card only, phase moves to discard', () => {
    const game = createPhase10Game(['p1', 'p2'], 42)
    const r1 = applyPhase10Action(game, 'p1', { type: 'DRAW_FROM_STOCK' })

    // p1 discards a non-Skip so the turn passes to p2 normally
    const p1Hand = r1.game.session.privateStates['p1'].hand.cards
    const discardId = p1Hand.find((c) => c.meta?.kind !== 'skip')!.id
    const r2 = applyPhase10Action(r1.game, 'p1', { type: 'DISCARD_CARD', cardId: discardId })

    const result = applyPhase10Action(r2.game, 'p2', { type: 'DRAW_FROM_DISCARD' })
    expect(result.outcome.ok).toBe(true)

    const after = result.game
    expect(cardCount(after.session.privateStates['p2'].hand)).toBe(11)
    expect(cardCount(after.session.publicState.discardPile)).toBe(1)   // just the initial flip remains
    expect(after.session.publicState.turn.phase).toBe('discard')
    expect(totalCards(after)).toBe(108)
  })

  it('DRAW_FROM_DISCARD rejected when the top card is a Skip', () => {
    const game = buildSession({
      p1HandCardIds: ['p10-0', 'p10-2', 'p10-4', 'p10-6', 'p10-8', 'p10-10', 'p10-12', 'p10-14', 'p10-16', 'p10-18'],
      p2HandCardIds: ['p10-24', 'p10-26', 'p10-28', 'p10-30', 'p10-32', 'p10-34', 'p10-36', 'p10-38', 'p10-40', 'p10-42'],
      discardCardIds: ['p10-72', 'p10-96'],   // top = Skip
      stockCardIds: remainingDeckIds(['p10-0', 'p10-2', 'p10-4', 'p10-6', 'p10-8', 'p10-10', 'p10-12', 'p10-14', 'p10-16', 'p10-18', 'p10-24', 'p10-26', 'p10-28', 'p10-30', 'p10-32', 'p10-34', 'p10-36', 'p10-38', 'p10-40', 'p10-42', 'p10-72', 'p10-96']),
      phase: 'draw',
      currentPlayerIndex: 0,
    })

    const result = applyPhase10Action(game, 'p1', { type: 'DRAW_FROM_DISCARD' })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('Skip card can never be picked up')
    // nothing moved
    expect(cardCount(game.session.privateStates['p1'].hand)).toBe(10)
  })

  it('LAY_PHASE happy path — hasLaidPhase flips, groups populated with correct types', () => {
    // Phase 1 (index 0) = 2 sets of 3: three 5s + three 9s
    const p1Cards = ['p10-8', 'p10-32', 'p10-56', 'p10-16', 'p10-40', 'p10-64', 'p10-0', 'p10-2', 'p10-4', 'p10-6']
    const p2Cards = ['p10-72', 'p10-73', 'p10-74', 'p10-75', 'p10-76', 'p10-77', 'p10-78', 'p10-79', 'p10-80', 'p10-81']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-96'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-96']),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const result = applyPhase10Action(game, 'p1', {
      type: 'LAY_PHASE',
      cardIds: ['p10-8', 'p10-32', 'p10-56', 'p10-16', 'p10-40', 'p10-64'],
    })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.hasLaidPhase['p1']).toBe(true)
    expect(pub.hasLaidPhase['p2']).toBe(false)
    expect(pub.groups['p1']).toHaveLength(2)
    expect(pub.groups['p1'].map((g) => g.type)).toEqual(['set', 'set'])
    expect(pub.groups['p1'][0].zone.cards.map((c) => c.id).sort()).toEqual(['p10-8', 'p10-32', 'p10-56'].sort())
    expect(pub.groups['p1'][1].zone.cards.map((c) => c.id).sort()).toEqual(['p10-16', 'p10-40', 'p10-64'].sort())
    expect(cardCount(result.game.session.privateStates['p1'].hand)).toBe(4)
    expect(pub.handCounts['p1']).toBe(4)
    expect(totalCards(result.game)).toBe(108)
  })

  it('LAY_PHASE rejected — a second LAY_PHASE the same round', () => {
    const p1Cards = ['p10-8', 'p10-32', 'p10-56', 'p10-16', 'p10-40', 'p10-64', 'p10-0', 'p10-2', 'p10-4', 'p10-6']
    const p2Cards = ['p10-72', 'p10-73', 'p10-74', 'p10-75', 'p10-76', 'p10-77', 'p10-78', 'p10-79', 'p10-80', 'p10-81']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-96'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-96']),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const first = applyPhase10Action(game, 'p1', {
      type: 'LAY_PHASE',
      cardIds: ['p10-8', 'p10-32', 'p10-56', 'p10-16', 'p10-40', 'p10-64'],
    })
    expect(first.outcome.ok).toBe(true)

    const second = applyPhase10Action(first.game, 'p1', {
      type: 'LAY_PHASE',
      cardIds: ['p10-0', 'p10-2', 'p10-4', 'p10-6'],
    })
    expect(second.outcome.ok).toBe(false)
    expect(second.outcome.reason).toContain('already laid your phase')
  })

  it('LAY_PHASE rejected — composition does not match the current phase', () => {
    // Phase 1 (index 0) = 2 sets of 3; a single run of 6 reds does not satisfy it
    const p1Cards = ['p10-0', 'p10-2', 'p10-4', 'p10-6', 'p10-8', 'p10-10', 'p10-12', 'p10-14', 'p10-16', 'p10-18']
    const p2Cards = ['p10-72', 'p10-73', 'p10-74', 'p10-75', 'p10-76', 'p10-77', 'p10-78', 'p10-79', 'p10-80', 'p10-81']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-96'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-96']),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const result = applyPhase10Action(game, 'p1', {
      type: 'LAY_PHASE',
      cardIds: ['p10-0', 'p10-2', 'p10-4', 'p10-6', 'p10-8', 'p10-10'],
    })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('does not complete your phase')
    expect(cardCount(result.game.session.privateStates['p1'].hand)).toBe(10)
  })

  it('LAY_PHASE rejected — selection contains a Skip even if the rest would work', () => {
    const p1Cards = ['p10-8', 'p10-32', 'p10-56', 'p10-16', 'p10-40', 'p10-64', 'p10-96', 'p10-0', 'p10-2', 'p10-4']
    const p2Cards = ['p10-72', 'p10-73', 'p10-74', 'p10-75', 'p10-76', 'p10-77', 'p10-78', 'p10-79', 'p10-80', 'p10-81']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-97'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-97']),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const result = applyPhase10Action(game, 'p1', {
      type: 'LAY_PHASE',
      cardIds: ['p10-8', 'p10-32', 'p10-56', 'p10-16', 'p10-40', 'p10-64', 'p10-96'],
    })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('Skip card cannot be used in a phase')
    expect(cardCount(result.game.session.privateStates['p1'].hand)).toBe(10)
  })

  it('going out via LAY_PHASE — laying the entire hand triggers finishRoundByGoingOut', () => {
    const p1Cards = ['p10-8', 'p10-32', 'p10-56', 'p10-16', 'p10-40', 'p10-64']   // exactly Phase 1
    const p2Cards = ['p10-72', 'p10-73', 'p10-74', 'p10-75', 'p10-76', 'p10-77', 'p10-78', 'p10-79', 'p10-80', 'p10-81']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-96'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-96']),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const result = applyPhase10Action(game, 'p1', { type: 'LAY_PHASE', cardIds: p1Cards })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.roundOver).toBe(true)
    expect(pub.roundWinnerId).toBe('p1')
    expect(pub.matchWinnerId).toBeNull()
    expect(pub.handCounts['p1']).toBe(0)
    expect(cardCount(result.game.session.privateStates['p1'].hand)).toBe(0)
    // p1 laid their phase → advances to Phase 2; p2 didn't lay → stays on Phase 1
    expect(pub.phaseIdx).toEqual({ p1: 1, p2: 0 })
    expect(totalCards(result.game)).toBe(108)
  })

  it('HIT rejected — player has not laid their own phase yet', () => {
    const p2GroupZone = addCards(createPlayerZone('p2', 'p10group-0', 'public'), ['p10-8', 'p10-32', 'p10-56'].map((id) => cardMap().get(id)!))
    const p1Cards = ['p10-80', 'p10-0', 'p10-2', 'p10-4', 'p10-6', 'p10-10', 'p10-12', 'p10-14', 'p10-16', 'p10-18']
    const p2Cards = ['p10-24', 'p10-26', 'p10-28', 'p10-30', 'p10-34', 'p10-36', 'p10-38', 'p10-40', 'p10-42', 'p10-44']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-96'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-96', 'p10-8', 'p10-32', 'p10-56']),
      phase: 'discard',
      currentPlayerIndex: 0,
      groups: { p1: [], p2: [{ type: 'set', zone: p2GroupZone }] },
    })

    const result = applyPhase10Action(game, 'p1', { type: 'HIT', targetPlayerId: 'p2', groupIndex: 0, cardIds: ['p10-80'] })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('lay your own phase before hitting')
  })

  it('HIT happy path — onto your own group', () => {
    const p1GroupZone = addCards(createPlayerZone('p1', 'p10group-0', 'public'), ['p10-8', 'p10-32', 'p10-56'].map((id) => cardMap().get(id)!))
    const p1Cards = ['p10-80', 'p10-0', 'p10-2', 'p10-4', 'p10-6', 'p10-10', 'p10-12', 'p10-14', 'p10-16', 'p10-18']
    const p2Cards = ['p10-72', 'p10-73', 'p10-74', 'p10-75', 'p10-76', 'p10-77', 'p10-78', 'p10-79', 'p10-81', 'p10-82']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-96'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-96', 'p10-8', 'p10-32', 'p10-56']),
      phase: 'discard',
      currentPlayerIndex: 0,
      hasLaidPhase: { p1: true, p2: false },
      groups: { p1: [{ type: 'set', zone: p1GroupZone }], p2: [] },
    })

    const result = applyPhase10Action(game, 'p1', { type: 'HIT', targetPlayerId: 'p1', groupIndex: 0, cardIds: ['p10-80'] })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.hits).toHaveLength(1)
    expect(pub.hits[0]).toMatchObject({ id: 'hit-0', playerId: 'p1', targetPlayerId: 'p1', targetGroupIndex: 0 })
    expect(pub.hits[0].cards.map((c) => c.id)).toEqual(['p10-80'])
    // the original zone is untouched — the hit card stays attributed to the hitter
    expect(pub.groups['p1'][0].zone.cards.map((c) => c.id).sort()).toEqual(['p10-8', 'p10-32', 'p10-56'].sort())
    expect(cardCount(result.game.session.privateStates['p1'].hand)).toBe(9)
    expect(pub.handCounts['p1']).toBe(9)
    expect(totalCards(result.game)).toBe(108)
  })

  it('HIT happy path — onto the opponent\'s group', () => {
    // p2's group is a run red 4-5-6; p1 hits a red 7 onto it
    const p2GroupZone = addCards(createPlayerZone('p2', 'p10group-0', 'public'), ['p10-6', 'p10-8', 'p10-10'].map((id) => cardMap().get(id)!))
    const p1Cards = ['p10-12', 'p10-0', 'p10-2', 'p10-4', 'p10-14', 'p10-16', 'p10-18', 'p10-20', 'p10-22', 'p10-24']
    const p2Cards = ['p10-26', 'p10-28', 'p10-30', 'p10-32', 'p10-34', 'p10-36', 'p10-38', 'p10-40', 'p10-42', 'p10-44']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-96'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-96', 'p10-6', 'p10-8', 'p10-10']),
      phase: 'discard',
      currentPlayerIndex: 0,
      hasLaidPhase: { p1: true, p2: false },
      groups: { p1: [], p2: [{ type: 'run', zone: p2GroupZone }] },
    })

    const result = applyPhase10Action(game, 'p1', { type: 'HIT', targetPlayerId: 'p2', groupIndex: 0, cardIds: ['p10-12'] })
    expect(result.outcome.ok).toBe(true)
    expect(result.game.session.publicState.hits[0]).toMatchObject({ playerId: 'p1', targetPlayerId: 'p2', targetGroupIndex: 0 })
    expect(result.game.session.publicState.hits[0].cards.map((c) => c.id)).toEqual(['p10-12'])
    expect(totalCards(result.game)).toBe(108)
  })

  it('HIT rejected — the added card breaks the group constraint', () => {
    const p2GroupZone = addCards(createPlayerZone('p2', 'p10group-0', 'public'), ['p10-8', 'p10-32', 'p10-56'].map((id) => cardMap().get(id)!))
    const p1Cards = ['p10-12', 'p10-0', 'p10-2', 'p10-4', 'p10-6', 'p10-10', 'p10-14', 'p10-16', 'p10-18', 'p10-20']
    const p2Cards = ['p10-24', 'p10-26', 'p10-28', 'p10-30', 'p10-34', 'p10-36', 'p10-38', 'p10-40', 'p10-42', 'p10-44']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-96'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-96', 'p10-8', 'p10-32', 'p10-56']),
      phase: 'discard',
      currentPlayerIndex: 0,
      hasLaidPhase: { p1: true, p2: false },
      groups: { p1: [], p2: [{ type: 'set', zone: p2GroupZone }] },
    })

    // a red 7 (p10-12) is not a 5 — the set of 5s breaks
    const result = applyPhase10Action(game, 'p1', { type: 'HIT', targetPlayerId: 'p2', groupIndex: 0, cardIds: ['p10-12'] })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('cannot be added to that group')
    expect(result.game.session.publicState.hits).toHaveLength(0)
    expect(cardCount(result.game.session.privateStates['p1'].hand)).toBe(10)
  })

  it('HIT rejected — nonexistent group index', () => {
    const p1Cards = ['p10-80', 'p10-0', 'p10-2', 'p10-4', 'p10-6', 'p10-10', 'p10-12', 'p10-14', 'p10-16', 'p10-18']
    const p2Cards = ['p10-24', 'p10-26', 'p10-28', 'p10-30', 'p10-32', 'p10-34', 'p10-36', 'p10-38', 'p10-40', 'p10-42']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-96'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-96']),
      phase: 'discard',
      currentPlayerIndex: 0,
      hasLaidPhase: { p1: true, p2: false },
    })

    const result = applyPhase10Action(game, 'p1', { type: 'HIT', targetPlayerId: 'p2', groupIndex: 3, cardIds: ['p10-80'] })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('no such group')
  })

  it('going out via HIT — hitting your last card onto your own group ends the round', () => {
    const p1GroupZone = addCards(createPlayerZone('p1', 'p10group-0', 'public'), ['p10-8', 'p10-32', 'p10-56'].map((id) => cardMap().get(id)!))
    const p2Cards = ['p10-72', 'p10-73', 'p10-74', 'p10-75', 'p10-76', 'p10-77', 'p10-78', 'p10-79', 'p10-81', 'p10-82']
    const game = buildSession({
      p1HandCardIds: ['p10-80'],
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-96'],
      stockCardIds: remainingDeckIds(['p10-80', ...p2Cards, 'p10-96', 'p10-8', 'p10-32', 'p10-56']),
      phase: 'discard',
      currentPlayerIndex: 0,
      hasLaidPhase: { p1: true, p2: false },
      groups: { p1: [{ type: 'set', zone: p1GroupZone }], p2: [] },
    })

    const result = applyPhase10Action(game, 'p1', { type: 'HIT', targetPlayerId: 'p1', groupIndex: 0, cardIds: ['p10-80'] })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.roundOver).toBe(true)
    expect(pub.roundWinnerId).toBe('p1')
    expect(pub.handCounts['p1']).toBe(0)
    expect(pub.hits).toHaveLength(1)
    expect(totalCards(result.game)).toBe(108)
  })

  it('discard ends the turn normally — advanceTurn to the opponent', () => {
    const game = createPhase10Game(['p1', 'p2'], 42)
    const { game: afterDraw } = applyPhase10Action(game, 'p1', { type: 'DRAW_FROM_STOCK' })

    const p1Hand = afterDraw.session.privateStates['p1'].hand.cards
    const discardId = p1Hand.find((c) => c.meta?.kind !== 'skip')!.id
    const result = applyPhase10Action(afterDraw, 'p1', { type: 'DISCARD_CARD', cardId: discardId })
    expect(result.outcome.ok).toBe(true)

    const after = result.game
    expect(cardCount(after.session.privateStates['p1'].hand)).toBe(10)
    expect(cardCount(after.session.publicState.discardPile)).toBe(2)
    const discardCards = after.session.publicState.discardPile.cards
    expect(discardCards[discardCards.length - 1].id).toBe(discardId)
    expect(currentPlayer(after.session.publicState.turn)).toBe('p2')
    expect(after.session.publicState.turn.phase).toBe('draw')
    expect(totalCards(after)).toBe(108)
  })

  it('going out via DISCARD_CARD — discarding your last card ends the round', () => {
    const p2Cards = ['p10-2', 'p10-4', 'p10-6', 'p10-8', 'p10-10', 'p10-12', 'p10-14', 'p10-16', 'p10-18', 'p10-20']
    const game = buildSession({
      p1HandCardIds: ['p10-0'],
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-22'],
      stockCardIds: remainingDeckIds(['p10-0', ...p2Cards, 'p10-22']),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const result = applyPhase10Action(game, 'p1', { type: 'DISCARD_CARD', cardId: 'p10-0' })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.roundOver).toBe(true)
    expect(pub.roundWinnerId).toBe('p1')
    expect(pub.matchWinnerId).toBeNull()
    expect(pub.handCounts['p1']).toBe(0)
    expect(totalCards(result.game)).toBe(108)
  })

  it('discarding a Skip skips the opponent — in 2-player, the discarder acts again', () => {
    const p1Cards = ['p10-96', 'p10-0', 'p10-2', 'p10-4', 'p10-6', 'p10-8', 'p10-10', 'p10-12', 'p10-14', 'p10-16']
    const p2Cards = ['p10-72', 'p10-73', 'p10-74', 'p10-75', 'p10-76', 'p10-77', 'p10-78', 'p10-79', 'p10-80', 'p10-81']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-97'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-97']),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const result = applyPhase10Action(game, 'p1', { type: 'DISCARD_CARD', cardId: 'p10-96' })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.skipUsed['p1']).toBe(true)
    expect(pub.skipUsed['p2']).toBe(false)
    // skipNext with 2 players advances by 2 → lands back on p1 (p2's turn is skipped)
    expect(currentPlayer(pub.turn)).toBe('p1')
    expect(pub.turn.phase).toBe('draw')
    expect(totalCards(result.game)).toBe(108)
  })

  it('discarding a second Skip the same round does NOT skip again', () => {
    const p1Cards = ['p10-96', 'p10-97', 'p10-0', 'p10-2', 'p10-4', 'p10-6', 'p10-8', 'p10-10', 'p10-12', 'p10-14']
    const p2Cards = ['p10-72', 'p10-73', 'p10-74', 'p10-75', 'p10-76', 'p10-77', 'p10-78', 'p10-79', 'p10-80', 'p10-81']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-98'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-98']),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const r1 = applyPhase10Action(game, 'p1', { type: 'DISCARD_CARD', cardId: 'p10-96' })
    expect(r1.outcome.ok).toBe(true)
    expect(currentPlayer(r1.game.session.publicState.turn)).toBe('p1')

    // p1 draws (their turn again after the skip), then discards the SECOND Skip
    const r2 = applyPhase10Action(r1.game, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(r2.outcome.ok).toBe(true)
    const r3 = applyPhase10Action(r2.game, 'p1', { type: 'DISCARD_CARD', cardId: 'p10-97' })
    expect(r3.outcome.ok).toBe(true)

    const pub = r3.game.session.publicState
    // a second Skip discards normally — skipUsed stays capped, turn advances to p2
    expect(pub.skipUsed['p1']).toBe(true)
    expect(currentPlayer(pub.turn)).toBe('p2')
    expect(pub.turn.phase).toBe('draw')
    expect(totalCards(r3.game)).toBe(108)
  })

  it('stock recycling — empty stock recycles the discard pile keeping its top card', () => {
    const p1Cards = ['p10-0', 'p10-2', 'p10-4']
    const discardCards = ['p10-6', 'p10-8', 'p10-10']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: remainingDeckIds([...p1Cards, ...discardCards]),
      discardCardIds: discardCards,
      stockCardIds: [],
      phase: 'draw',
      currentPlayerIndex: 0,
    })

    expect(cardCount(game.stock)).toBe(0)
    expect(cardCount(game.session.publicState.discardPile)).toBe(3)

    const result = applyPhase10Action(game, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(result.outcome.ok).toBe(true)

    const after = result.game
    // p1 gained 1 card; the discard pile's top card (p10-10) stays in place
    expect(cardCount(after.session.privateStates['p1'].hand)).toBe(4)
    expect(after.session.publicState.discardPile.cards).toHaveLength(1)
    expect(after.session.publicState.discardPile.cards[0].id).toBe('p10-10')
    // two cards recycled, one drawn → one left in stock
    expect(cardCount(after.stock)).toBe(1)
    expect(after.session.publicState.stockCount).toBe(1)
    expect(totalCards(after)).toBe(108)
    expect(allUniqueCardIds(after).size).toBe(108)
  })

  it('recycle impossible — empty stock with a single discard card rejects', () => {
    const p1Cards = ['p10-0', 'p10-2', 'p10-4']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: remainingDeckIds(['p10-0', 'p10-2', 'p10-4', 'p10-6']),
      discardCardIds: ['p10-6'],
      stockCardIds: [],
      phase: 'draw',
      currentPlayerIndex: 0,
    })

    const result = applyPhase10Action(game, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toContain('discard pile')
  })

  it('blocked round — empty stock and empty discard, no score or phaseIdx change', () => {
    const p1Cards = ['p10-0', 'p10-2', 'p10-4']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: remainingDeckIds(p1Cards),
      discardCardIds: [],
      stockCardIds: [],
      phase: 'draw',
      currentPlayerIndex: 0,
      scores: { p1: 5, p2: 7 },
      phaseIdx: { p1: 3, p2: 2 },
    })

    expect(cardCount(game.stock)).toBe(0)
    expect(cardCount(game.session.publicState.discardPile)).toBe(0)

    const result = applyPhase10Action(game, 'p1', { type: 'DRAW_FROM_STOCK' })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.roundOver).toBe(true)
    expect(pub.roundWinnerId).toBeNull()
    // a dead round: nobody completed or failed anything
    expect(pub.scores).toEqual({ p1: 5, p2: 7 })
    expect(pub.phaseIdx).toEqual({ p1: 3, p2: 2 })
  })

  it('scoring exact values — opponent hand of 5/10/Skip/Wild costs exactly 55', () => {
    // red 5 (value 5), red 10 (value 10), Skip (15), Wild (25) → 5+10+15+25 = 55
    const p2Cards = ['p10-8', 'p10-18', 'p10-96', 'p10-100']
    const game = buildSession({
      p1HandCardIds: ['p10-0'],
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-2'],
      stockCardIds: remainingDeckIds(['p10-0', ...p2Cards, 'p10-2']),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const result = applyPhase10Action(game, 'p1', { type: 'DISCARD_CARD', cardId: 'p10-0' })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.scores['p1']).toBe(0)       // the going-out player adds nothing
    expect(pub.scores['p2']).toBe(55)      // 5 + 10 + 15 + 25
  })

  it('phase advancement — laid player advances, un-laid player repeats their phase', () => {
    const p2Cards = ['p10-2', 'p10-4', 'p10-6', 'p10-8', 'p10-10', 'p10-12', 'p10-14', 'p10-16', 'p10-18', 'p10-20']
    const game = buildSession({
      p1HandCardIds: ['p10-0'],
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-22'],
      stockCardIds: remainingDeckIds(['p10-0', ...p2Cards, 'p10-22']),
      phase: 'discard',
      currentPlayerIndex: 0,
      hasLaidPhase: { p1: true, p2: false },
      phaseIdx: { p1: 0, p2: 0 },
    })

    const result = applyPhase10Action(game, 'p1', { type: 'DISCARD_CARD', cardId: 'p10-0' })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.roundOver).toBe(true)
    // p1 laid their phase this round → advances to Phase 2 (index 1)
    // p2 did not lay → stays on Phase 1 (index 0)
    expect(pub.phaseIdx).toEqual({ p1: 1, p2: 0 })
  })

  it('match win, single completer — laying Phase 10 and going out wins the match immediately', () => {
    // Phase 10 (index 9) = 1 set of 5 + 1 set of 3: five 2s + three 3s — exactly 8 cards
    const phase10Cards = ['p10-2', 'p10-3', 'p10-26', 'p10-27', 'p10-50', 'p10-4', 'p10-28', 'p10-52']
    const p2Cards = ['p10-72', 'p10-73', 'p10-74', 'p10-75', 'p10-76', 'p10-77', 'p10-78', 'p10-79', 'p10-80', 'p10-81']
    const game = buildSession({
      p1HandCardIds: phase10Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-96'],
      stockCardIds: remainingDeckIds([...phase10Cards, ...p2Cards, 'p10-96']),
      phase: 'discard',
      currentPlayerIndex: 0,
      phaseIdx: { p1: 9, p2: 0 },
    })

    const result = applyPhase10Action(game, 'p1', { type: 'LAY_PHASE', cardIds: phase10Cards })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.roundOver).toBe(true)
    expect(pub.roundWinnerId).toBe('p1')
    expect(pub.matchWinnerId).toBe('p1')
    // 9 + 1 capped at 9 — the match ends, there is no Phase 11
    expect(pub.phaseIdx['p1']).toBe(9)
    expect(cardCount(result.game.session.privateStates['p1'].hand)).toBe(0)
  })

  it('match win, simultaneous completers — lower post-round score wins the tiebreak', () => {
    // Both players are on Phase 10 and both laid it this round. p1 goes out by discarding
    // their last card; p2's hand penalty (55) pushes p2's score above p1's 40, so p1 wins.
    const p2Cards = ['p10-8', 'p10-18', 'p10-96', 'p10-100']
    const game = buildSession({
      p1HandCardIds: ['p10-0'],
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-2'],
      stockCardIds: remainingDeckIds(['p10-0', ...p2Cards, 'p10-2']),
      phase: 'discard',
      currentPlayerIndex: 0,
      phaseIdx: { p1: 9, p2: 9 },
      hasLaidPhase: { p1: true, p2: true },
      scores: { p1: 40, p2: 0 },
    })

    const result = applyPhase10Action(game, 'p1', { type: 'DISCARD_CARD', cardId: 'p10-0' })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.scores).toEqual({ p1: 40, p2: 55 })
    expect(pub.matchWinnerId).toBe('p1')   // 40 < 55 — p2's penalty flipped the leader
  })

  it('match win, simultaneous completers — the lower-score completer can also be the opponent', () => {
    const p2Cards = ['p10-8', 'p10-18', 'p10-96', 'p10-100']
    const game = buildSession({
      p1HandCardIds: ['p10-0'],
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-2'],
      stockCardIds: remainingDeckIds(['p10-0', ...p2Cards, 'p10-2']),
      phase: 'discard',
      currentPlayerIndex: 0,
      phaseIdx: { p1: 9, p2: 9 },
      hasLaidPhase: { p1: true, p2: true },
      scores: { p1: 100, p2: 0 },
    })

    const result = applyPhase10Action(game, 'p1', { type: 'DISCARD_CARD', cardId: 'p10-0' })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.scores).toEqual({ p1: 100, p2: 55 })
    expect(pub.matchWinnerId).toBe('p2')   // 55 < 100
  })

  it('START_NEXT_ROUND resets round-scoped fields but keeps phaseIdx and scores', () => {
    const p1Cards = ['p10-0', 'p10-2', 'p10-4']
    const p2Cards = ['p10-6', 'p10-8', 'p10-10', 'p10-12', 'p10-14']
    const game = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-16'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-16']),
      phase: 'draw',
      currentPlayerIndex: 0,
      scores: { p1: 35, p2: 55 },
      phaseIdx: { p1: 1, p2: 0 },
      roundOver: true,
      roundWinnerId: 'p1',
    })

    const result = applyPhase10Action(game, 'p1', { type: 'START_NEXT_ROUND' })
    expect(result.outcome.ok).toBe(true)

    const pub = result.game.session.publicState
    expect(pub.roundNumber).toBe(2)
    expect(pub.roundOver).toBe(false)
    expect(pub.roundWinnerId).toBeNull()
    expect(pub.groups).toEqual({ p2: [], p1: [] })
    expect(pub.hits).toEqual([])
    expect(pub.hasLaidPhase).toEqual({ p2: false, p1: false })
    expect(pub.skipUsed).toEqual({ p2: false, p1: false })
    expect(cardCount(result.game.session.privateStates['p1'].hand)).toBe(10)
    expect(cardCount(result.game.session.privateStates['p2'].hand)).toBe(10)
    expect(cardCount(pub.discardPile)).toBe(1)
    expect(cardCount(result.game.stock)).toBe(87)
    // the whole point of a multi-round Phase 10 match — these persist
    expect(pub.phaseIdx).toEqual({ p1: 1, p2: 0 })
    expect(pub.scores).toEqual({ p1: 35, p2: 55 })
    // starting player alternates: previous order [p1, p2] → next [p2, p1]
    expect(currentPlayer(pub.turn)).toBe('p2')
    expect(totalCards(result.game)).toBe(108)
  })

  it('hidden information — p2 snapshot does not leak p1 hand cards', () => {
    const game = createPhase10Game(['p1', 'p2'], 42)
    const { game: afterDraw } = applyPhase10Action(game, 'p1', { type: 'DRAW_FROM_STOCK' })

    const p1CardIds = new Set(afterDraw.session.privateStates['p1'].hand.cards.map((c) => c.id))
    const p2CardIds = new Set(afterDraw.session.privateStates['p2'].hand.cards.map((c) => c.id))

    const p2Snapshot = deriveSnapshot(afterDraw.session, 'p2')

    expect(p2Snapshot.privateState!.hand.cards.length).toBe(10)
    for (const card of p2Snapshot.privateState!.hand.cards) {
      expect(p2CardIds.has(card.id)).toBe(true)
      expect(p1CardIds.has(card.id)).toBe(false)
    }

    const json = JSON.stringify(p2Snapshot)
    const discardIds = new Set(afterDraw.session.publicState.discardPile.cards.map((c) => c.id))
    for (const id of p1CardIds) {
      if (discardIds.has(id)) continue
      expect(json).not.toContain(id)
    }
  })

  it('malformed actions rejected with ok:false, never thrown', () => {
    const game = createPhase10Game(['p1', 'p2'], 42)

    // garbage action type
    const garbage = applyPhase10Action(game, 'p1', { type: 'GARBAGE' } as any)
    expect(garbage.outcome.ok).toBe(false)
    expect(garbage.outcome.reason).toContain('unknown action')

    // LAY_PHASE with non-array cardIds
    const { game: afterDraw } = applyPhase10Action(game, 'p1', { type: 'DRAW_FROM_STOCK' })
    for (const bad of [null, undefined, 5]) {
      const result = applyPhase10Action(afterDraw, 'p1', { type: 'LAY_PHASE', cardIds: bad as any })
      expect(result.outcome.ok).toBe(false)
      expect(result.outcome.reason).toContain('invalid cardIds')
    }

    // HIT with non-array cardIds
    const p2GroupZone = addCards(createPlayerZone('p2', 'p10group-0', 'public'), ['p10-8', 'p10-32', 'p10-56'].map((id) => cardMap().get(id)!))
    const p1Cards = ['p10-80', 'p10-0', 'p10-2', 'p10-4', 'p10-6', 'p10-10', 'p10-12', 'p10-14', 'p10-16', 'p10-18']
    const p2Cards = ['p10-24', 'p10-26', 'p10-28', 'p10-30', 'p10-32', 'p10-34', 'p10-36', 'p10-38', 'p10-40', 'p10-42']
    const hitGame = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: ['p10-96'],
      stockCardIds: remainingDeckIds([...p1Cards, ...p2Cards, 'p10-96', 'p10-8', 'p10-32', 'p10-56']),
      phase: 'discard',
      currentPlayerIndex: 0,
      hasLaidPhase: { p1: true, p2: false },
      groups: { p1: [], p2: [{ type: 'set', zone: p2GroupZone }] },
    })
    const hitResult = applyPhase10Action(hitGame, 'p1', { type: 'HIT', targetPlayerId: 'p2', groupIndex: 0, cardIds: null as any })
    expect(hitResult.outcome.ok).toBe(false)
    expect(hitResult.outcome.reason).toContain('invalid cardIds')
  })

  it('house player bot completes a full turn', () => {
    const game = createPhase10Game(['p1', 'p2'], 42)

    const strategy: BotStrategy<Phase10PublicState, Phase10PrivateState, Phase10Action> = (
      publicState,
      privateState,
    ) => {
      if (publicState.turn.phase === 'draw') return { type: 'DRAW_FROM_STOCK' }
      return { type: 'DISCARD_CARD', cardId: privateState.hand.cards.find((c) => c.meta?.kind !== 'skip')!.id }
    }

    const drawResult = runPhase10BotTurn(game, 'p1', strategy)
    expect(drawResult.outcome.ok).toBe(true)
    expect(drawResult.game.session.publicState.turn.phase).toBe('discard')

    const discardResult = runPhase10BotTurn(drawResult.game, 'p1', strategy)
    expect(discardResult.outcome.ok).toBe(true)
    expect(discardResult.game.session.publicState.turn.phase).toBe('draw')
    expect(currentPlayer(discardResult.game.session.publicState.turn)).toBe('p2')
    expect(totalCards(discardResult.game)).toBe(108)
  })
})
