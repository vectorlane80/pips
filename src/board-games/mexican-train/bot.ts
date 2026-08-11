import type { BotStrategy } from '../../engine/bot.ts'
import type { MTAction, MTLaneKey, MTPrivateState, MTPublicState } from './state.ts'
import { legalLanes } from './state.ts'

// Deterministic: plays the highest laneRank*100 + (isDouble ? 20 : 0) + (a + b) legal pair,
// where laneRank is own train 2, mex 1, open opponent 0. Draws when stuck with a boneyard,
// passes when stuck with an empty one. The same policy covers the double extra play — no
// special doublePending logic needed. Never proposes START_NEXT_ROUND.
export const mexicanTrainBotStrategy: BotStrategy<MTPublicState, MTPrivateState, MTAction> = (
  publicState,
  privateState,
  playerId,
) => {
  const seat = publicState.seatOrder.indexOf(playerId)
  let bestAction: { type: 'PLAY_TILE'; tileId: string; lane: MTLaneKey } | null = null
  let bestScore = -1

  for (const tile of privateState.hand.cards) {
    for (const lane of legalLanes(tile, seat, publicState)) {
      const laneRank = lane === `p${seat}` ? 2 : lane === 'mex' ? 1 : 0
      const score = laneRank * 100 + (tile.a === tile.b ? 20 : 0) + (tile.a + tile.b)
      if (bestAction === null || score > bestScore) {
        bestAction = { type: 'PLAY_TILE', tileId: tile.id, lane }
        bestScore = score
      }
    }
  }

  if (bestAction) return bestAction
  if (publicState.boneyardCount > 0) return { type: 'DRAW_TILE' }
  return { type: 'PASS' }
}
