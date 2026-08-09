import type { BotStrategy } from '../../engine/bot.ts'
import type { DominoArm, DominoesAction, DominoesPrivateState, DominoesPublicState, PlacedTile } from './state.ts'
import { endValue, legalArms } from './state.ts'
import { boardTotal, scoreForTotal } from './scoring.ts'

// Fully deterministic: plays the highest-immediate-score (tile, arm); ties break doubles-first,
// then higher pip sum, then first in hand order / arm order right,left,up,down. Draws when stuck
// with a boneyard, passes when stuck with an empty one. Never proposes START_NEXT_ROUND.
export const dominoesBotStrategy: BotStrategy<
  DominoesPublicState,
  DominoesPrivateState,
  DominoesAction
> = (publicState, privateState) => {
  const hand = privateState.hand.cards

  // No center and it's the bot's lead: highest double, else highest pip-sum tile.
  if (publicState.center === null) {
    const doubles = hand.filter((t) => t.a === t.b)
    const pool = doubles.length > 0 ? doubles : hand
    let best = pool[0]
    for (const t of pool.slice(1)) {
      if (t.a + t.b > best.a + best.b) best = t
    }
    return { type: 'PLAY_TILE', tileId: best.id, arm: 'center' }
  }

  let bestAction: { type: 'PLAY_TILE'; tileId: string; arm: DominoArm } | null = null
  let bestScore = 0
  let bestIsDouble = false
  let bestPips = -1

  for (const tile of hand) {
    for (const arm of legalArms(tile, publicState)) {
      if (arm === 'center') continue   // center only exists when there is no center yet
      const value = endValue(publicState.center, publicState.isSpinner, publicState.arms, arm)!
      const placedTile: PlacedTile = {
        inner: value,
        outer: value === tile.a ? tile.b : tile.a,
        isDouble: tile.a === tile.b,
      }
      const simulatedArms: Record<DominoArm, PlacedTile[]> = {
        ...publicState.arms,
        [arm]: [...publicState.arms[arm], placedTile],
      }
      const score = scoreForTotal(boardTotal(publicState.center, publicState.isSpinner, simulatedArms))
      const isDouble = tile.a === tile.b
      const pips = tile.a + tile.b
      const better =
        bestAction === null ||
        score > bestScore ||
        (score === bestScore &&
          ((isDouble && !bestIsDouble) || (isDouble === bestIsDouble && pips > bestPips)))
      if (better) {
        bestAction = { type: 'PLAY_TILE', tileId: tile.id, arm }
        bestScore = score
        bestIsDouble = isDouble
        bestPips = pips
      }
    }
  }

  if (bestAction) return bestAction
  if (publicState.boneyardCount > 0) return { type: 'DRAW_TILE' }
  return { type: 'PASS' }
}
