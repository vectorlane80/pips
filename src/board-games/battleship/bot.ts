import type { BotStrategy } from '../../engine/bot.ts'
import type { BattleshipAction, BattleshipPrivateState, BattleshipPublicState } from './state.ts'
import { BOARD_CELLS, BOARD_SIZE, randomFleet } from './state.ts'

// Orthogonal neighbors of a cell that stay inside the 10×10 grid, in prototype
// order: up, down, left, right.
function neighbors(cell: number): number[] {
  const row = Math.floor(cell / BOARD_SIZE)
  const col = cell % BOARD_SIZE
  const out: number[] = []
  if (row > 0) out.push(cell - BOARD_SIZE)
  if (row < BOARD_SIZE - 1) out.push(cell + BOARD_SIZE)
  if (col > 0) out.push(cell - 1)
  if (col < BOARD_SIZE - 1) out.push(cell + 1)
  return out
}

export function makeBattleshipBotStrategy(
  rng: () => number,
): BotStrategy<BattleshipPublicState, BattleshipPrivateState, BattleshipAction> {
  return (publicState, _privateState, playerId) => {
    if (publicState.stage === 'placing') {
      return { type: 'PLACE_FLEET', board: randomFleet(rng) }
    }
    const opponentId = publicState.turn.playerOrder.find((p) => p !== playerId)!
    const hits = publicState.hits[opponentId]
    // Cells revealed by sunk ships are resolved — the hunt around them is over.
    const resolved = new Set<number>()
    for (const reveal of publicState.sunk[opponentId]) {
      for (const cell of reveal.cells) resolved.add(cell)
    }
    const targets: number[] = []
    const seen = new Set<number>()
    for (let cell = 0; cell < BOARD_CELLS; cell++) {
      if (hits[cell] !== 'hit' || resolved.has(cell)) continue
      for (const n of neighbors(cell)) {
        if (hits[n] === null && !seen.has(n)) {
          seen.add(n)
          targets.push(n)
        }
      }
    }
    if (targets.length > 0) {
      return { type: 'FIRE', cell: targets[Math.floor(rng() * targets.length)] }
    }
    const unfired: number[] = []
    for (let cell = 0; cell < BOARD_CELLS; cell++) {
      if (hits[cell] === null) unfired.push(cell)
    }
    return { type: 'FIRE', cell: unfired[Math.floor(rng() * unfired.length)] }
  }
}
