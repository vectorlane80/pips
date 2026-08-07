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
}

export interface RummyPrivateState {
  hand: Zone
}

export type RummyAction =
  | { type: 'DRAW_FROM_STOCK' }
  | { type: 'DRAW_FROM_DISCARD' }
  | { type: 'DISCARD_CARD'; cardId: string }

export interface RummySession {
  session: HostSession<RummyPublicState, RummyPrivateState>
  stock: Zone
}

export function createRummyGame(playerIds: [string, string], seed: number): RummySession {
  const deck = createStandardDeck()
  const shuffled = shuffleDeck(deck, createRng(seed))

  const { dealt: p0Dealt, remaining: afterP0 } = dealCards(shuffled, 7)
  const { dealt: p1Dealt, remaining: stockCards } = dealCards(afterP0, 7)

  const p0Hand = addCards(createHand(playerIds[0]), p0Dealt)
  const p1Hand = addCards(createHand(playerIds[1]), p1Dealt)
  const stockZone = addCards(createPublicZone('stock', 'private'), stockCards)
  const discardZone = createDiscardPile()

  const turn = createTurnState(playerIds, 'draw')

  const publicState: RummyPublicState = {
    turn,
    discardPile: discardZone,
    stockCount: cardCount(stockZone),
  }

  const privateStates: Record<string, RummyPrivateState> = {
    [playerIds[0]]: { hand: p0Hand },
    [playerIds[1]]: { hand: p1Hand },
  }

  return {
    session: createHostSession(publicState, privateStates),
    stock: stockZone,
  }
}
