import { describe, expect, it } from 'vitest'
import { checkWin, decideConnect4Move, isBoardFull, lowestOpenRow } from './connect4'

function drop(board: (number | null)[], col: number, who: number) {
  const row = lowestOpenRow(board, col)
  board[row * 7 + col] = who
  return row
}

describe('lowestOpenRow', () => {
  it('finds the lowest available cell', () => {
    const board = Array(42).fill(null)
    expect(lowestOpenRow(board, 0)).toBe(5)
    drop(board, 0, 0)
    drop(board, 0, 1)
    expect(lowestOpenRow(board, 0)).toBe(3)
    for (let i = 0; i < 4; i++) drop(board, 0, i % 2)
    expect(lowestOpenRow(board, 0)).toBe(-1)
  })
})

describe('checkWin', () => {
  it('detects horizontal, vertical, and diagonal lines', () => {
    const cases = [
      [[35, 36, 37, 38], 5, 3],
      [[14, 21, 28, 35], 2, 0],
      [[14, 22, 30, 38], 2, 0],
      [[17, 23, 29, 35], 2, 3],
    ]
    for (const [line, row, col] of cases) {
      const board = Array(42).fill(null)
      for (const index of line as number[]) board[index] = 0
      expect(checkWin(board, row as number, col as number, 0)?.sort((a, b) => a - b)).toEqual(line)
    }
  })

  it('returns the full line and rejects shorter or other-seat lines', () => {
    const five = Array(42).fill(null)
    for (const col of [1, 2, 3, 4, 5]) five[35 + col] = 0
    expect(checkWin(five, 5, 3, 0)?.sort((a, b) => a - b)).toEqual([36, 37, 38, 39, 40])
    const three = Array(42).fill(null)
    for (const col of [0, 1, 2]) three[35 + col] = 0
    expect(checkWin(three, 5, 2, 0)).toBeNull()
    const other = Array(42).fill(null)
    for (const col of [0, 1, 2, 3]) other[35 + col] = 1
    expect(checkWin(other, 5, 3, 0)).toBeNull()
  })
})

describe('isBoardFull', () => {
  it('distinguishes partial and full boards', () => {
    expect(isBoardFull(Array(42).fill(null))).toBe(false)
    expect(isBoardFull(Array(42).fill(0))).toBe(true)
  })
})

describe('decideConnect4Move', () => {
  it('takes a win, blocks a win, and prefers center', () => {
    const winning = Array(42).fill(null)
    for (let i = 0; i < 3; i++) drop(winning, 0, 0)
    expect(decideConnect4Move(winning, 0, 1)).toBe(0)
    const blocking = Array(42).fill(null)
    for (let i = 0; i < 3; i++) drop(blocking, 1, 1)
    expect(decideConnect4Move(blocking, 0, 1)).toBe(1)
    expect(decideConnect4Move(Array(42).fill(null), 0, 1)).toBe(3)
  })

  it('avoids an immediate diagonal reply and falls back to the first open preference', () => {
    const unsafe = Array(42).fill(null)
    unsafe[37] = 1
    unsafe[25] = 1
    unsafe[19] = 1
    unsafe[39] = 0
    unsafe[32] = 0
    unsafe[40] = 0
    unsafe[33] = 0
    unsafe[26] = 0
    expect(decideConnect4Move(unsafe, 0, 1)).toBe(2)

    const fullExceptZero = Array(42).fill(1)
    fullExceptZero[0] = null
    expect(decideConnect4Move(fullExceptZero, 0, 1)).toBe(0)
  })
})
