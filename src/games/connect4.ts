export const C4_COLS = 7
export const C4_ROWS = 6

export function lowestOpenRow(board: (number | null)[], col: number): number {
  for (let r = C4_ROWS - 1; r >= 0; r--) {
    if (board[r * C4_COLS + col] === null) return r
  }
  return -1
}

export function checkWin(board: (number | null)[], row: number, col: number, seatIdx: number): number[] | null {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [row * C4_COLS + col]
    for (const sign of [1, -1]) {
      let r = row + dr * sign
      let c = col + dc * sign
      while (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS && board[r * C4_COLS + c] === seatIdx) {
        line.push(r * C4_COLS + c)
        r += dr * sign
        c += dc * sign
      }
    }
    if (line.length >= 4) return line
  }
  return null
}

export function isBoardFull(board: (number | null)[]): boolean {
  return board.every((cell) => cell !== null)
}

function c4Try(board: (number | null)[], col: number, who: number): { board: (number | null)[]; row: number } | null {
  const row = lowestOpenRow(board, col)
  if (row < 0) return null
  const next = [...board]
  next[row * C4_COLS + col] = who
  return { board: next, row }
}

export function decideConnect4Move(board: (number | null)[], me: number, opponent: number): number {
  const open = Array.from({ length: C4_COLS }, (_, col) => col).filter((col) => lowestOpenRow(board, col) >= 0)
  for (const col of open) {
    const move = c4Try(board, col, me)!
    if (checkWin(move.board, move.row, col, me)) return col
  }
  for (const col of open) {
    const move = c4Try(board, col, opponent)!
    if (checkWin(move.board, move.row, col, opponent)) return col
  }
  const pref = [3, 2, 4, 1, 5, 0, 6].filter((col) => open.includes(col))
  for (const col of pref) {
    const move = c4Try(board, col, me)!
    const safe = open.every((opponentCol) => {
      const response = c4Try(move.board, opponentCol, opponent)
      return !response || !checkWin(response.board, response.row, opponentCol, opponent)
    })
    if (safe) return col
  }
  return pref[0]
}
