import { Chess } from 'chess.js'
import type { ActionOutcome, ActionValidator } from '../../engine/sync.ts'
import { applyAction } from '../../engine/sync.ts'
import { runBotTurn, type BotStrategy } from '../../engine/bot.ts'
import { advanceTurn, currentPlayer } from '../../engine/turn-engine.ts'
import type {
  ChessAction,
  ChessOutcome,
  ChessPrivateState,
  ChessPublicState,
  ChessSession,
} from './state.ts'
import { outcomeFromChessJs, seatToColor } from './state.ts'

export const validateChessAction: ActionValidator<
  ChessPublicState,
  ChessPrivateState,
  ChessAction
> = (session, playerId, action) => {
  const { publicState, privateStates } = session

  if (action.type === 'MOVE') {
    if (publicState.stage !== 'play') return { ok: false, reason: 'not in play stage' }
    if (currentPlayer(publicState.turn) !== playerId) return { ok: false, reason: 'not your turn' }
    const moverSeat = publicState.seatOrder.indexOf(playerId) as 0 | 1
    const chess = new Chess(publicState.fen)
    if (chess.turn() !== seatToColor(moverSeat)) return { ok: false, reason: 'color mismatch' }

    // chess.js 1.x throws on illegal input (object or string) — the try/catch
    // also covers any future version that returns null instead. Promotion is
    // only sent to chess.js when actually provided: an explicit `promotion:
    // undefined` key is accepted, but omitting it keeps this honest.
    let result
    try {
      result =
        action.promotion === undefined
          ? chess.move({ from: action.from, to: action.to })
          : chess.move({ from: action.from, to: action.to, promotion: action.promotion })
    } catch {
      return { ok: false, reason: 'illegal move' }
    }
    if (result === null) return { ok: false, reason: 'illegal move' }

    const outcome: ChessOutcome | null = outcomeFromChessJs(chess, moverSeat)
    let stage: ChessPublicState['stage'] = publicState.stage
    let turn = publicState.turn
    if (outcome) {
      stage = 'over'
    } else {
      turn = advanceTurn(publicState.turn, 'play')
    }

    return {
      ok: true,
      publicState: {
        ...publicState,
        fen: chess.fen(),
        stage,
        turn,
        outcome,
        lastMove: { by: playerId, san: result.san, check: chess.inCheck() },
        drawOfferBy: null, // any move implicitly declines a pending draw offer
      },
      privateStates,
    }
  }

  if (action.type === 'RESIGN') {
    if (publicState.stage !== 'play') return { ok: false, reason: 'not in play stage' }
    const seat = publicState.seatOrder.indexOf(playerId)
    if (seat === -1) return { ok: false, reason: 'not a seated player' }
    const winnerSeat: 0 | 1 = seat === 0 ? 1 : 0
    return {
      ok: true,
      publicState: {
        ...publicState,
        stage: 'over',
        outcome: { kind: 'resign', winnerSeat },
        drawOfferBy: null, // a pending draw offer dies with the game
      },
      privateStates,
    }
  }

  if (action.type === 'OFFER_DRAW') {
    if (publicState.stage !== 'play') return { ok: false, reason: 'not in play stage' }
    if (currentPlayer(publicState.turn) !== playerId) return { ok: false, reason: 'not your turn' }
    if (publicState.drawOfferBy !== null) return { ok: false, reason: 'draw offer already pending' }
    return {
      ok: true,
      publicState: { ...publicState, drawOfferBy: playerId },
      privateStates,
    }
  }

  if (action.type === 'ACCEPT_DRAW') {
    if (publicState.stage !== 'play') return { ok: false, reason: 'not in play stage' }
    if (!publicState.seatOrder.includes(playerId)) return { ok: false, reason: 'not a seated player' }
    if (publicState.drawOfferBy === null) return { ok: false, reason: 'no draw offer pending' }
    if (playerId === publicState.drawOfferBy) return { ok: false, reason: "can't accept your own offer" }
    return {
      ok: true,
      publicState: {
        ...publicState,
        stage: 'over',
        outcome: { kind: 'draw', reason: 'agreement' },
        drawOfferBy: null, // a pending draw offer dies with the game
      },
      privateStates,
    }
  }

  if (action.type === 'DECLINE_DRAW') {
    if (publicState.stage !== 'play') return { ok: false, reason: 'not in play stage' }
    if (!publicState.seatOrder.includes(playerId)) return { ok: false, reason: 'not a seated player' }
    if (publicState.drawOfferBy === null) return { ok: false, reason: 'no draw offer pending' }
    if (playerId === publicState.drawOfferBy) return { ok: false, reason: "can't decline your own offer" }
    return {
      ok: true,
      publicState: { ...publicState, drawOfferBy: null },
      privateStates,
    }
  }

  return { ok: false, reason: 'unknown action' }
}

export function applyChessAction(
  game: ChessSession,
  playerId: string,
  action: ChessAction,
): { game: ChessSession; outcome: ActionOutcome<ChessPublicState, ChessPrivateState> } {
  const { session, outcome } = applyAction(game.session, playerId, action, validateChessAction)
  return { game: { session, rng: game.rng }, outcome }
}

export function runChessBotTurn(
  game: ChessSession,
  playerId: string,
  strategy: BotStrategy<ChessPublicState, ChessPrivateState, ChessAction>,
): { game: ChessSession; outcome: ActionOutcome<ChessPublicState, ChessPrivateState> } {
  const { session, outcome } = runBotTurn(game.session, playerId, strategy, validateChessAction)
  return { game: { session, rng: game.rng }, outcome }
}
