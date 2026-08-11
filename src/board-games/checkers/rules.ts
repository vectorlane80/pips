import type { ActionOutcome, ActionValidator } from '../../engine/sync.ts'
import { applyAction } from '../../engine/sync.ts'
import { runBotTurn, type BotStrategy } from '../../engine/bot.ts'
import { advanceTurn, createTurnState, currentPlayer } from '../../engine/turn-engine.ts'
import type {
  CheckersAction,
  CheckersPrivateState,
  CheckersPublicState,
  CheckersSession,
  CheckersStage,
  LastCheckersMove,
} from './state.ts'
import { capturesFrom, createCheckersBoard, hasAnyMove, movesFrom } from './state.ts'

const BOARD_CELLS = 64

export const validateCheckersAction: ActionValidator<
  CheckersPublicState,
  CheckersPrivateState,
  CheckersAction
> = (session, playerId, action) => {
  const { publicState, privateStates } = session

  if (action.type === 'NEXT_GAME') {
    if (publicState.stage !== 'gameEnd') return { ok: false, reason: 'not in gameEnd stage' }
    if (!publicState.seatOrder.includes(playerId)) return { ok: false, reason: 'not a seated player' }
    const starterSeat: 0 | 1 = publicState.starterSeat === 0 ? 1 : 0
    let turn = createTurnState(publicState.seatOrder, 'play')
    if (starterSeat === 1) turn = advanceTurn(turn, 'play')
    return {
      ok: true,
      publicState: {
        ...publicState,
        stage: 'play',
        turn,
        board: createCheckersBoard(),
        chainCell: null,
        gameNumber: publicState.gameNumber + 1,
        starterSeat,
        gameWinnerId: null,
        lastMove: null,
      },
      privateStates,
    }
  }

  if (action.type === 'MOVE') {
    if (publicState.stage !== 'play') return { ok: false, reason: 'not in play stage' }
    if (currentPlayer(publicState.turn) !== playerId) return { ok: false, reason: 'not your turn' }
    if (
      !Number.isInteger(action.from) ||
      !Number.isInteger(action.to) ||
      action.from < 0 ||
      action.from >= BOARD_CELLS ||
      action.to < 0 ||
      action.to >= BOARD_CELLS
    ) {
      return { ok: false, reason: 'invalid square' }
    }
    const piece = publicState.board[action.from]
    if (!piece) return { ok: false, reason: 'no piece there' }
    const seat = publicState.seatOrder.indexOf(playerId) as 0 | 1
    if (piece.seat !== seat) return { ok: false, reason: 'not your piece' }

    const captures = capturesFrom(publicState.board, action.from)
    const moves = movesFrom(publicState.board, action.from)
    const capture = captures.find((c) => c.to === action.to)
    if (publicState.chainCell !== null) {
      if (action.from !== publicState.chainCell) return { ok: false, reason: 'must continue the chain' }
      if (!capture) return { ok: false, reason: 'must capture' }
    } else if (!capture && !moves.some((m) => m.to === action.to)) {
      return { ok: false, reason: 'not a legal move' }
    }

    const board = [...publicState.board]
    board[action.from] = null
    if (capture) board[capture.capIdx] = null
    const farRow = piece.seat === 0 ? 0 : 7
    const crowned = !piece.king && Math.floor(action.to / 8) === farRow
    board[action.to] = { seat: piece.seat, king: piece.king || crowned }

    // Crowning ends the move even if the fresh king could jump again.
    const chainContinues = capture !== undefined && !crowned && capturesFrom(board, action.to).length > 0
    let stage: CheckersStage = publicState.stage
    let chainCell: number | null = publicState.chainCell
    let turn = publicState.turn
    let gamesWon = publicState.gamesWon
    let gameWinnerId: string | null = null
    let matchWinnerId: string | null = null

    if (chainContinues) {
      chainCell = action.to
    } else {
      chainCell = null
      const oppSeat: 0 | 1 = piece.seat === 0 ? 1 : 0
      const oppHasPieces = board.some((c) => c !== null && c.seat === oppSeat)
      if (!oppHasPieces || !hasAnyMove(board, oppSeat)) {
        gamesWon = { ...publicState.gamesWon, [playerId]: publicState.gamesWon[playerId] + 1 }
        gameWinnerId = playerId
        stage = 'gameEnd'
        if (gamesWon[playerId] >= publicState.target) {
          stage = 'over'
          matchWinnerId = playerId
        }
      } else {
        turn = advanceTurn(publicState.turn, 'play')
      }
    }

    const lastMove: LastCheckersMove = {
      by: playerId,
      from: action.from,
      to: action.to,
      captured: capture ? capture.capIdx : null,
      crowned,
      chainContinues,
    }

    return {
      ok: true,
      publicState: {
        ...publicState,
        board,
        chainCell,
        turn,
        stage,
        gamesWon,
        gameWinnerId,
        matchWinnerId,
        lastMove,
      },
      privateStates,
    }
  }

  return { ok: false, reason: 'unknown action' }
}

export function applyCheckersAction(
  game: CheckersSession,
  playerId: string,
  action: CheckersAction,
): { game: CheckersSession; outcome: ActionOutcome<CheckersPublicState, CheckersPrivateState> } {
  const { session, outcome } = applyAction(game.session, playerId, action, validateCheckersAction)
  return { game: { session, rng: game.rng }, outcome }
}

export function runCheckersBotTurn(
  game: CheckersSession,
  playerId: string,
  strategy: BotStrategy<CheckersPublicState, CheckersPrivateState, CheckersAction>,
): { game: CheckersSession; outcome: ActionOutcome<CheckersPublicState, CheckersPrivateState> } {
  const { session, outcome } = runBotTurn(game.session, playerId, strategy, validateCheckersAction)
  return { game: { session, rng: game.rng }, outcome }
}
