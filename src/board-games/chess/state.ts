import { Chess } from 'chess.js'
import type { HostSession } from '../../engine/sync.ts'
import { createHostSession } from '../../engine/sync.ts'
import type { TurnState } from '../../engine/turn-engine.ts'
import { createTurnState } from '../../engine/turn-engine.ts'
import { createRng } from '../../engine/rng.ts'

export type ChessStage = 'play' | 'over'
export type ChessDifficulty = 'easy' | 'normal' | 'hard'
export type ChessOutcome =
  | { kind: 'checkmate'; winnerSeat: 0 | 1 }
  | { kind: 'resign'; winnerSeat: 0 | 1 }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: 'agreement' | 'threefold' | 'fifty-move' | 'insufficient-material' }

export interface LastChessMove {
  by: string
  san: string // algebraic notation of the move just made, for the status line
  check: boolean // does this move give check?
}

export interface ChessPublicState {
  stage: ChessStage
  turn: TurnState<'play'>
  seatOrder: [string, string] // index 0 = white, index 1 = black
  fen: string // current position — the ONLY board truth on the wire
  difficulty: ChessDifficulty
  drawOfferBy: string | null // seated id of whoever has a pending draw offer out
  outcome: ChessOutcome | null // set only when stage === 'over'
  lastMove: LastChessMove | null
}

export type ChessPrivateState = Record<string, never> // perfect information

export type ChessAction =
  | { type: 'MOVE'; from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }
  | { type: 'RESIGN' }
  | { type: 'OFFER_DRAW' }
  | { type: 'ACCEPT_DRAW' }
  | { type: 'DECLINE_DRAW' }

export interface ChessSession {
  session: HostSession<ChessPublicState, ChessPrivateState>
  rng: () => number // for the easy bot's weighted-random pick
}

export function createChessGame(
  playerIds: [string, string],
  difficulty: ChessDifficulty,
  seed: number,
): ChessSession {
  const rng = createRng(seed)
  const publicState: ChessPublicState = {
    stage: 'play',
    turn: createTurnState(playerIds, 'play'),
    seatOrder: playerIds,
    fen: new Chess().fen(),
    difficulty,
    drawOfferBy: null,
    outcome: null,
    lastMove: null,
  }
  const privateStates: Record<string, ChessPrivateState> = {
    [playerIds[0]]: {},
    [playerIds[1]]: {},
  }
  return { session: createHostSession(publicState, privateStates), rng }
}

export function seatToColor(seat: 0 | 1): 'w' | 'b' {
  return seat === 0 ? 'w' : 'b'
}

// Called right after a move was applied to `chess` (which is now the opponent's
// turn to move). Returns the outcome that ends the game, or null to continue.
export function outcomeFromChessJs(chess: Chess, moverSeat: 0 | 1): ChessOutcome | null {
  if (chess.isCheckmate()) return { kind: 'checkmate', winnerSeat: moverSeat }
  if (chess.isStalemate()) return { kind: 'stalemate' }
  if (chess.isThreefoldRepetition()) return { kind: 'draw', reason: 'threefold' }
  if (chess.isDraw()) {
    // chess.js's isDraw() lumps fifty-move, stalemate and insufficient material
    // together; stalemate is already handled above, so disambiguate the rest.
    if (chess.isInsufficientMaterial()) return { kind: 'draw', reason: 'insufficient-material' }
    return { kind: 'draw', reason: 'fifty-move' }
  }
  return null
}
