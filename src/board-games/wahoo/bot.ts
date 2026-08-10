import type { BotStrategy } from '../../engine/bot.ts'
import {
  legalMoves,
  moveBumps,
  type WahooAction,
  type WahooMove,
  type WahooPrivateState,
  type WahooPublicState,
} from './state.ts'

// Stateless, deterministic picker: roll whenever awaiting a roll, otherwise
// choose among the legal moves by priority — win now, bump an opponent, enter
// the lane, shortcut, exit, bring a marble out, then the advance whose marble
// is closest to home (ties by lower marbleIdx).
export const wahooBotStrategy: BotStrategy<WahooPublicState, WahooPrivateState, WahooAction> = (
  publicState,
  _privateState,
  playerId,
) => {
  if (publicState.turn.phase === 'roll') return { type: 'ROLL' }
  const die = publicState.die!
  const positions = publicState.positions[playerId]
  const moves = legalMoves(publicState, playerId, die)

  // A move wins now iff it is an advance that brings the last non-lane marble
  // into the lane.
  const winsNow = (m: WahooMove): boolean => {
    if (m.kind !== 'advance') return false
    const to = positions[m.marbleIdx] + die
    return to >= 52 && positions.every((q, i) => i === m.marbleIdx || q >= 52)
  }

  // Fallback among non-lane-entry advances: closest to home, then lower index.
  let bestAdvance: WahooMove | undefined
  for (const m of moves) {
    if (m.kind !== 'advance' || positions[m.marbleIdx] + die >= 52) continue
    if (
      bestAdvance === undefined ||
      positions[m.marbleIdx] > positions[bestAdvance.marbleIdx] ||
      (positions[m.marbleIdx] === positions[bestAdvance.marbleIdx] && m.marbleIdx < bestAdvance.marbleIdx)
    ) {
      bestAdvance = m
    }
  }

  const move =
    moves.find(winsNow) ??
    moves.find((m) => moveBumps(publicState, playerId, die, m)) ??
    moves.find((m) => m.kind === 'advance' && positions[m.marbleIdx] + die >= 52) ??
    moves.find((m) => m.kind === 'shortcut') ??
    moves.find((m) => m.kind === 'exit') ??
    moves.find((m) => m.kind === 'out') ??
    bestAdvance
  return { type: 'MOVE', move: move! }
}
