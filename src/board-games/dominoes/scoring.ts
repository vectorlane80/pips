import type { DominoArm, DominoTile, PlacedTile } from './state.ts'

// Standardized All Fives end counting (per the charter — NOT the prototype's math): a double at
// the end of any arm counts both halves; while a spinner's main-line side is empty, that end IS
// the spinner and counts 2×pip — once if both main ends are empty; unstarted side arms of a
// spinner contribute nothing until a tile is played on them.
export function boardTotal(
  center: { a: number; b: number } | null,
  isSpinner: boolean,
  arms: Record<DominoArm, PlacedTile[]>,
): number {
  if (center === null) return 0
  const end = (arm: DominoArm, emptyValue: number): number => {
    const placed = arms[arm]
    const last = placed[placed.length - 1]
    if (!last) return emptyValue
    return last.isDouble ? last.outer * 2 : last.outer
  }
  if (!isSpinner) return end('left', center.a) + end('right', center.b)
  if (arms.left.length === 0 && arms.right.length === 0) {
    return 2 * center.a + end('up', 0) + end('down', 0)
  }
  return end('left', 2 * center.a) + end('right', 2 * center.a) + end('up', 0) + end('down', 0)
}

export function scoreForTotal(total: number): number {
  return total > 0 && total % 5 === 0 ? total : 0
}

export function pipSum(tiles: DominoTile[]): number {
  return tiles.reduce((sum, t) => sum + t.a + t.b, 0)
}

export function roundDownToFive(n: number): number {
  return Math.floor(n / 5) * 5
}
