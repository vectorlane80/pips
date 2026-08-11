import type { HostSession } from '../../engine/sync.ts'
import { createHostSession } from '../../engine/sync.ts'
import type { TurnState } from '../../engine/turn-engine.ts'
import { createTurnState } from '../../engine/turn-engine.ts'
import { createRng } from '../../engine/rng.ts'

export type CheckersStage = 'play' | 'gameEnd' | 'over'

export interface CheckerCell {
  seat: 0 | 1
  king: boolean
}

export interface LastCheckersMove {
  by: string
  from: number
  to: number
  captured: number | null // board index of the removed piece, null = simple move
  crowned: boolean
  chainContinues: boolean
}

export interface CheckersPublicState {
  stage: CheckersStage
  turn: TurnState<'play'>
  seatOrder: [string, string] // index = seat
  board: (CheckerCell | null)[] // length 64
  chainCell: number | null // mid-multi-jump lock: mover must jump again with this piece
  gamesWon: Record<string, number>
  target: number // 3 (best of five)
  gameNumber: number // 1-based
  starterSeat: 0 | 1 // who opened the current game
  gameWinnerId: string | null // set during 'gameEnd' (and final game of 'over')
  matchWinnerId: string | null // set only when stage === 'over'
  lastMove: LastCheckersMove | null
}

export type CheckersPrivateState = Record<string, never> // perfect information — nothing hidden

export type CheckersAction =
  | { type: 'MOVE'; from: number; to: number }
  | { type: 'NEXT_GAME' }

export interface CheckersSession {
  session: HostSession<CheckersPublicState, CheckersPrivateState>
  rng: () => number // for the bot's random picks
}

export const CHECKERS_TARGET = 3

const BOARD_SIZE = 8
const BOARD_CELLS = 64

// 8×8 flat array, row-major, row 0 at top. Playable squares are the dark ones,
// (row + col) % 2 === 1. Seat 0 sits at the bottom (rows 5–7, moves toward row 0),
// seat 1 at the top (rows 0–2, moves toward row 7). 12 pieces each.
export function createCheckersBoard(): (CheckerCell | null)[] {
  const board: (CheckerCell | null)[] = Array.from({ length: BOARD_CELLS }, () => null)
  for (let idx = 0; idx < BOARD_CELLS; idx++) {
    const row = Math.floor(idx / BOARD_SIZE)
    const col = idx % BOARD_SIZE
    if ((row + col) % 2 !== 1) continue
    if (row >= 5) board[idx] = { seat: 0, king: false }
    else if (row <= 2) board[idx] = { seat: 1, king: false }
  }
  return board
}

export function createCheckersGame(playerIds: [string, string], seed: number): CheckersSession {
  const rng = createRng(seed)
  const publicState: CheckersPublicState = {
    stage: 'play',
    turn: createTurnState(playerIds, 'play'),
    seatOrder: playerIds,
    board: createCheckersBoard(),
    chainCell: null,
    gamesWon: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
    target: CHECKERS_TARGET,
    gameNumber: 1,
    starterSeat: 0,
    gameWinnerId: null,
    matchWinnerId: null,
    lastMove: null,
  }
  const privateStates: Record<string, CheckersPrivateState> = {
    [playerIds[0]]: {},
    [playerIds[1]]: {},
  }
  return { session: createHostSession(publicState, privateStates), rng }
}

// [dRow, dCol] per direction. Kings get all four diagonals; seat 0 men move
// toward row 0, seat 1 men toward row 7.
export function dirsFor(seat: 0 | 1, king: boolean): [number, number][] {
  if (king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  return seat === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]
}

// One-square jumps: adjacent enemy piece with an empty landing two squares away,
// in a direction legal for the piece at idx (read from the board itself).
export function capturesFrom(board: (CheckerCell | null)[], idx: number): { to: number; capIdx: number }[] {
  const piece = board[idx]
  if (!piece) return []
  const row = Math.floor(idx / BOARD_SIZE)
  const col = idx % BOARD_SIZE
  const out: { to: number; capIdx: number }[] = []
  for (const [dRow, dCol] of dirsFor(piece.seat, piece.king)) {
    const midRow = row + dRow
    const midCol = col + dCol
    const landRow = row + 2 * dRow
    const landCol = col + 2 * dCol
    if (midRow < 0 || midRow >= BOARD_SIZE || midCol < 0 || midCol >= BOARD_SIZE) continue
    if (landRow < 0 || landRow >= BOARD_SIZE || landCol < 0 || landCol >= BOARD_SIZE) continue
    const mid = board[midRow * BOARD_SIZE + midCol]
    const landing = board[landRow * BOARD_SIZE + landCol]
    if (mid && mid.seat !== piece.seat && landing === null) {
      out.push({ to: landRow * BOARD_SIZE + landCol, capIdx: midRow * BOARD_SIZE + midCol })
    }
  }
  return out
}

// One-square moves into empty squares, in directions legal for the piece at idx.
export function movesFrom(board: (CheckerCell | null)[], idx: number): { to: number }[] {
  const piece = board[idx]
  if (!piece) return []
  const row = Math.floor(idx / BOARD_SIZE)
  const col = idx % BOARD_SIZE
  const out: { to: number }[] = []
  for (const [dRow, dCol] of dirsFor(piece.seat, piece.king)) {
    const nr = row + dRow
    const nc = col + dCol
    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue
    if (board[nr * BOARD_SIZE + nc] === null) out.push({ to: nr * BOARD_SIZE + nc })
  }
  return out
}

export function hasAnyMove(board: (CheckerCell | null)[], seat: 0 | 1): boolean {
  for (let idx = 0; idx < BOARD_CELLS; idx++) {
    const piece = board[idx]
    if (!piece || piece.seat !== seat) continue
    if (capturesFrom(board, idx).length > 0 || movesFrom(board, idx).length > 0) return true
  }
  return false
}
