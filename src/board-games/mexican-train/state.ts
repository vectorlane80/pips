import type { HostSession } from '../../engine/sync.ts'
import { createHostSession } from '../../engine/sync.ts'
import type { TurnState } from '../../engine/turn-engine.ts'
import { createTurnState } from '../../engine/turn-engine.ts'
import { createRng } from '../../engine/rng.ts'
import type { Zone } from '../../card-engine/zones.ts'
import { addCards, cardCount, createHand, createPublicZone } from '../../card-engine/zones.ts'
import { dealCards, shuffleDeck } from '../../card-engine/deck.ts'

// Round r (0-based) plays on engine value 12 - r.
export const MT_ENGINE_SEQ = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]

export type MTStage = 'play' | 'roundEnd' | 'over'
export type MTLaneKey = 'p0' | 'p1' | 'p2' | 'p3' | 'mex'
export interface MTTile {
  id: string   // `${a}-${b}`, a <= b
  a: number
  b: number
}
export interface MTPlacedTile {
  inner: number
  outer: number
  isDouble: boolean
}

export interface MTRoundResult {
  kind: 'out' | 'blocked'
  outPlayerId: string | null            // null when blocked
  pips: Record<string, number>          // what each player added this round
}

export interface LastMTAction {
  by: string
  kind: 'play' | 'draw' | 'pass-open'
  tile: { a: number; b: number } | null // set for 'play' ONLY — never name a drawn tile
  lane: MTLaneKey | null
  double: boolean
  opened: MTLaneKey | null              // seat lane that got marked open by this action, else null
}

export interface MTPublicState {
  stage: MTStage
  turn: TurnState<'play'>
  seatOrder: [string, string, string, string]   // index = seat; lane 'p<i>' belongs to seatOrder[i]
  round: number                          // 0-based, 0..12
  engine: number                         // MT_ENGINE_SEQ[round]
  trains: Record<MTLaneKey, MTPlacedTile[]>
  open: Record<'p0' | 'p1' | 'p2' | 'p3', boolean>
  boneyardCount: number
  handCounts: Record<string, number>
  doublePending: boolean                 // current player owes an extra play
  passStreak: number                     // consecutive pass-opens; 4 ends the round blocked
  scores: Record<string, number>         // running pips, lower wins
  roundResult: MTRoundResult | null
  matchWinnerId: string | null
  lastAction: LastMTAction | null
}

export interface MTPrivateState {
  hand: Zone<MTTile>
}

export type MTAction =
  | { type: 'PLAY_TILE'; tileId: string; lane: MTLaneKey }
  | { type: 'DRAW_TILE' }
  | { type: 'PASS' }
  | { type: 'START_NEXT_ROUND' }

export interface MTSession {
  session: HostSession<MTPublicState, MTPrivateState>
  boneyard: Zone<MTTile>   // host-only, outside HostSession — rummy-stock pattern
  rng: () => number        // one seeded generator for every shuffle across the match
}

export function createMexicanTrainSet(): MTTile[] {
  const tiles: MTTile[] = []
  for (let a = 0; a <= 12; a++) {
    for (let b = a; b <= 12; b++) {
      tiles.push({ id: `${a}-${b}`, a, b })
    }
  }
  return tiles
}

export interface MTDeal {
  hands: Record<string, Zone<MTTile>>
  boneyard: Zone<MTTile>
  engine: number
}

// Shared deal logic used both for the first round and every subsequent round (via START_NEXT_ROUND).
// The engine double is pulled out of the full set FIRST (never dealt), the remaining 90 are
// shuffled, 13 go to each of the 4 seats, and the last 38 form the boneyard.
export function dealMTRound(
  playerIds: [string, string, string, string],
  round: number,
  rng: () => number,
): MTDeal {
  const engine = MT_ENGINE_SEQ[round]
  const engineTile = createMexicanTrainSet().find((t) => t.a === engine && t.b === engine)!
  const shuffled = shuffleDeck(createMexicanTrainSet().filter((t) => t.id !== engineTile.id), rng)
  let remaining = shuffled
  const hands: Record<string, Zone<MTTile>> = {}
  for (const playerId of playerIds) {
    const { dealt, remaining: rest } = dealCards(remaining, 13)
    hands[playerId] = addCards(createHand<MTTile>(playerId), dealt)
    remaining = rest
  }
  const boneyard = addCards(createPublicZone<MTTile>('boneyard', 'private'), remaining)
  return { hands, boneyard, engine }
}

export function createMexicanTrainGame(
  playerIds: [string, string, string, string],
  seed: number,
): MTSession {
  const rng = createRng(seed)
  const { hands, boneyard, engine } = dealMTRound(playerIds, 0, rng)
  const turn = createTurnState<'play'>(playerIds, 'play')   // round 0 starter is seat 0
  const handCounts: Record<string, number> = {}
  const scores: Record<string, number> = {}
  const privateStates: Record<string, MTPrivateState> = {}
  for (const playerId of playerIds) {
    handCounts[playerId] = cardCount(hands[playerId])
    scores[playerId] = 0
    privateStates[playerId] = { hand: hands[playerId] }
  }
  const publicState: MTPublicState = {
    stage: 'play',
    turn,
    seatOrder: playerIds,
    round: 0,
    engine,
    trains: { p0: [], p1: [], p2: [], p3: [], mex: [] },
    open: { p0: false, p1: false, p2: false, p3: false },
    boneyardCount: cardCount(boneyard),
    handCounts,
    doublePending: false,
    passStreak: 0,
    scores,
    roundResult: null,
    matchWinnerId: null,
    lastAction: null,
  }
  return { session: createHostSession(publicState, privateStates), boneyard, rng }
}

// The pip a new tile must match on that lane: the last placed tile's outer, or the engine
// value when the lane is empty.
export function laneEnd(publicState: MTPublicState, lane: MTLaneKey): number {
  const train = publicState.trains[lane]
  if (train.length > 0) return train[train.length - 1].outer
  return publicState.engine
}

// Candidate lanes are 'mex', the player's own 'p<seat>', and any other seat lane whose open
// flag is true; keep those whose end value matches tile.a or tile.b.
export function legalLanes(tile: MTTile, seat: number, publicState: MTPublicState): MTLaneKey[] {
  const ownLane = ('p' + seat) as MTLaneKey
  const candidates: MTLaneKey[] = ['mex', ownLane]
  for (let i = 0; i < 4; i++) {
    if (i !== seat && publicState.open[('p' + i) as 'p0' | 'p1' | 'p2' | 'p3']) {
      candidates.push(('p' + i) as MTLaneKey)
    }
  }
  return candidates.filter((lane) => {
    const end = laneEnd(publicState, lane)
    return tile.a === end || tile.b === end
  })
}

export function handHasLegalPlay(hand: MTTile[], seat: number, publicState: MTPublicState): boolean {
  return hand.some((tile) => legalLanes(tile, seat, publicState).length > 0)
}
