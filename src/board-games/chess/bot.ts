import { Chess } from 'chess.js'
import type { BotStrategy } from '../../engine/bot.ts'
import type { ChessAction, ChessPrivateState, ChessPublicState } from './state.ts'
import { seatToColor } from './state.ts'

// Both strategies are only ever called when it is the bot's turn in stage 'play'
// (the App decides when a seat is a bot), so every generated move is legal.
// chess.js's verbose Move already carries a `promotion` field (undefined for
// non-promotions); we pass it through and always promote to queen.

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

function materialBalance(chess: Chess, botColor: 'w' | 'b'): number {
  let balance = 0
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece === null) continue
      balance += (piece.color === botColor ? 1 : -1) * PIECE_VALUES[piece.type]
    }
  }
  return balance
}

function bestReplyMaterial(chess: Chess, replyColor: 'w' | 'b'): number {
  // The reply is "best for the opponent": the reply that leaves the opponent
  // (replyColor) most ahead on material after their move.
  let best = -Infinity
  for (const reply of chess.moves({ verbose: true })) {
    chess.move({ from: reply.from, to: reply.to, promotion: reply.promotion })
    const score = materialBalance(chess, replyColor)
    chess.undo()
    if (score > best) best = score
  }
  return best
}

export function makeEasyChessBotStrategy(
  rng: () => number,
): BotStrategy<ChessPublicState, ChessPrivateState, ChessAction> {
  return (publicState) => {
    const chess = new Chess(publicState.fen)
    const moves = chess.moves({ verbose: true })
    const pool: (typeof moves)[number][] = []
    for (const m of moves) {
      const weight = m.captured !== undefined ? 3 : 1 // captures weighted 3x
      for (let i = 0; i < weight; i++) pool.push(m)
    }
    const pick = pool[Math.floor(rng() * pool.length)]
    return {
      type: 'MOVE',
      from: pick.from,
      to: pick.to,
      ...(pick.promotion !== undefined ? { promotion: 'q' as const } : {}),
    }
  }
}

export function makeNormalChessBotStrategy(): BotStrategy<
  ChessPublicState,
  ChessPrivateState,
  ChessAction
> {
  return (publicState, _privateState, playerId) => {
    const chess = new Chess(publicState.fen)
    const botColor = seatToColor(publicState.seatOrder.indexOf(playerId) as 0 | 1)
    const replyColor: 'w' | 'b' = botColor === 'w' ? 'b' : 'w'

    // Depth-2 material minimax: for each of the bot's moves, the opponent
    // replies with whichever legal reply maximizes THEIR material, and we
    // pick the move minimizing that worst case. Ties keep first-in-order.
    let bestScore = Infinity
    let bestMove: ChessAction = { type: 'MOVE', from: 'a1', to: 'a1' } // always overwritten: a legal move exists
    for (const m of chess.moves({ verbose: true })) {
      chess.move({ from: m.from, to: m.to, promotion: m.promotion })
      // Zero legal replies after our move is either checkmate (the best possible
      // outcome — keep scoring it as unbeatable) or stalemate (a draw — neutral,
      // never better than a real material-winning continuation). bestReplyMaterial
      // would score both as -Infinity, so distinguish them explicitly here.
      let worst: number
      if (chess.isCheckmate()) {
        worst = -Infinity
      } else if (chess.isStalemate()) {
        worst = 0
      } else {
        worst = bestReplyMaterial(chess, replyColor)
      }
      chess.undo()
      if (worst < bestScore) {
        bestScore = worst
        bestMove = {
          type: 'MOVE',
          from: m.from,
          to: m.to,
          ...(m.promotion !== undefined ? { promotion: 'q' as const } : {}),
        }
      }
    }
    return bestMove
  }
}
