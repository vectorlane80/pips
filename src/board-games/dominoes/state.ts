import type { HostSession } from '../../engine/sync.ts'
import { createHostSession } from '../../engine/sync.ts'
import type { TurnState } from '../../engine/turn-engine.ts'
import { createTurnState } from '../../engine/turn-engine.ts'
import { createRng } from '../../engine/rng.ts'
import type { Zone } from '../../card-engine/zones.ts'
import { addCards, cardCount, createHand, createPublicZone } from '../../card-engine/zones.ts'
import { dealCards, shuffleDeck } from '../../card-engine/deck.ts'

export interface DominoTile {
  id: string   // `${a}-${b}`, a <= b
  a: number
  b: number
}

export function createDominoSet(): DominoTile[] {
  const tiles: DominoTile[] = []
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      tiles.push({ id: `${a}-${b}`, a, b })
    }
  }
  return tiles
}

export type DominoArm = 'right' | 'left' | 'up' | 'down'

export interface PlacedTile {
  inner: number
  outer: number
  isDouble: boolean
}

export type DominoesStage = 'play' | 'roundEnd' | 'over'

export interface DominoesRoundResult {
  kind: 'out' | 'blocked'
  scorerId: string | null      // null = blocked tie, nobody scores
  points: number               // already rounded down to nearest 5
}

export interface LastDominoAction {
  by: string
  kind: 'lead' | 'play' | 'draw' | 'pass'
  tile: { a: number; b: number } | null   // set for lead/play ONLY — a draw must never name the tile
  arm: DominoArm | 'center' | null
  scored: number               // All-Fives points from this play, 0 otherwise
}

export interface DominoesPublicState {
  stage: DominoesStage
  turn: TurnState<'play'>
  center: { a: number; b: number } | null
  isSpinner: boolean
  arms: Record<DominoArm, PlacedTile[]>
  boneyardCount: number
  handCounts: Record<string, number>
  passStreak: number
  scores: Record<string, number>          // match score, accumulates across rounds
  target: number                          // 150
  roundNumber: number
  roundStarterId: string                  // who led this round
  roundResult: DominoesRoundResult | null // set while stage is roundEnd/over
  lastAction: LastDominoAction | null
  matchWinnerId: string | null
}

export interface DominoesPrivateState {
  hand: Zone<DominoTile>
}

export type DominoesAction =
  | { type: 'PLAY_TILE'; tileId: string; arm: DominoArm | 'center' }
  | { type: 'DRAW_TILE' }
  | { type: 'PASS' }
  | { type: 'START_NEXT_ROUND' }

export interface DominoesSession {
  session: HostSession<DominoesPublicState, DominoesPrivateState>
  boneyard: Zone<DominoTile>   // host-only, outside HostSession — rummy-stock pattern
  rng: () => number            // one seeded generator for every shuffle across the match
}

const TARGET_SCORE = 150

// Shared deal logic used both for the very first round and every subsequent round (via START_NEXT_ROUND).
export function dealRound(
  playerIds: [string, string],
  rng: () => number,
): { p0Hand: Zone<DominoTile>; p1Hand: Zone<DominoTile>; boneyard: Zone<DominoTile> } {
  const shuffled = shuffleDeck(createDominoSet(), rng)
  const { dealt: p0Dealt, remaining: afterP0 } = dealCards(shuffled, 7)
  const { dealt: p1Dealt, remaining: afterP1 } = dealCards(afterP0, 7)
  const p0Hand = addCards(createHand<DominoTile>(playerIds[0]), p0Dealt)
  const p1Hand = addCards(createHand<DominoTile>(playerIds[1]), p1Dealt)
  const boneyard = addCards(createPublicZone<DominoTile>('boneyard', 'private'), afterP1)
  return { p0Hand, p1Hand, boneyard }
}

export function createDominoesGame(playerIds: [string, string], seed: number): DominoesSession {
  const rng = createRng(seed)
  const { p0Hand, p1Hand, boneyard } = dealRound(playerIds, rng)
  const turn = createTurnState<'play'>(playerIds, 'play')

  const publicState: DominoesPublicState = {
    stage: 'play',
    turn,
    center: null,
    isSpinner: false,
    arms: { right: [], left: [], up: [], down: [] },
    boneyardCount: cardCount(boneyard),
    handCounts: { [playerIds[0]]: cardCount(p0Hand), [playerIds[1]]: cardCount(p1Hand) },
    passStreak: 0,
    scores: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
    target: TARGET_SCORE,
    roundNumber: 1,
    roundStarterId: playerIds[0],
    roundResult: null,
    lastAction: null,
    matchWinnerId: null,
  }

  const privateStates: Record<string, DominoesPrivateState> = {
    [playerIds[0]]: { hand: p0Hand },
    [playerIds[1]]: { hand: p1Hand },
  }

  return { session: createHostSession(publicState, privateStates), boneyard, rng }
}

// The pip value a new tile must match on that arm: the last placed tile's outer; an empty arm
// exposes the center's half (a for left, b for right — a spinner exposes a on all four arms).
// Up/down are not legal arms for a non-spinner. Null when there is no center.
export function endValue(
  center: { a: number; b: number } | null,
  isSpinner: boolean,
  arms: Record<DominoArm, PlacedTile[]>,
  arm: DominoArm,
): number | null {
  if (center === null) return null
  const placed = arms[arm]
  if (placed.length > 0) return placed[placed.length - 1].outer
  if (isSpinner) return center.a
  if (arm === 'left') return center.a
  if (arm === 'right') return center.b
  return null
}

// The arms this tile may legally be played on: center-only when the board is empty, else the
// open arms (4 if spinner, else right/left) whose end value matches tile.a or tile.b.
export function legalArms(tile: DominoTile, publicState: DominoesPublicState): (DominoArm | 'center')[] {
  if (publicState.center === null) return ['center']
  const openArms: DominoArm[] = publicState.isSpinner
    ? ['right', 'left', 'up', 'down']
    : ['right', 'left']
  const result: (DominoArm | 'center')[] = []
  for (const arm of openArms) {
    const value = endValue(publicState.center, publicState.isSpinner, publicState.arms, arm)
    if (value === tile.a || value === tile.b) result.push(arm)
  }
  return result
}

export function handHasLegalPlay(hand: DominoTile[], publicState: DominoesPublicState): boolean {
  return hand.some((tile) => legalArms(tile, publicState).length > 0)
}
