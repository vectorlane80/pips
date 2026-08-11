import type { BotStrategy } from '../../engine/bot.ts'
import type { CheckersAction, CheckersPrivateState, CheckersPublicState } from './state.ts'
import { capturesFrom, movesFrom } from './state.ts'

// Policy (only ever called when it is the bot's turn in stage 'play' — the App
// handles NEXT_GAME, not the bot):
// 1. Mid-chain: jump again from chainCell, chosen uniformly at random.
// 2. Otherwise prefer any capture from any of the bot's pieces.
// 3. Otherwise a random simple move.
export function makeCheckersBotStrategy(
  rng: () => number,
): BotStrategy<CheckersPublicState, CheckersPrivateState, CheckersAction> {
  return (publicState, _privateState, playerId) => {
    const seat = publicState.seatOrder.indexOf(playerId) as 0 | 1

    if (publicState.chainCell !== null) {
      const captures = capturesFrom(publicState.board, publicState.chainCell)
      const pick = captures[Math.floor(rng() * captures.length)]
      return { type: 'MOVE', from: publicState.chainCell, to: pick.to }
    }

    const captureMoves: { from: number; to: number }[] = []
    const simpleMoves: { from: number; to: number }[] = []
    for (let idx = 0; idx < publicState.board.length; idx++) {
      const piece = publicState.board[idx]
      if (!piece || piece.seat !== seat) continue
      for (const c of capturesFrom(publicState.board, idx)) captureMoves.push({ from: idx, to: c.to })
      for (const m of movesFrom(publicState.board, idx)) simpleMoves.push({ from: idx, to: m.to })
    }
    if (captureMoves.length > 0) {
      const pick = captureMoves[Math.floor(rng() * captureMoves.length)]
      return { type: 'MOVE', from: pick.from, to: pick.to }
    }
    const pick = simpleMoves[Math.floor(rng() * simpleMoves.length)]
    return { type: 'MOVE', from: pick.from, to: pick.to }
  }
}
