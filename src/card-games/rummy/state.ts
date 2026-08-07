import type { Zone } from '../../card-engine/zones.ts'
import type { TurnState } from '../../card-engine/turn-engine.ts'
import type { HostSession } from '../../card-engine/sync.ts'
import { createStandardDeck, shuffleDeck, dealCards } from '../../card-engine/deck.ts'
import { createRng } from '../../card-engine/rng.ts'
import { createHand, createDiscardPile, createPublicZone, addCards, cardCount } from '../../card-engine/zones.ts'
import { createTurnState } from '../../card-engine/turn-engine.ts'
import { createHostSession } from '../../card-engine/sync.ts'

export type RummyPhase = 'draw' | 'discard'

export interface RummyPublicState {
  turn: TurnState<RummyPhase>
  discardPile: Zone
  stockCount: number
  melds: Record<string, Zone[]>          // playerId -> array of meld zones laid down so far this round
  obligatedCardId: string | null          // if set, the current acting player must include this card id in a
                                            // LAY_DOWN_MELD before they may DISCARD_CARD this turn
  scores: Record<string, number>          // match score per player, accumulates across rounds
  target: number                           // match target score
  roundNumber: number
  roundOver: boolean
  roundWinnerId: string | null             // player who went out this round, or null if the round ended blocked
  matchWinnerId: string | null
}

export interface RummyPrivateState {
  hand: Zone
}

export type RummyAction =
  | { type: 'DRAW_FROM_STOCK' }
  | { type: 'DRAW_FROM_DISCARD'; index: number }   // index into discardPile.cards (0 = bottom/oldest); taking
                                                      // index i takes cards[i..last] (i.e. that card and everything
                                                      // above/newer than it, matching Zone's documented convention
                                                      // that the last array index is the "top")
  | { type: 'LAY_DOWN_MELD'; cardIds: string[] }
  | { type: 'DISCARD_CARD'; cardId: string }
  | { type: 'START_NEXT_ROUND' }

export interface RummySession {
  session: HostSession<RummyPublicState, RummyPrivateState>
  stock: Zone       // host-only, never part of HostSession — see the prior milestone's docs/card-engine.md
                      // for why (a zone that must be visible to nobody has no slot in the generic model)
  rng: () => number  // host-only, the SAME stateful generator used for the initial shuffle and every later
                       // stock-recycle shuffle and round redeal — one seed drives the whole match
}

const TARGET_SCORE = 100

// Shared deal logic used both for the very first round and every subsequent round (via START_NEXT_ROUND).
function dealRound(
  playerIds: [string, string],
  rng: () => number,
): { p0Hand: Zone; p1Hand: Zone; stock: Zone; discardPile: Zone } {
  const deck = createStandardDeck()
  const shuffled = shuffleDeck(deck, rng)
  const { dealt: p0Dealt, remaining: afterP0 } = dealCards(shuffled, 10)
  const { dealt: p1Dealt, remaining: afterP1 } = dealCards(afterP0, 10)
  const { dealt: discardStart, remaining: stockCards } = dealCards(afterP1, 1)
  const p0Hand = addCards(createHand(playerIds[0]), p0Dealt)
  const p1Hand = addCards(createHand(playerIds[1]), p1Dealt)
  const stock = addCards(createPublicZone('stock', 'private'), stockCards)
  const discardPile = addCards(createDiscardPile(), discardStart)
  return { p0Hand, p1Hand, stock, discardPile }
}

export function createRummyGame(playerIds: [string, string], seed: number): RummySession {
  const rng = createRng(seed)
  const { p0Hand, p1Hand, stock, discardPile } = dealRound(playerIds, rng)
  const turn = createTurnState<RummyPhase>(playerIds, 'draw')

  const publicState: RummyPublicState = {
    turn,
    discardPile,
    stockCount: cardCount(stock),
    melds: { [playerIds[0]]: [], [playerIds[1]]: [] },
    obligatedCardId: null,
    scores: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
    target: TARGET_SCORE,
    roundNumber: 1,
    roundOver: false,
    roundWinnerId: null,
    matchWinnerId: null,
  }

  const privateStates: Record<string, RummyPrivateState> = {
    [playerIds[0]]: { hand: p0Hand },
    [playerIds[1]]: { hand: p1Hand },
  }

  return { session: createHostSession(publicState, privateStates), stock, rng }
}

// Exported so rules.ts's START_NEXT_ROUND handler can reuse the exact same deal logic.
export { dealRound }
