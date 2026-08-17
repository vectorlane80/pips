import type { Card } from '../../card-engine/cards.ts'
import type { Zone } from '../../card-engine/zones.ts'
import type { TurnState } from '../../engine/turn-engine.ts'
import type { HostSession } from '../../engine/sync.ts'
import { shuffleDeck, dealCards } from '../../card-engine/deck.ts'
import { createSkipBoDeck } from './deck.ts'
import { createRng } from '../../engine/rng.ts'
import { createHand, createPlayerZone, createPublicZone, addCards, cardCount, topCard } from '../../card-engine/zones.ts'
import { createTurnState } from '../../engine/turn-engine.ts'
import { createHostSession } from '../../engine/sync.ts'

export const SKIPBO_MIN_SEATS = 2
export const SKIPBO_MAX_SEATS = 4

export type SkipBoTurnPhase = 'play' // single-phase turn — the whole turn is one continuous play
                                     // phase: there is no draw action (the draw-to-5 is folded
                                     // into the turn advance of DISCARD/PASS, see rules.ts)

export interface SkipBoBuildPile {
  cards: Card[]       // the actual stacked cards, top of array = top of pile (visually, its face)
  nextNeeded: number  // 1-12, the rank this pile currently needs (wild always satisfies it)
}

export interface SkipBoPublicState {
  turn: TurnState<SkipBoTurnPhase>
  seatOrder: string[]                      // fixed for the whole game, never reordered
  stockCounts: Record<string, number>      // public — every seat's remaining stockpile size
  handCounts: Record<string, number>       // public — every seat's current hand size (starts 5)
  discardTops: Record<string, (Card | null)[]>  // public — top card of each of a seat's 4 discard piles (null if empty), length always 4
  buildPiles: SkipBoBuildPile[]            // length 4, shared
  drawCount: number                        // public — size of the shared draw pile
  usedCount: number                        // public — size of the reshuffle pool
  roundOver: boolean
  winnerId: string | null                  // set the instant a stockpile hits 0, possibly mid-turn
}

export interface SkipBoPrivateState {
  stock: Zone   // this seat's own stockpile — only its OWN top card identity matters to the owner;
                // the whole zone goes privately like Rummy's hand (a player can see their own
                // stock's top card, drawn only when played — they only ever act on
                // cards.length-1 anyway)
  hand: Zone
  discards: Zone[]  // length 4, each a private-owned-but-effectively-public-per-top zone —
                    // kept in PRIVATE state too (mirrors stock); PublicState.discardTops carries
                    // only what other seats are allowed to see
}

export type SkipBoAction =
  | { type: 'PLAY_STOCK' }
  | { type: 'PLAY_HAND'; cardId: string }
  | { type: 'PLAY_DISCARD'; pileIndex: number }   // 0-3, one of the acting player's OWN 4 discard piles
  | { type: 'DISCARD'; cardId: string }           // ends the turn; engine auto-picks the emptiest of the player's 4 discard piles (ties -> lowest index)
  | { type: 'PASS' }                              // only legal when hand.cards.length === 0

export interface SkipBoSession {
  session: HostSession<SkipBoPublicState, SkipBoPrivateState>
  drawPile: Zone   // host-only, never part of HostSession — the shared face-down draw pile. Its
                   // card identity is never revealed to any single seat (only drawCount is
                   // public), so it lives outside the generic model exactly like Rummy's `stock`
                   // full zone does
  usedPile: Zone   // host-only — the reshuffle pool of cards cleared off completed building
                   // piles; only usedCount is public, same reasoning as drawPile
  rng: () => number  // host-only, the SAME stateful generator used for the initial shuffle and
                     // every later used-pool recycle shuffle — one seed drives the whole game
}

export function createSkipBoGame(playerIds: string[], seed: number): SkipBoSession {
  const rng = createRng(seed)
  const shuffled = shuffleDeck(createSkipBoDeck(), rng)
  let remaining = shuffled
  const stockSize = playerIds.length === 2 ? 30 : 20

  const stocks: Record<string, Zone> = {}
  const hands: Record<string, Zone> = {}
  const discards: Record<string, Zone[]> = {}
  for (const playerId of playerIds) {
    stocks[playerId] = createPlayerZone(playerId, 'stock', 'private')
    hands[playerId] = createHand(playerId)
    discards[playerId] = Array.from({ length: 4 }, (_, i) => createPlayerZone(playerId, `discard-${i}`, 'private'))
  }

  // Stockpiles: a face-down block per seat, dealt in seatOrder order.
  for (const playerId of playerIds) {
    const { dealt, remaining: rest } = dealCards(remaining, stockSize)
    stocks[playerId] = addCards(stocks[playerId], dealt)
    remaining = rest
  }

  // Starting hands: round-robin 1 card at a time across seats, 5 rounds — same loop shape as
  // the siblings' dealRound (per-seat deal + addCards + carry `remaining`), just one card per
  // seat per pass.
  for (let round = 0; round < 5; round++) {
    for (const playerId of playerIds) {
      const { dealt, remaining: rest } = dealCards(remaining, 1)
      hands[playerId] = addCards(hands[playerId], dealt)
      remaining = rest
    }
  }

  // Everything left becomes the shared draw pile.
  const drawPile = addCards(createPublicZone('draw', 'private'), remaining)
  const usedPile = createPublicZone('used', 'public')

  const turn = createTurnState<SkipBoTurnPhase>(playerIds, 'play')

  const stockCounts: Record<string, number> = {}
  const handCounts: Record<string, number> = {}
  const discardTops: Record<string, (Card | null)[]> = {}
  const privateStates: Record<string, SkipBoPrivateState> = {}
  for (const playerId of playerIds) {
    stockCounts[playerId] = cardCount(stocks[playerId])
    handCounts[playerId] = cardCount(hands[playerId])
    discardTops[playerId] = discards[playerId].map((pile) => topCard(pile) ?? null)
    privateStates[playerId] = { stock: stocks[playerId], hand: hands[playerId], discards: discards[playerId] }
  }

  const publicState: SkipBoPublicState = {
    turn,
    seatOrder: playerIds,
    stockCounts,
    handCounts,
    discardTops,
    buildPiles: Array.from({ length: 4 }, () => ({ cards: [], nextNeeded: 1 })),
    drawCount: cardCount(drawPile),
    usedCount: 0,
    roundOver: false,
    winnerId: null,
  }

  return { session: createHostSession(publicState, privateStates), drawPile, usedPile, rng }
}
