# Spec 13: Battleship game module (M1 — logic only, no UI)

You are implementing the Battleship game module for the Pips repo, on top of
the existing engine core. Every design decision is made below. Follow the
existing code style: plain functions, explicit types, no classes, no
defensive code for impossible conditions, no comments explaining edits.

Create exactly these four files, nothing else:

- `src/board-games/battleship/state.ts`
- `src/board-games/battleship/rules.ts`
- `src/board-games/battleship/bot.ts`
- `src/board-games/battleship/battleship.test.ts`

Study first (read, do not modify): `src/engine/sync.ts`,
`src/engine/turn-engine.ts`, `src/engine/rng.ts`, `src/engine/bot.ts`, and
`src/card-games/rummy/state.ts` + `rules.ts` for the established
session/validator/wrapper shape. Import ONLY from `../../engine/*` — never
from `card-engine`, `card-games`, `games`, `state`, React, or screens.

## state.ts

```ts
export type ShipId = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer'
export type Orientation = 'h' | 'v'
export type CellMark = 'hit' | 'miss'
export type BattleshipStage = 'placing' | 'battle' | 'over'

export interface ShipSpec { id: ShipId; name: string; len: number }
export const SHIPS: ShipSpec[] = [
  { id: 'carrier', name: 'Carrier', len: 5 },
  { id: 'battleship', name: 'Battleship', len: 4 },
  { id: 'cruiser', name: 'Cruiser', len: 3 },
  { id: 'submarine', name: 'Submarine', len: 3 },
  { id: 'destroyer', name: 'Destroyer', len: 2 },
]
export const BOARD_SIZE = 10
export const BOARD_CELLS = 100
```

Board representation: `(ShipId | null)[]` of length 100, row-major
(`row = Math.floor(i / 10)`, `col = i % 10`), exactly like the prototype.

```ts
export interface SunkReveal { shipId: ShipId; cells: number[] }
export interface LastShot { by: string; cell: number; result: 'hit' | 'miss' | 'sunk'; shipId: ShipId | null }
// shipId is non-null ONLY when result === 'sunk'. A plain 'hit' must NOT name the ship.

export interface BattleshipPublicState {
  stage: BattleshipStage
  turn: TurnState<'fire'>
  // hits[playerId] = marks landed ON that player's own board (opponent's shots at them)
  hits: Record<string, (CellMark | null)[]>
  placedReady: Record<string, boolean>
  // sunk[playerId] = ships sunk ON that player's board, revealed with their true cells
  sunk: Record<string, SunkReveal[]>
  scores: Record<string, number>     // ships this player has sunk, 0–5
  lastShot: LastShot | null
  winnerId: string | null
}

export interface BattleshipPrivateState { board: (ShipId | null)[] }

export type BattleshipAction =
  | { type: 'PLACE_FLEET'; board: (ShipId | null)[] }
  | { type: 'FIRE'; cell: number }

export interface BattleshipSession {
  session: HostSession<BattleshipPublicState, BattleshipPrivateState>
  rng: () => number   // host-only; drives the bot's placement and targeting
}
```

`createBattleshipGame(playerIds: [string, string], seed: number): BattleshipSession`
— `rng = createRng(seed)`; public state: stage `'placing'`,
`turn = createTurnState<'fire'>(playerIds, 'fire')`, hits = two
100-null arrays, placedReady both false, sunk both `[]`, scores both 0,
lastShot null, winnerId null. Private states: both boards 100 × null.
Session via `createHostSession`.

Pure helpers (exported from state.ts, all operating on plain data):

- `shipCellsAt(anchor: number, len: number, orient: Orientation): number[] | null`
  — the prototype's `bsCells`: null if any cell would leave the 10×10 grid
  (row/col > 9). Horizontal extends right, vertical extends down.
- `fits(board: (ShipId | null)[], cells: number[] | null): boolean` — cells
  non-null and every cell currently null on the board.
- `shipCells(board: (ShipId | null)[], shipId: ShipId): number[]`
- `isShipSunk(board, hits: (CellMark | null)[], shipId): boolean` — ship
  present on board and every one of its cells marked 'hit'.
- `isShipDamaged(board, hits, shipId): boolean` — at least one but not all
  cells hit.
- `allSunk(board, hits): boolean` — all five SHIPS sunk.
- `randomFleet(rand: () => number, base?: (ShipId | null)[], alreadyPlaced?: ShipId[]): (ShipId | null)[]`
  — the prototype's rejection-sampling placement: for each ship not in
  `alreadyPlaced` (default: place all five onto an empty board), loop:
  orientation `rand() < 0.5 ? 'h' : 'v'`, anchor `Math.floor(rand() * 100)`,
  accept when `fits`. Returns a new board array. (The UI's
  "randomize remaining" passes the player's partial board + placed list and
  `Math.random`; the bot passes the session rng and no base.)
- `validFleet(board: (ShipId | null)[]): boolean` — board length 100; for
  each of the five SHIPS: its cells number exactly `len` and form a straight
  contiguous horizontal or vertical line; total non-null cells 17; no value
  outside the five ship ids. (Cells are ShipId|null typed, but validate
  counts/shape — this is the host-side gate on client-submitted fleets.)

## rules.ts

`validateBattleshipAction: ActionValidator<BattleshipPublicState, BattleshipPrivateState, BattleshipAction>`
(a plain exported function — no closure factory needed; there is no
host-only zone).

Rejections return `{ ok: false, reason: '<short reason>' }`. Successes
return `{ ok: true, publicState, privateStates }` with ALL players'
private states present (engine contract).

**PLACE_FLEET:**
- reject unless `stage === 'placing'`
- reject if `placedReady[playerId]` already true
- reject unless `validFleet(action.board)`
- accept: player's private board = a copy of `action.board`;
  `placedReady[playerId] = true`. If BOTH players are now ready:
  `stage = 'battle'` (turn state already starts at playerOrder[0], phase
  'fire' — leave it untouched).

**FIRE:**
- reject unless `stage === 'battle'`
- reject unless `currentPlayer(publicState.turn) === playerId`
- reject unless `Number.isInteger(cell)` and `0 <= cell < 100`
- let `opponentId` = the other player; reject if
  `hits[opponentId][cell] !== null` (already fired there)
- resolve against `privateStates[opponentId].board` (the validator sees the
  full host session; this never reaches clients):
  - miss: mark `'miss'`, `lastShot = { by: playerId, cell, result: 'miss', shipId: null }`
  - hit: mark `'hit'`; if that ship is now sunk, append
    `{ shipId, cells: shipCells(board, shipId) }` to `sunk[opponentId]`,
    increment `scores[playerId]`, lastShot result `'sunk'` with shipId;
    otherwise lastShot result `'hit'` with `shipId: null`
- if `allSunk(opponent board, hits[opponentId])`: `stage = 'over'`,
  `winnerId = playerId` (turn untouched)
- else `turn = advanceTurn(turn, 'fire')` — turn passes after EVERY shot,
  hit or miss
- private states pass through unchanged (return the same record object)

Wrappers, mirroring `rules.ts` in rummy exactly:

```ts
export function applyBattleshipAction(bs: BattleshipSession, playerId: string, action: BattleshipAction):
  { bs: BattleshipSession; outcome: ActionOutcome<BattleshipPublicState, BattleshipPrivateState> }
export function runBattleshipBotTurn(bs: BattleshipSession, playerId: string,
  strategy: BotStrategy<BattleshipPublicState, BattleshipPrivateState, BattleshipAction>):
  { bs: BattleshipSession; outcome: ActionOutcome<...> }
```

(both delegate to `applyAction` / `runBotTurn` from the engine with
`validateBattleshipAction`, and rebuild `{ session, rng }`.)

## bot.ts

`makeBattleshipBotStrategy(rng: () => number): BotStrategy<BattleshipPublicState, BattleshipPrivateState, BattleshipAction>`

- If `publicState.stage === 'placing'`: return
  `{ type: 'PLACE_FLEET', board: randomFleet(rng) }`.
- Else (battle): the bot is shooting at `opponentId` (the other entry in
  `turn.playerOrder`). Targeting uses ONLY public data about that board:
  `hits[opponentId]` and `sunk[opponentId]` — never any board contents.
  - Resolved cells: every cell listed in `sunk[opponentId][*].cells`.
  - Unresolved hit: a cell marked 'hit' that is not resolved.
  - Target list: for each unresolved hit, its four orthogonal in-bounds
    neighbors not yet fired on (`hits[opponentId][j] === null`), deduped,
    in prototype order (up, down, left, right per hit, ascending cell scan).
  - If the target list is non-empty: fire at
    `list[Math.floor(rng() * list.length)]`.
  - Else: collect all unfired cells, fire at a uniform rng pick.
- Note this differs from the prototype only in that it reads sunk reveals
  instead of the target board to resolve hits — same information, no peeking.

## battleship.test.ts

Vitest, style of `src/card-games/rummy/rummy.test.ts` (helpers building a
session with a known seed, then driving actions through
`applyBattleshipAction`). Required coverage, at minimum:

1. `shipCellsAt` off-grid → null (h at column 9 len 2; v at row 9 len 2);
   in-bounds shapes correct.
2. `validFleet`: accepts a legal hand-built fleet; rejects overlap
   (impossible via board array — instead reject: missing ship, wrong
   length run, diagonal/broken line, 18 filled cells, board length ≠ 100).
3. `randomFleet(createRng(1))` produces a `validFleet` board;
   deterministic for a fixed seed; respects `base`/`alreadyPlaced`
   (pre-placed ships untouched, only remaining ships added).
4. PLACE_FLEET: legal accepted, `placedReady` set; second placement by the
   same player rejected; illegal fleet rejected; after both players place,
   `stage === 'battle'` and `currentPlayer` is playerOrder[0].
5. FIRE: out of turn rejected; during placing rejected; repeat cell
   rejected; out-of-range cell rejected.
6. FIRE resolution: miss marks miss and passes turn; hit marks hit, does
   NOT reveal shipId in lastShot, passes turn; sinking appends the correct
   `SunkReveal` (right cells), increments shooter score, lastShot names the
   ship; sinking all five sets stage 'over', winnerId, and score 5.
7. Bot placement: in placing stage the strategy returns a valid
   PLACE_FLEET; driven via `runBattleshipBotTurn` it is accepted.
8. Bot targeting: build a battle state where the bot has one unresolved
   hit on the enemy board mid-ship → strategy fires at one of the
   orthogonal unfired neighbors (assert membership, all four cases at a
   board edge too); after the ship is sunk (reveal recorded), strategy
   returns to random mode (assert target is some unfired cell NOT
   adjacent-restricted); bot never selects a fired cell across a long
   simulated game (drive a full bot-vs-bot match to completion with two
   seeded strategies and assert it terminates with a winner in ≤ 200
   shots, every FIRE accepted).
9. **No-leak test (most important):** host places a known fleet, guest
   places a fleet, battle starts. `deriveSnapshot(session, guestId)`:
   - `privateState.board` equals the guest's own submitted board
   - `JSON.stringify(snapshot.publicState)` contains NO ship id string
     before anything is sunk (scores/hits/placedReady leak nothing)
   - after the guest sinks a host ship, the only ship id appearing in
     public state is that sunk ship (in `sunk[hostId]` and `lastShot`)
   - `isJsonSerializable(snapshot)` is true (import from engine sync)
10. Full-session revision flow: every accepted action bumps
    `session.revision` by exactly 1; rejected actions leave it unchanged.

## Verification (run all; all must be clean)

```
npx tsc -b --noEmit
npm test        # all existing 481 tests still pass + your new file passes
npm run build
```

## Forbidden

Touching ANY existing file. Creating files beyond the four listed. Importing
from anywhere but `../../engine/*` and vitest. `git add`/`commit`/`push`.
UI code, React, sounds, assets — that's M2.

## If anything fails

If a failure isn't in your four files, STOP and report the exact command
and full output. Do not modify files outside your list to make something
pass.

## Report format

(1) commands + verbatim results (test tallies); (2) files created with a
one-line description each; (3) deviations or "no deviations".
