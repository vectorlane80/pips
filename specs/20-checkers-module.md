# Spec 20 — Checkers module (state, rules, bot, tests)

You own EXACTLY these four new files — create the directory:

- `src/board-games/checkers/state.ts`
- `src/board-games/checkers/rules.ts`
- `src/board-games/checkers/bot.ts`
- `src/board-games/checkers/checkers.test.ts`

Do NOT touch any other file. No React imports, no imports from `src/screens/`,
`src/components/`, `src/card-engine/`, `src/card-games/`, `src/games/`,
`src/state/`. Import only from `src/engine/` and within the checkers folder.
Match the style of `src/board-games/battleship/` (plain functions, explicit
types, no classes, no defensive code for impossible conditions). All state is
plain serializable data.

## Board model

8×8, flat array of 64, row-major, row 0 at top. Playable squares are the dark
ones: `(row + col) % 2 === 1`. Two seats: **seat 0 sits at the bottom** (starts
on rows 5–7, men move toward row 0), **seat 1 at the top** (rows 0–2, men move
toward row 7). 12 pieces each on dark squares.

## state.ts

```ts
import type { HostSession } from '../../engine/sync.ts'
import { createHostSession } from '../../engine/sync.ts'
import type { TurnState } from '../../engine/turn-engine.ts'
import { advanceTurn, createTurnState } from '../../engine/turn-engine.ts'
import { createRng } from '../../engine/rng.ts'

export type CheckersStage = 'play' | 'gameEnd' | 'over'

export interface CheckerCell { seat: 0 | 1; king: boolean }

export interface LastCheckersMove {
  by: string
  from: number
  to: number
  captured: number | null      // board index of the removed piece, null = simple move
  crowned: boolean
  chainContinues: boolean
}

export interface CheckersPublicState {
  stage: CheckersStage
  turn: TurnState<'play'>
  seatOrder: [string, string]         // index = seat
  board: (CheckerCell | null)[]       // length 64
  chainCell: number | null            // mid-multi-jump lock: mover must jump again with this piece
  gamesWon: Record<string, number>
  target: number                      // 3 (best of five)
  gameNumber: number                  // 1-based
  starterSeat: 0 | 1                  // who opened the current game
  gameWinnerId: string | null         // set during 'gameEnd' (and final game of 'over')
  matchWinnerId: string | null        // set only when stage === 'over'
  lastMove: LastCheckersMove | null
}

export type CheckersPrivateState = Record<string, never>   // perfect information — nothing hidden

export type CheckersAction =
  | { type: 'MOVE'; from: number; to: number }
  | { type: 'NEXT_GAME' }

export interface CheckersSession {
  session: HostSession<CheckersPublicState, CheckersPrivateState>
  rng: () => number                   // for the bot's random picks
}

export const CHECKERS_TARGET = 3
```

Functions:

- `createCheckersBoard(): (CheckerCell | null)[]` — the 24-piece opening
  position described above.
- `createCheckersGame(playerIds: [string, string], seed: number): CheckersSession`
  — board = createCheckersBoard(), turn = `createTurnState(playerIds, 'play')`
  (seat 0 starts game 1), starterSeat 0, gameNumber 1, gamesWon 0/0,
  target CHECKERS_TARGET, everything else null, stage 'play'. privateStates:
  `{ [id]: {} }` for both players. rng = `createRng(seed)`.
- `dirsFor(seat: 0 | 1, king: boolean): [number, number][]` — [dRow, dCol];
  kings all four diagonals; seat 0 men `[-1,-1],[-1,1]`; seat 1 men
  `[1,-1],[1,1]`.
- `capturesFrom(board, idx): { to: number; capIdx: number }[]` — one-square
  jumps: adjacent enemy piece, empty landing two away, in a legal direction
  for the piece at idx (read seat/king from the board — no seat/king params).
- `movesFrom(board, idx): { to: number }[]` — one-square moves into empty
  squares.
- `hasAnyMove(board, seat): boolean` — any piece of that seat has a capture
  or a simple move.

`capturesFrom`/`movesFrom` guard row AND column bounds arithmetically (a
diagonal step must change both row and col by exactly the delta — compute in
row/col space, never raw-index ±7/±9).

## rules.ts

`validateCheckersAction: ActionValidator<CheckersPublicState, CheckersPrivateState, CheckersAction>`
plus `applyCheckersAction` — mirror `src/board-games/battleship/rules.ts`
exactly in shape (validator returns `{ ok: false, reason }` or
`{ ok: true, publicState, privateStates }`; applier wraps `applyAction`).

### MOVE

Reject unless: stage 'play'; playerId is `currentPlayer(turn)`; `from` holds a
piece whose seat is playerId's seat; if `chainCell !== null` then
`from === chainCell` AND the move is one of `capturesFrom(board, from)`;
otherwise the move is in `capturesFrom` (a capture) or `movesFrom` (a simple
move — **captures are never forced as the first move of a turn**).

Apply:
1. Remove the piece from `from`; if a capture, remove the piece at `capIdx`.
2. `crowned` = piece was not a king AND `to`'s row is the far row (row 0 for
   seat 0, row 7 for seat 1). Place `{ seat, king: piece.king || crowned }`.
3. **Chain rule**: `chainContinues = captured && !crowned && capturesFrom(newBoard, to).length > 0`.
   Crowning ends the move even if the new king could jump — this is
   deliberate (standard rules; differs from the design prototype).
4. If chainContinues: `chainCell = to`, turn object unchanged (same player,
   same turnNumber).
5. Else `chainCell = null` and check the opponent seat: if it has no pieces
   OR `!hasAnyMove(board, oppSeat)` → the mover wins this game:
   `gamesWon[mover] + 1`, `gameWinnerId = mover`, stage `'gameEnd'`; and if
   that total `>= target`, stage `'over'` and `matchWinnerId = mover`.
   Otherwise `turn = advanceTurn(turn, 'play')`.
6. `lastMove` always set (`captured` = capIdx or null).

### NEXT_GAME

Valid only in stage `'gameEnd'`, from either seated player. New game:
fresh board, `starterSeat` flips, `gameNumber + 1`, `gameWinnerId` and
`lastMove` and `chainCell` null, stage `'play'`. Turn: fresh
`createTurnState(seatOrder, 'play')`, then `advanceTurn(turn, 'play')` once
if the new starterSeat is 1. `gamesWon` carries over.

## bot.ts

`makeCheckersBotStrategy(...)` following `battleship/bot.ts`'s use of
`BotStrategy` from `src/engine/bot.ts`, and a
`runCheckersBotTurn` mirror of battleship's if that's where it lives —
match whichever file hosts it there. Policy, given it is the bot's turn in
stage 'play' (App handles NEXT_GAME, not the bot):

1. If `chainCell !== null`, pick uniformly at random (via session rng) among
   `capturesFrom(board, chainCell)`.
2. Else gather every capture from every one of its pieces; if any, pick one
   at random.
3. Else gather every simple move from every piece and pick one at random.

Emit the corresponding `{ type: 'MOVE', from, to }`.

## checkers.test.ts (vitest, ≥ 25 tests)

Cover at minimum, each as a real assertion against the validator/applier:
- Opening board: 12 pieces per seat, all on dark squares, correct rows.
- Man move directions per seat; moving onto an occupied square rejected;
  moving a piece you don't own rejected; out-of-turn MOVE rejected.
- Diagonal edge wrap: a piece on column 0/7 offers no wrapped moves.
- Optional capture: with a capture on the board, a simple move still ok.
- Jump: captured piece removed, landing correct; jump over own piece
  rejected; jump to occupied landing rejected.
- Multi-jump: after a jump with a follow-up capture available, same player
  still current, `chainCell` set; MOVE with another piece rejected; simple
  move with the chained piece rejected; the continuation jump accepted;
  chain end advances the turn.
- Crowning: man reaching far row becomes king; **crowning via a jump ends
  the chain** — build a board where the freshly crowned king would have a
  backward capture and assert the turn passes anyway.
- King moves and captures in all four directions.
- Game end by capturing the last piece and by leaving the opponent with no
  legal move; gamesWon increments; stage 'gameEnd'.
- NEXT_GAME: rejected during 'play'; resets the board; starter alternates
  (currentPlayer of the new turn is the other seat); gameNumber increments.
- Match end: third game win → stage 'over', matchWinnerId set, NEXT_GAME
  and MOVE both rejected.
- Wire safety: `assertWireSafe(session.session.publicState, 'checkers')`
  passes after several moves; JSON stringify/parse round-trip deep-equals.
- Bot: chained bot returns the continuation jump; bot with only simple
  moves returns a legal one; bot prefers a capture when one exists.

## Verify before reporting

Run `npx tsc -b --noEmit` (must be silent) and `npm test` (all green — the
suite currently has 696 passing tests; yours add to that). Report format:
list of files created, test count added, verbatim final lines of both
commands. If anything is red or you cannot finish, SAY SO PLAINLY — a
false success report is the one unforgivable failure.
