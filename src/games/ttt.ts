export const TTT_MARKS = ['X', 'O', '△', '□']

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

export function checkWin(board: (number | null)[], seatIdx: number): number[] | null {
  for (const line of LINES) {
    if (line.every((i) => board[i] === seatIdx)) return line
  }
  return null
}

export function isDraw(board: (number | null)[]): boolean {
  return board.every((c) => c !== null)
}

export function decideTttMove(board: (number | null)[], me: number, opponent: number): number {
  const empties = board.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0)
  for (const i of empties) {
    const copy = [...board]
    copy[i] = me
    if (checkWin(copy, me)) return i
  }
  for (const i of empties) {
    const copy = [...board]
    copy[i] = opponent
    if (checkWin(copy, opponent)) return i
  }
  if (board[4] === null) return 4
  const corners = [0, 2, 6, 8].filter((i) => board[i] === null)
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)]
  return empties[Math.floor(Math.random() * empties.length)]
}
