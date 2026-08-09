# Spec 09 — Connect 4 M1: pure rules, bot, and host-authoritative state

## Task
Add Connect 4's pure game logic, bot, types, and reducer to the existing
"older game system" (the one Farkle/Yahtzee/TTT/Hangman use). No UI in this
slice — no screens, no App.tsx changes.

## Working directory
/Users/charlie/Desktop/Projects/pips

## Files you own
- `src/games/connect4.ts` (create)
- `src/games/connect4.test.ts` (create)
- `src/types.ts` (modify)
- `src/state/room.ts` (modify)
- `src/state/room.test.ts` (modify — append new describe blocks only)
- `src/styles/tokens.css` (modify — two lines, see below)

Everything else is read-only. Model everything on the Tic Tac Toe code in
these same files — Connect 4 is TTT's sibling (same first-to-three match
shape, same turn model).

## Design decisions (already made — implement exactly, do not redesign)

### Board representation
Flat array of 42 cells, row-major, **row 0 = top row**, 7 columns × 6 rows.
Cell value: seat index (`number`) or `null`. Index = `row * 7 + col`.
A dropped disc occupies the **lowest open row** of its column (the largest
`row` whose cell is `null`).

### `src/games/connect4.ts`
Plain functions, explicit types, no classes — match `ttt.ts` style.

```ts
export const C4_COLS = 7
export const C4_ROWS = 6

export function lowestOpenRow(board: (number | null)[], col: number): number
// scan r from 5 down to 0; return first r with board[r*7+col] === null; else -1

export function checkWin(board: (number | null)[], row: number, col: number, seatIdx: number): number[] | null
// The disc at (row, col) belonging to seatIdx was just placed.
// For each direction [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]:
//   start line = [row*7+col]; extend in both signs (+1, -1) while in bounds
//   (0<=r<6, 0<=c<7) and board[r*7+c] === seatIdx, pushing each index.
// If line.length >= 4 return the FULL line (may exceed 4). Else next
// direction. No direction qualifies -> null.
// (This is the prototype's c4Check, ported exactly.)

export function isBoardFull(board: (number | null)[]): boolean
// every cell !== null

export function decideConnect4Move(board: (number | null)[], me: number, opponent: number): number
// Returns a column 0-6. Board is guaranteed to have at least one open column.
// 1. For each open column (0..6 ascending, a column is open when
//    lowestOpenRow >= 0): simulate dropping my disc; if checkWin on the
//    landed cell returns a line, play that column.
// 2. Else, for each open column ascending: simulate dropping the OPPONENT's
//    disc; if that wins for the opponent, play that column (block).
// 3. Else, take pref = [3,2,4,1,5,0,6] filtered to open columns. From pref,
//    keep the columns that are "safe": after my disc lands there, NO open
//    column of the resulting board lets the opponent drop and win
//    immediately. Play the first safe column; if none is safe, play pref[0].
// (This is the prototype's c4Bot, ported exactly. Note: no difficulty
// parameter — Connect 4's bot ignores botDifficulty, like TTT's.)
```

Use a small internal helper mirroring the prototype's `c4Try(board, col, who)`
returning `{ board, row } | null` to keep the bot readable — nothing more.

### `src/types.ts`
- `Game` union: add `'connect4'` (after `'hangman'`).
- Add to each record, matching existing formatting:
  - `GAME_COLOR`: `connect4: 'var(--connect4-color)'`
  - `GAME_LABEL`: `connect4: 'Connect 4'`
  - `GAME_BLURB`: `connect4: 'Drop discs — four in a row wins'`
  - `GAME_PLAYER_RANGE`: `connect4: '2 players'`
  - `GAME_MAX_SEATS`: `connect4: 2` (and the comment above it stays accurate:
    Connect 4 is inherently two-player; extend the existing comment's list
    with Connect 4)
  - `GAME_MIN_SEATS`: `connect4: 2`
- New interface, directly after `TttState` (mirror its shape exactly):

```ts
export interface Connect4State {
  board: (number | null)[]
  starter: number
  winLine: number[]
  over: boolean
  roundOver: boolean
  pendingWinnerId: string | null
  status: string
  wins: Record<string, number>
}
```

- `RoomState`: add `connect4: Connect4State` after `hangman`.
- `Action` union: add
  `| { type: 'connect4Play'; col: number }`
  `| { type: 'connect4AdvanceRound' }`
  after the ttt actions.

### `src/styles/tokens.css`
- In the palette block (after `--coral`): add `--blue: #2f6fed;`
- With the game colors: add `--connect4-color: var(--blue);`

### `src/state/room.ts`
Mirror the TTT code exactly — same placement in the file, same style.

- `initConnect4(seats: Seat[]): Connect4State` next to `initTtt`:
  board `Array(42).fill(null)`, starter 0, winLine `[]`, over false,
  roundOver false, pendingWinnerId null, status `''`, wins zeroed per seat.
- `makeRoom`: include `connect4: initConnect4(seats)`.
- `withNewSeats`: reconcile `connect4.wins` with `reconcileScores`, exactly
  as done for `ttt.wins`.
- `startGame`: `if (state.game === 'connect4') connect4 = { ...initConnect4(seats), starter: 0 }`
  and include `connect4` in the returned state (same pattern as ttt).
- `applyAction`: cases `'connect4Play'` → `connect4Play(state, by, action.col)`
  and `'connect4AdvanceRound'` → `connect4AdvanceRound(state)`.
- New section `// ---------- Connect 4 ----------` after the TTT section:

```ts
function connect4Play(state: RoomState, by: string, col: number): RoomState {
  if (state.screen !== 'connect4') return state
  const c = state.connect4
  if (c.roundOver || col < 0 || col > 6) return state
  const seatIdx = state.seats.findIndex((s) => s.id === by)
  if (seatIdx !== state.turnIdx) return state
  const row = lowestOpenRow(c.board, col)
  if (row < 0) return state
  const board = [...c.board]
  board[row * 7 + col] = seatIdx
  const winLine = checkWin(board, row, col, seatIdx)
  const draw = !winLine && isBoardFull(board)
  if (winLine || draw) {
    const wins = { ...c.wins }
    if (winLine) wins[by] = (wins[by] ?? 0) + 1
    const seats = state.seats.map((s) => ({ ...s, score: wins[s.id] ?? 0 }))
    const matchOver = Object.values(wins).some((w) => w >= 3)
    const pendingWinnerId = matchOver ? Object.entries(wins).sort((a, b) => b[1] - a[1])[0][0] : null
    return {
      ...state, seats,
      connect4: { ...c, board, winLine: winLine ?? [], over: true, roundOver: true, pendingWinnerId, wins },
    }
  }
  const turnIdx = (state.turnIdx + 1) % state.seats.length
  return { ...state, connect4: { ...c, board }, turnIdx }
}

function connect4AdvanceRound(state: RoomState): RoomState {
  if (state.screen !== 'connect4') return state
  const c = state.connect4
  if (!c.roundOver) return state
  if (c.pendingWinnerId) {
    return { ...state, screen: 'results', winnerId: c.pendingWinnerId }
  }
  const nextStarter = (c.starter + 1) % state.seats.length
  return {
    ...state, turnIdx: nextStarter,
    connect4: { ...c, board: Array(42).fill(null), winLine: [], over: false, roundOver: false, pendingWinnerId: null, starter: nextStarter, status: '' },
  }
}
```

Import `checkWin` and `lowestOpenRow`/`isBoardFull` from `../games/connect4`
— note `ttt.ts` also exports a `checkWin`; alias the Connect 4 imports
(`checkWin as c4CheckWin`) so both coexist, keeping the existing ttt import
untouched.

`Screen` already equals `'entry' | 'room' | Game | 'results'`, so
`'connect4'` becomes a valid screen automatically — the reducer sends
players there via the existing `startGame` (`screen: state.game`). Do not
change `Screen`.

## Do NOT
- Touch `src/App.tsx`, any screen, `Landing.tsx`, `Room.tsx`, `rules.ts`,
  `useSound.ts`, or anything under `src/card-engine/`/`src/card-games/`.
- Run git, commit, or push.
- Add dependencies, abstractions, defensive code, or difficulty handling the
  spec doesn't call for. No drive-by refactors; do not reformat existing code.
- Do not modify or delete any existing test.

## Required tests

`src/games/connect4.test.ts` (vitest, style of `farkle.test.ts` — plain
`describe`/`it`/`expect`). Build boards with a small local helper that drops
discs in column order, e.g. `drop(board, col, who)` using the real
`lowestOpenRow`. Cover at minimum:

- `lowestOpenRow`: empty column → 5; column with 2 discs → 3; full column → -1.
- `checkWin`: horizontal, vertical, down-right diagonal, down-left diagonal
  each detected with the correct 4 cell indices (assert sorted contents);
  a 5-in-a-row returns all 5 indices; a 3-in-a-row returns null; a line of 4
  belonging to the *other* seat returns null for this seat.
- `isBoardFull`: false on partial board, true on full board.
- `decideConnect4Move`:
  - takes its own immediate winning column (vertical 3 stacked in col 0 →
    plays 0) even when a center column is free;
  - blocks the opponent's immediate win when it has none of its own;
  - on an empty board plays column 3 (center preference);
  - avoids a column where dropping would let the opponent win on top:
    construct a board where opponent has three in a row diagonally needing
    the cell directly above my prospective drop in some column, and at least
    one other safe pref column exists — assert the bot picks the safe one;
  - when every open pref column is unsafe, still returns pref-ordered first
    open column (no crash, returns a legal column).

`src/state/room.test.ts` — append a `describe('connect4', ...)` block using
the same helpers/patterns the existing ttt tests there use (read the file
first and reuse its setup helpers). Cover at minimum:

- startGame with game 'connect4' → screen 'connect4', fresh board, turnIdx 0.
- connect4Play: disc lands at row 5 of chosen column; second disc in same
  column lands at row 4.
- rejected: playing out of turn (state unchanged), playing a full column
  (state unchanged), playing when roundOver (state unchanged), col out of
  range (state unchanged).
- win: completing four-in-a-row sets roundOver, winLine populated, winner's
  `wins` and seat `score` increment; loser's don't.
- third game win → pendingWinnerId set; connect4AdvanceRound → screen
  'results' with winnerId.
- draw: fill the board with no four-in-a-row (hardcode a known drawn board
  by direct assignment onto state, then play the final move via
  connect4Play; verify roundOver true, winLine empty, nobody's wins change).
- connect4AdvanceRound after a non-final round: board cleared, starter and
  turnIdx advance to 1; after another round, back to 0.
- withNewSeats path: `addSeat` on a connect4 room gives the new seat a
  zeroed `connect4.wins` entry.

## Verify before reporting
Run:
1. `npx tsc -b --noEmit` — expected: no output, exit 0.
2. `npm test` — expected: all tests pass, 0 failures. Baseline before your
   change is 469 passed; your final count must be 469 + (your new tests).
3. `npm run build` — expected: exit 0.

## Inline rules (no skill loading available to you)
No abstractions, defensive code, or cleanup beyond this spec. Climb the whole
verification ladder: typecheck, run the full suite, and confirm the specific
behaviors this spec describes.

## If stuck
After 3 failed attempts at any part, stop and report honestly what works,
what doesn't, and what you tried. A truthful partial report is a success; a
false "all green" is the worst possible outcome.

## Report format
- Files changed (list)
- Test command run and its verbatim final summary line
- Anything you noticed that the spec didn't cover
