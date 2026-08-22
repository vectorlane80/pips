import { describe, expect, it } from 'vitest'
import { createRummyGame, type RummyPublicState, type RummyPrivateState, type RummyPhase, type RummySession, type RummyLayoff } from './state.ts'
import { applyRummyAction, runRummyBotTurn } from './rules.ts'
import { currentPlayer } from '../../engine/turn-engine.ts'
import { cardCount, createHand, createDiscardPile, createPublicZone, addCards, type Zone } from '../../card-engine/zones.ts'
import { createStandardDeck } from '../../card-engine/deck.ts'
import { createRng } from '../../engine/rng.ts'
import { createTurnState } from '../../engine/turn-engine.ts'
import { createHostSession } from '../../engine/sync.ts'
import { classifyMeld } from './melds.ts'
import type { Card } from '../../card-engine/cards.ts'
import { findMeld, rummyBotStrategy } from './bot.ts'

// ── helpers ──────────────────────────────────────────────────

function totalCards(rummy: RummySession): number {
  const pub = rummy.session.publicState
  const priv = rummy.session.privateStates
  let meldCards = 0
  for (const playerId of Object.keys(pub.melds)) {
    for (const meld of pub.melds[playerId]) {
      meldCards += cardCount(meld)
    }
  }
  const layoffCards = pub.layoffs.reduce((sum, l) => sum + l.cards.length, 0)
  return (
    cardCount(rummy.stock) +
    cardCount(pub.discardPile) +
    cardCount(priv['p1'].hand) +
    cardCount(priv['p2'].hand) +
    meldCards +
    layoffCards
  )
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
  layoffs?: RummyLayoff[]
  handCounts?: Record<string, number>
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
    ;(turn as { currentIndex: number }).currentIndex = config.currentPlayerIndex
  }

  const publicState: RummyPublicState = {
    turn,
    seatOrder: ['p1', 'p2'],
    discardPile,
    stockCount: cardCount(stock),
    melds: config.melds ?? { p1: [], p2: [] },
    layoffs: config.layoffs ?? [],
    obligatedCardId: config.obligatedCardId ?? null,
    scores: config.scores ?? { p1: 0, p2: 0 },
    target: 100,
    roundNumber: 1,
    roundOver: config.roundOver ?? false,
    roundWinnerId: config.roundWinnerId ?? null,
    matchWinnerId: config.matchWinnerId ?? null,
    cardBack: 'classic',
    handCounts: config.handCounts ?? { p1: config.p1HandCardIds.length, p2: config.p2HandCardIds.length },
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

/** Cards c0–c12 = clubs A–K, c13–c25 = diamonds A–K, etc. */
function cardsByIds(...ids: string[]): Card[] {
  const full = createStandardDeck()
  const map = new Map(full.map((c) => [c.id, c]))
  return ids.map((id) => map.get(id)!)
}

// ── tests: findMeld ──────────────────────────────────────────

describe('findMeld', () => {
  it('finds a meld when one exists (run)', () => {
    // c0=A♣, c1=2♣, c2=3♣ → run
    const hand = cardsByIds('c0', 'c1', 'c2', 'c13', 'c26')
    const result = findMeld(hand)
    expect(result).not.toBeNull()
    const meldCards = cardsByIds(...result!)
    expect(classifyMeld(meldCards).valid).toBe(true)
    // Should include the run (A♣,2♣,3♣ = 3 cards)
    expect(result!.length).toBe(3)
  })

  it('finds a meld when one exists (set)', () => {
    // c0=A♣, c13=A♦, c26=A♥, c39=A♠ → set of aces
    const hand = cardsByIds('c0', 'c13', 'c26', 'c39', 'c5', 'c18')
    const result = findMeld(hand)
    expect(result).not.toBeNull()
    const meldCards = cardsByIds(...result!)
    expect(classifyMeld(meldCards).valid).toBe(true)
    // With 4 aces, should find a 4-card meld (prefer larger)
    expect(result!.length).toBe(4)
  })

  it('returns null when no meld exists', () => {
    // 2♣, 4♣, 6♣, 8♣ — every other rank, no consecutive 3
    // A♦, 3♦ — not enough
    const hand = cardsByIds('c1', 'c3', 'c5', 'c7', 'c13', 'c15')
    const result = findMeld(hand)
    expect(result).toBeNull()
  })

  it('with requiredId only returns melds containing that card', () => {
    // Hand: A♣,2♣,3♣ (run), A♦,2♦,3♦ (run)
    // requiredId = c0 (A♣) → should return the clubs run, not the diamonds run
    const hand = cardsByIds('c0', 'c1', 'c2', 'c13', 'c14', 'c15')
    const result = findMeld(hand, 'c0')
    expect(result).not.toBeNull()
    expect(result!).toContain('c0')
    expect(result!).not.toContain('c13')
  })

  it('prefers larger melds over smaller ones', () => {
    // 4 of a kind: A♣(c0), A♦(c13), A♥(c26), A♠(c39)
    // Should return 4-card set, not just any 3-card subset
    const hand = cardsByIds('c0', 'c13', 'c26', 'c39')
    const result = findMeld(hand)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(4)
  })
})

// ── tests: rummyBotStrategy ──────────────────────────────────

describe('rummyBotStrategy', () => {
  it('draw phase: takes top discard when useful', () => {
    // p1 hand: A♣(c0), 2♣(c1) — missing 3♣ for a run
    // Discard top: 3♣(c2) — completes the run
    // p1 turn, phase 'draw'
    const rummy = buildSession({
      p1HandCardIds: ['c0', 'c1', 'c13', 'c26'],
      p2HandCardIds: ['c5', 'c6', 'c7', 'c8'],
      discardCardIds: ['c51', 'c2'],   // bottom: K♠, top: 3♣
      stockCardIds: createStandardDeck().map(c => c.id).filter(id =>
        !['c0', 'c1', 'c13', 'c26', 'c5', 'c6', 'c7', 'c8', 'c51', 'c2'].includes(id)
      ),
      phase: 'draw',
      currentPlayerIndex: 0,
    })

    const result = runRummyBotTurn(rummy, 'p1', rummyBotStrategy)
    expect(result.outcome.ok).toBe(true)

    const pub = result.rummy.session.publicState
    expect(pub.turn.phase).toBe('discard')
    // p1 should have drawn the top discard card (c2 = 3♣)
    const p1Hand = result.rummy.session.privateStates['p1'].hand.cards
    expect(p1Hand.map(c => c.id)).toContain('c2')
    expect(totalCards(result.rummy)).toBe(52)
  })

  it('draw phase: draws from stock when top discard is not useful', () => {
    // p1 hand: A♣(c0), 3♣(c2), 5♦(c17) — no pair to the top discard
    // Discard top: K♠(c51) — doesn't complete anything
    const rummy = buildSession({
      p1HandCardIds: ['c0', 'c2', 'c17'],
      p2HandCardIds: ['c5', 'c6', 'c7', 'c8'],
      discardCardIds: ['c50', 'c51'],  // bottom: Q♠, top: K♠
      stockCardIds: createStandardDeck().map(c => c.id).filter(id =>
        !['c0', 'c2', 'c17', 'c5', 'c6', 'c7', 'c8', 'c50', 'c51'].includes(id)
      ),
      phase: 'draw',
      currentPlayerIndex: 0,
    })

    const stockCountBefore = cardCount(rummy.stock)
    const result = runRummyBotTurn(rummy, 'p1', rummyBotStrategy)
    expect(result.outcome.ok).toBe(true)

    // Bot should have drawn from stock (hand went up by 1, stock down by 1)
    const p1Hand = result.rummy.session.privateStates['p1'].hand.cards
    expect(p1Hand.length).toBe(4) // 3 → 4
    expect(cardCount(result.rummy.stock)).toBe(stockCountBefore - 1)
    expect(totalCards(result.rummy)).toBe(52)
  })

  it('draw phase: draws from stock when discard pile is empty', () => {
    const rummy = buildSession({
      p1HandCardIds: ['c0', 'c1', 'c2'],
      p2HandCardIds: ['c5', 'c6', 'c7'],
      discardCardIds: [],  // empty discard
      stockCardIds: createStandardDeck().map(c => c.id).filter(id =>
        !['c0', 'c1', 'c2', 'c5', 'c6', 'c7'].includes(id)
      ),
      phase: 'draw',
      currentPlayerIndex: 0,
    })

    const result = runRummyBotTurn(rummy, 'p1', rummyBotStrategy)
    expect(result.outcome.ok).toBe(true)
    expect(result.rummy.session.publicState.turn.phase).toBe('discard')
    expect(totalCards(result.rummy)).toBe(52)
  })

  it('discard phase with obligation: lays meld including obligated card', () => {
    // p1 hand: A♣(c0), 2♣(c1), 3♣(c2), 4♦(c16), 5♦(c17)
    // obligated: 3♣(c2) — A♣,2♣,3♣ form a run
    const rummy = buildSession({
      p1HandCardIds: ['c0', 'c1', 'c2', 'c16', 'c17'],
      p2HandCardIds: ['c5', 'c6', 'c7', 'c8', 'c9'],
      discardCardIds: ['c51'],
      stockCardIds: createStandardDeck().map(c => c.id).filter(id =>
        !['c0', 'c1', 'c2', 'c16', 'c17', 'c5', 'c6', 'c7', 'c8', 'c9', 'c51'].includes(id)
      ),
      phase: 'discard',
      currentPlayerIndex: 0,
      obligatedCardId: 'c2',
    })

    const result = runRummyBotTurn(rummy, 'p1', rummyBotStrategy)
    expect(result.outcome.ok).toBe(true)

    // Obligation should be cleared
    expect(result.rummy.session.publicState.obligatedCardId).toBeNull()
    // A meld was laid
    expect(result.rummy.session.publicState.melds['p1'].length).toBe(1)
    const meldIds = result.rummy.session.publicState.melds['p1'][0].cards.map(c => c.id)
    expect(meldIds).toContain('c2') // the obligated card
    expect(totalCards(result.rummy)).toBe(52)
  })

  it('discard phase, no obligation, meld available: lays down meld', () => {
    // p1 hand: A♣(c0), 2♣(c1), 3♣(c2), K♠(c51), 7♦(c19)
    // A♣,2♣,3♣ form a run
    const rummy = buildSession({
      p1HandCardIds: ['c0', 'c1', 'c2', 'c51', 'c19'],
      p2HandCardIds: ['c5', 'c6', 'c7', 'c8', 'c9'],
      discardCardIds: ['c50'],
      stockCardIds: createStandardDeck().map(c => c.id).filter(id =>
        !['c0', 'c1', 'c2', 'c51', 'c19', 'c5', 'c6', 'c7', 'c8', 'c9', 'c50'].includes(id)
      ),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const initialMeldCount = rummy.session.publicState.melds['p1'].length
    const result = runRummyBotTurn(rummy, 'p1', rummyBotStrategy)
    expect(result.outcome.ok).toBe(true)

    // Meld was laid
    expect(result.rummy.session.publicState.melds['p1'].length).toBe(initialMeldCount + 1)
    const meldCards = result.rummy.session.publicState.melds['p1'][initialMeldCount].cards
    expect(classifyMeld(meldCards).valid).toBe(true)

    // Hand size decreased
    expect(cardCount(result.rummy.session.privateStates['p1'].hand)).toBe(2)
    expect(totalCards(result.rummy)).toBe(52)
  })

  it('discard phase, no obligation, no meld: discards least-useful isolated card', () => {
    // p1 hand: A♣(c0), 3♣(c2), 5♣(c4), K♠(c51)
    // - No meld (no consecutive 3, no matching ranks)
    // - Connectivity: A♣→[3♣:same suit dist 2 → score 1]
    //                  3♣→[A♣:same suit dist 2, 5♣:same suit dist 2 → score 2]
    //                  5♣→[3♣:same suit dist 2 → score 1]
    //                  K♠→[none → score 0]
    // K♠ is the most isolated → bot discards it
    const rummy = buildSession({
      p1HandCardIds: ['c0', 'c2', 'c4', 'c51'],
      p2HandCardIds: ['c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11'],
      discardCardIds: ['c50'],
      stockCardIds: createStandardDeck().map(c => c.id).filter(id =>
        !['c0', 'c2', 'c4', 'c51', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c50'].includes(id)
      ),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const result = runRummyBotTurn(rummy, 'p1', rummyBotStrategy)
    expect(result.outcome.ok).toBe(true)

    // Turn should have advanced to p2's draw
    const pub = result.rummy.session.publicState
    expect(pub.turn.phase).toBe('draw')
    expect(currentPlayer(pub.turn)).toBe('p2')

    // The discarded card should be K♠ (c51)
    const discardTop = pub.discardPile.cards[pub.discardPile.cards.length - 1]
    expect(discardTop.id).toBe('c51')

    // p1 hand lost K♠
    const p1HandIds = result.rummy.session.privateStates['p1'].hand.cards.map(c => c.id)
    expect(p1HandIds).not.toContain('c51')
    expect(p1HandIds.length).toBe(3)
    expect(totalCards(result.rummy)).toBe(52)
  })

  it('discard phase, no obligation, no meld: tiebreak by highest deadwood', () => {
    // p1 hand: A♣(c0, dw=15), 5♦(c17, dw=5), K♠(c51, dw=10)
    // All isolated from each other (different suits, different ranks, no rank matches).
    // Connectivity = 0 for all, bot should discard A♣ (highest deadwood: 15 > 10 > 5).
    const rummy = buildSession({
      p1HandCardIds: ['c0', 'c17', 'c51'],
      p2HandCardIds: ['c5', 'c6', 'c7', 'c8', 'c9'],
      discardCardIds: ['c50'],
      stockCardIds: createStandardDeck().map(c => c.id).filter(id =>
        !['c0', 'c17', 'c51', 'c5', 'c6', 'c7', 'c8', 'c9', 'c50'].includes(id)
      ),
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    const result = runRummyBotTurn(rummy, 'p1', rummyBotStrategy)
    expect(result.outcome.ok).toBe(true)

    const discardTop = result.rummy.session.publicState.discardPile.cards[
      result.rummy.session.publicState.discardPile.cards.length - 1
    ]
    // A♣ has deadwood 15 (highest among 15, 5, 10) → gets discarded
    expect(discardTop.id).toBe('c0')
    expect(totalCards(result.rummy)).toBe(52)
  })
})

// ── tests: rummyBotStrategy lay-off support ─────────────────

describe('rummyBotStrategy lay-off support', () => {
  it('lays a hand card off onto its own meld instead of discarding it', () => {
    // p1 has 5♣6♣7♣ (c4,c5,c6) down; hand holds 8♣ (c7) which extends the run.
    const p1MeldZone = addCards(createHand('p1'), cardsByIds('c4', 'c5', 'c6'))
    const rummy = buildSession({
      p1HandCardIds: ['c7', 'c51', 'c14'],
      p2HandCardIds: ['c8', 'c9', 'c10', 'c11'],
      discardCardIds: ['c50'],
      stockCardIds: [],
      phase: 'discard',
      currentPlayerIndex: 0,
      melds: { p1: [p1MeldZone], p2: [] },
    })

    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    expect(action).toEqual({ type: 'LAY_OFF', targetPlayerId: 'p1', meldIndex: 0, cardIds: ['c7'] })
  })

  it('lays a hand card off onto the opponent\'s meld', () => {
    // p1 has A♠2♠3♠ (c39,c40,c41) down (own-meld precondition), p2 has 5♣6♣7♣ (c4,c5,c6).
    // p1's hand holds 8♣ (c7) which extends p2's run but nothing of p1's own.
    const p1MeldZone = addCards(createHand('p1'), cardsByIds('c39', 'c40', 'c41'))
    const p2MeldZone = addCards(createHand('p2'), cardsByIds('c4', 'c5', 'c6'))
    const rummy = buildSession({
      p1HandCardIds: ['c7', 'c51', 'c14'],
      p2HandCardIds: ['c8', 'c9', 'c10', 'c11'],
      discardCardIds: ['c50'],
      stockCardIds: [],
      phase: 'discard',
      currentPlayerIndex: 0,
      melds: { p1: [p1MeldZone], p2: [p2MeldZone] },
    })

    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    expect(action).toEqual({ type: 'LAY_OFF', targetPlayerId: 'p2', meldIndex: 0, cardIds: ['c7'] })
  })

  it('never lays off without an own meld down — discards instead', () => {
    // p2 has 5♣6♣7♣ (c4,c5,c6); p1 holds 8♣ (c7) which would extend it, but p1 has no
    // meld of its own down, so LAY_OFF is illegal — the bot must discard, not lay off.
    const p2MeldZone = addCards(createHand('p2'), cardsByIds('c4', 'c5', 'c6'))
    const rummy = buildSession({
      p1HandCardIds: ['c7', 'c51', 'c14'],
      p2HandCardIds: ['c8', 'c9', 'c10', 'c11'],
      discardCardIds: ['c50'],
      stockCardIds: [],
      phase: 'discard',
      currentPlayerIndex: 0,
      melds: { p1: [], p2: [p2MeldZone] },
    })

    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    // All three hand cards are isolated; K♠ (deadwood 10) is the most expensive → discarded.
    expect(action).toEqual({ type: 'DISCARD_CARD', cardId: 'c51' })
  })

  it('validates extensions against the full group including prior lay-offs', () => {
    // p2's meld 5♣6♣7♣ (c4,c5,c6) was already extended by a laid-off 8♣ (c7).
    // p1 holds the 9♣ (c8): without the lay-off, 5-6-7 + 9 is not a run, so this
    // proves the bot checks fullMeldCards rather than the original meld zone.
    const p2MeldZone = addCards(createHand('p2'), cardsByIds('c4', 'c5', 'c6'))
    const rummy = buildSession({
      p1HandCardIds: ['c8', 'c51', 'c14'],
      p2HandCardIds: ['c9', 'c10', 'c11'],
      discardCardIds: ['c50'],
      stockCardIds: [],
      phase: 'discard',
      currentPlayerIndex: 0,
      melds: { p1: [addCards(createHand('p1'), cardsByIds('c39', 'c40', 'c41'))], p2: [p2MeldZone] },
      layoffs: [{ id: 'layoff-0', playerId: 'p1', targetPlayerId: 'p2', targetMeldIndex: 0, cards: cardsByIds('c7') }],
    })

    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    expect(action).toEqual({ type: 'LAY_OFF', targetPlayerId: 'p2', meldIndex: 0, cardIds: ['c8'] })
  })

  it('lays down a new meld before laying off — Case 3 keeps priority', () => {
    // p1 has 5♣6♣7♣ (c4,c5,c6) down and holds A♣2♣3♣ (c0,c1,c2) — a NEW meld — plus
    // 8♣ (c7) which would extend the existing run. The new meld must come first.
    const p1MeldZone = addCards(createHand('p1'), cardsByIds('c4', 'c5', 'c6'))
    const rummy = buildSession({
      p1HandCardIds: ['c0', 'c1', 'c2', 'c7', 'c51'],
      p2HandCardIds: ['c8', 'c9', 'c10', 'c11'],
      discardCardIds: ['c50'],
      stockCardIds: [],
      phase: 'discard',
      currentPlayerIndex: 0,
      melds: { p1: [p1MeldZone], p2: [] },
    })

    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    expect(action).toEqual({ type: 'LAY_DOWN_MELD', cardIds: ['c0', 'c1', 'c2'] })
  })
})

// ── tests: obligation lay-off fallback ───────────────────────

describe('rummyBotStrategy obligation lay-off fallback', () => {
  it('lays the obligated card off onto the opponent\'s meld when no from-hand meld exists', () => {
    // p1 owns A♠2♠3♠ (c39,c40,c41); p2 has 5♣6♣7♣ (c4,c5,c6).
    // p1 is obligated on 8♣ (c7): no 3-subset of 8♣/K♠/2♦ melds, but 8♣ extends p2's run.
    const p1MeldZone = addCards(createHand('p1'), cardsByIds('c39', 'c40', 'c41'))
    const p2MeldZone = addCards(createHand('p2'), cardsByIds('c4', 'c5', 'c6'))
    const rummy = buildSession({
      p1HandCardIds: ['c7', 'c51', 'c14'],
      p2HandCardIds: ['c8', 'c9', 'c10', 'c11'],
      discardCardIds: ['c50'],
      stockCardIds: [],
      phase: 'discard',
      currentPlayerIndex: 0,
      obligatedCardId: 'c7',
      melds: { p1: [p1MeldZone], p2: [p2MeldZone] },
    })

    expect(findMeld(rummy.session.privateStates['p1'].hand.cards, 'c7')).toBeNull()

    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    // The single obligated card only — laid off, not discarded.
    expect(action).toEqual({ type: 'LAY_OFF', targetPlayerId: 'p2', meldIndex: 0, cardIds: ['c7'] })
  })

  it('lays the obligated card off onto its own meld', () => {
    // Same hand/obligation as above, but p1's own meld is 5♣6♣7♣ (c4,c5,c6) and p2 has none.
    const p1MeldZone = addCards(createHand('p1'), cardsByIds('c4', 'c5', 'c6'))
    const rummy = buildSession({
      p1HandCardIds: ['c7', 'c51', 'c14'],
      p2HandCardIds: ['c8', 'c9', 'c10', 'c11'],
      discardCardIds: ['c50'],
      stockCardIds: [],
      phase: 'discard',
      currentPlayerIndex: 0,
      obligatedCardId: 'c7',
      melds: { p1: [p1MeldZone], p2: [] },
    })

    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    expect(action).toEqual({ type: 'LAY_OFF', targetPlayerId: 'p1', meldIndex: 0, cardIds: ['c7'] })
  })

  it('never lays off the obligated card without an own meld down — falls through instead', () => {
    // p2 has 5♣6♣7♣ (c4,c5,c6); 8♣ (c7) would extend it but p1 has no meld of its own,
    // so LAY_OFF is illegal — the fallback must not return it (it falls through to discard).
    const p2MeldZone = addCards(createHand('p2'), cardsByIds('c4', 'c5', 'c6'))
    const rummy = buildSession({
      p1HandCardIds: ['c7', 'c51', 'c14'],
      p2HandCardIds: ['c8', 'c9', 'c10', 'c11'],
      discardCardIds: ['c50'],
      stockCardIds: [],
      phase: 'discard',
      currentPlayerIndex: 0,
      obligatedCardId: 'c7',
      melds: { p1: [], p2: [p2MeldZone] },
    })

    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    expect(action.type).not.toBe('LAY_OFF')
    // No hand meld either, so it falls through to the discard (K♠, highest deadwood).
    expect(action).toEqual({ type: 'DISCARD_CARD', cardId: 'c51' })
  })

  it('still prefers the from-hand meld over the lay-off fallback', () => {
    // p1 owns 5♣6♣7♣ (c4,c5,c6) and holds A♣2♣3♣ (c0,c1,c2) plus 8♣ (c7) which could lay
    // off — but the obligated card c2 melds from hand, so LAY_DOWN_MELD must win.
    const p1MeldZone = addCards(createHand('p1'), cardsByIds('c4', 'c5', 'c6'))
    const rummy = buildSession({
      p1HandCardIds: ['c0', 'c1', 'c2', 'c7', 'c51'],
      p2HandCardIds: ['c8', 'c9', 'c10', 'c11'],
      discardCardIds: ['c50'],
      stockCardIds: [],
      phase: 'discard',
      currentPlayerIndex: 0,
      obligatedCardId: 'c2',
      melds: { p1: [p1MeldZone], p2: [] },
    })

    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    expect(action.type).toBe('LAY_DOWN_MELD')
    if (action.type === 'LAY_DOWN_MELD') {
      expect(action.cardIds).toContain('c2')
    }
  })

  it('validates the obligation lay-off against the full group including prior lay-offs', () => {
    // p2's meld 5♣6♣7♣ (c4,c5,c6) was already extended by a laid-off 8♣ (c7). p1 is
    // obligated on 9♣ (c8): against the original zone 5-6-7 + 9 is no run, but against
    // the full group 5-6-7-8 + 9 it is — proving fullMeldCards drives this path too.
    const p2MeldZone = addCards(createHand('p2'), cardsByIds('c4', 'c5', 'c6'))
    const rummy = buildSession({
      p1HandCardIds: ['c8', 'c51', 'c14'],
      p2HandCardIds: ['c9', 'c10', 'c11'],
      discardCardIds: ['c50'],
      stockCardIds: [],
      phase: 'discard',
      currentPlayerIndex: 0,
      obligatedCardId: 'c8',
      melds: { p1: [addCards(createHand('p1'), cardsByIds('c39', 'c40', 'c41'))], p2: [p2MeldZone] },
      layoffs: [{ id: 'layoff-0', playerId: 'p1', targetPlayerId: 'p2', targetMeldIndex: 0, cards: cardsByIds('c7') }],
    })

    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    expect(action).toEqual({ type: 'LAY_OFF', targetPlayerId: 'p2', meldIndex: 0, cardIds: ['c8'] })
  })
})

// ── tests: full turn & multi-round ───────────────────────────

describe('bot turn composition', () => {
  it('full simulated turn via runRummyBotTurn in a loop', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    const startPlayer = currentPlayer(rummy.session.publicState.turn)

    let r = rummy
    let turnEnded = false
    const maxCalls = 20
    let callCount = 0

    while (callCount < maxCalls && !turnEnded) {
      const result = runRummyBotTurn(r, startPlayer, rummyBotStrategy)
      callCount++
      expect(result.outcome.ok).toBe(true)
      r = result.rummy
      const pub = r.session.publicState
      if (pub.roundOver) {
        turnEnded = true
      } else if (pub.turn.phase === 'draw' && currentPlayer(pub.turn) !== startPlayer) {
        turnEnded = true
      }
    }

    expect(turnEnded).toBe(true)
    expect(callCount).toBeLessThan(maxCalls)
    expect(totalCards(r)).toBe(52)
  })

  it('bot-vs-bot several full rounds', () => {
    const rummy = createRummyGame(['p1', 'p2'], 123)
    let r = rummy
    let totalActionCalls = 0
    const maxTotalActions = 200

    while (
      totalActionCalls < maxTotalActions &&
      !r.session.publicState.matchWinnerId
    ) {
      const pub = r.session.publicState

      // If round is over and match not decided, start next round
      if (pub.roundOver && !pub.matchWinnerId) {
        const startResult = applyRummyAction(r, 'p1', { type: 'START_NEXT_ROUND' })
        // If start fails, the test should fail loudly
        expect(startResult.outcome.ok).toBe(true)
        r = startResult.rummy
        continue
      }

      const player = currentPlayer(pub.turn)
      let playerTurnEnded = false
      const maxTurnCalls = 20
      let turnCalls = 0

      while (turnCalls < maxTurnCalls && !playerTurnEnded) {
        const result = runRummyBotTurn(r, player, rummyBotStrategy)
        totalActionCalls++
        turnCalls++
        expect(result.outcome.ok).toBe(true)
        r = result.rummy

        const nextPub = r.session.publicState
        if (nextPub.roundOver) {
          playerTurnEnded = true
        } else if (nextPub.turn.phase === 'draw' && currentPlayer(nextPub.turn) !== player) {
          playerTurnEnded = true
        }
      }

      expect(playerTurnEnded).toBe(true)
      expect(turnCalls).toBeLessThan(maxTurnCalls)
    }

    expect(totalActionCalls).toBeGreaterThanOrEqual(30)
    expect(totalCards(r)).toBe(52)
  })
})

// ── tests: regression coverage for the M1 review fixes ──────

describe('bot review-fix regressions', () => {
  it('livelock fix: stock empty, discard has 1 unmeldable card — draws from discard, not stock', () => {
    // p1 hand: A♣,3♣,5♣ — none of these combine with K♠ into a meld.
    const p1Cards = ['c0', 'c2', 'c4']
    const discardCards = ['c51'] // K♠
    const used = new Set([...p1Cards, ...discardCards])
    const p2Cards = createStandardDeck().map((c) => c.id).filter((id) => !used.has(id))

    const rummy = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: discardCards,
      stockCardIds: [], // stock empty
      phase: 'draw',
      currentPlayerIndex: 0,
    })

    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    expect(action).toEqual({ type: 'DRAW_FROM_DISCARD', index: 0 })

    // And the real validator actually accepts it (not just the strategy's shape).
    const result = runRummyBotTurn(rummy, 'p1', rummyBotStrategy)
    expect(result.outcome.ok).toBe(true)
    expect(totalCards(result.rummy)).toBe(52)
  })

  it('stalemate fix: stock empty, discard has 2+ unmeldable cards — recycles via DRAW_FROM_STOCK instead of looping the same discard card forever', () => {
    // p1 hand: A♣,3♣,5♣ — none of these combine with K♠ (top discard) into a meld.
    const p1Cards = ['c0', 'c2', 'c4']
    const discardCards = ['c51', 'c50'] // K♠, K♥ — 2 cards, top (K♠) unmeldable
    const used = new Set([...p1Cards, ...discardCards])
    const p2Cards = createStandardDeck().map((c) => c.id).filter((id) => !used.has(id))

    const rummy = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: discardCards,
      stockCardIds: [], // stock empty
      phase: 'draw',
      currentPlayerIndex: 0,
    })

    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    // With 2+ cards in discard, DRAW_FROM_STOCK is legal even at stockCount 0 —
    // it recycles the discard pile (keeping its top card) into a fresh stock
    // and draws from that. Forcing DRAW_FROM_DISCARD here instead is exactly
    // the bug that let bots (and, in the UI, human players) get stuck endlessly
    // taking and re-discarding the same unwanted top card once stock ran dry.
    expect(action).toEqual({ type: 'DRAW_FROM_STOCK' })

    // And the real validator actually accepts it and performs the recycle.
    const result = runRummyBotTurn(rummy, 'p1', rummyBotStrategy)
    expect(result.outcome.ok).toBe(true)
    expect(totalCards(result.rummy)).toBe(52)
    // The recycle keeps exactly 1 card on the discard pile (the old top card).
    expect(result.rummy.session.publicState.discardPile.cards.length).toBe(1)
  })

  it('crash fix: roundOver with an empty hand does not throw, starts next round', () => {
    const p2Cards = createStandardDeck().map((c) => c.id).filter((id) => id !== undefined).slice(0, 10)
    const rummy = buildSession({
      p1HandCardIds: [],
      p2HandCardIds: p2Cards,
      discardCardIds: [],
      stockCardIds: createStandardDeck().map((c) => c.id).filter(
        (id) => !p2Cards.includes(id),
      ),
      phase: 'discard',
      currentPlayerIndex: 0,
      roundOver: true,
      roundWinnerId: 'p1',
    })

    let action: ReturnType<typeof rummyBotStrategy> | undefined
    expect(() => {
      action = rummyBotStrategy(
        rummy.session.publicState,
        rummy.session.privateStates['p1'],
        'p1',
      )
    }).not.toThrow()
    expect(action).toEqual({ type: 'START_NEXT_ROUND' })
  })

  it('crash fix does not affect normal mid-round behavior', () => {
    const rummy = createRummyGame(['p1', 'p2'], 42)
    expect(rummy.session.publicState.roundOver).toBe(false)
    const action = rummyBotStrategy(
      rummy.session.publicState,
      rummy.session.privateStates['p1'],
      'p1',
    )
    expect(action.type).not.toBe('START_NEXT_ROUND')
  })

  it('greedy-meld fix: melds all 6 cards instead of stranding 2', () => {
    // A♣,2♣,3♣,4♣,A♦,A♥ — optimal play is 2♣3♣4♣ (run) + A♣A♦A♥ (set), all 6 melded.
    // The old greedy-largest strategy laid the 4-card run first and stranded A♦,A♥.
    const p1Cards = ['c0', 'c1', 'c2', 'c3', 'c13', 'c26']
    const discardCards = ['c51']
    const used = new Set([...p1Cards, ...discardCards])
    const p2Cards = createStandardDeck().map((c) => c.id).filter((id) => !used.has(id))

    const rummy = buildSession({
      p1HandCardIds: p1Cards,
      p2HandCardIds: p2Cards,
      discardCardIds: discardCards,
      stockCardIds: [],
      phase: 'discard',
      currentPlayerIndex: 0,
    })

    let r = rummy
    for (let i = 0; i < 10 && currentPlayer(r.session.publicState.turn) === 'p1'; i++) {
      const result = runRummyBotTurn(r, 'p1', rummyBotStrategy)
      expect(result.outcome.ok).toBe(true)
      r = result.rummy
    }

    // All 6 cards melded — hand empty. Going out needs a discard, so the round
    // continues and the turn passes to p2.
    expect(cardCount(r.session.privateStates['p1'].hand)).toBe(0)
    expect(r.session.publicState.roundOver).toBe(false)
    expect(currentPlayer(r.session.publicState.turn)).toBe('p2')
    expect(totalCards(r)).toBe(52)
  })
})
