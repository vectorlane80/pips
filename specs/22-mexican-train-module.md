# Spec 22 — Mexican Train module (state, rules, bot, tests)

You own EXACTLY these four new files — create the directory:

- `src/board-games/mexican-train/state.ts`
- `src/board-games/mexican-train/rules.ts`
- `src/board-games/mexican-train/bot.ts`
- `src/board-games/mexican-train/mexican-train.test.ts`

Do NOT touch any other file. No React; import only from `src/engine/`,
`src/card-engine/` (Zone/deck helpers), and within the folder. Before
writing, READ `src/board-games/dominoes/{state,rules,bot}.ts` and
`dominoes.test.ts` — Mexican Train mirrors that module's architecture
(host-side boneyard Zone outside HostSession, hands as private Zones, one
seeded rng reused across the match, `LastAction` pattern, START_NEXT_ROUND).
All state plain serializable data. 4 players, always.

## Game shape

Double-12 set: tiles `{ id: '${a}-${b}', a, b }` for `0 <= a <= b <= 12`
(91 tiles — do NOT import the dominoes double-6 set; define `createMexicanTrainSet()`
locally). 13 rounds; round r (0-based) uses engine value `12 - r` (a
`MT_ENGINE_SEQ` constant `[12,11,…,0]`). Five lanes: one per seat plus the
shared Mexican train. Running score = pips left in hand at each round's end,
accumulated; LOWER IS BETTER; after round 13 the lowest total wins.

## state.ts

```ts
export type MTStage = 'play' | 'roundEnd' | 'over'
export type MTLaneKey = 'p0' | 'p1' | 'p2' | 'p3' | 'mex'
export interface MTTile { id: string; a: number; b: number }
export interface MTPlacedTile { inner: number; outer: number; isDouble: boolean }

export interface MTRoundResult {
  kind: 'out' | 'blocked'
  outPlayerId: string | null            // null when blocked
  pips: Record<string, number>          // what each player added this round
}

export interface LastMTAction {
  by: string
  kind: 'play' | 'draw' | 'pass-open'
  tile: { a: number; b: number } | null // set for 'play' ONLY — never name a drawn tile
  lane: MTLaneKey | null
  double: boolean
  opened: MTLaneKey | null              // seat lane that got marked open by this action, else null
}

export interface MTPublicState {
  stage: MTStage
  turn: TurnState<'play'>
  seatOrder: [string, string, string, string]   // index = seat; lane 'p<i>' belongs to seatOrder[i]
  round: number                          // 0-based, 0..12
  engine: number                         // MT_ENGINE_SEQ[round]
  trains: Record<MTLaneKey, MTPlacedTile[]>
  open: Record<'p0' | 'p1' | 'p2' | 'p3', boolean>
  boneyardCount: number
  handCounts: Record<string, number>
  doublePending: boolean                 // current player owes an extra play
  passStreak: number                     // consecutive pass-opens; 4 ends the round blocked
  scores: Record<string, number>         // running pips, lower wins
  roundResult: MTRoundResult | null
  matchWinnerId: string | null
  lastAction: LastMTAction | null
}

export interface MTPrivateState { hand: Zone<MTTile> }

export type MTAction =
  | { type: 'PLAY_TILE'; tileId: string; lane: MTLaneKey }
  | { type: 'DRAW_TILE' }
  | { type: 'PASS' }
  | { type: 'START_NEXT_ROUND' }

export interface MTSession {
  session: HostSession<MTPublicState, MTPrivateState>
  boneyard: Zone<MTTile>
  rng: () => number
}
```

Functions:

- `createMexicanTrainSet(): MTTile[]` (91 tiles).
- `dealMTRound(playerIds, round, rng)` — **pull the engine double
  (`engine-engine`) out of the full set FIRST**, shuffle the remaining 90,
  deal 13 to each of the 4 seats, boneyard = remaining 38. Return hands,
  boneyard, engine value. (This deliberately fixes the design prototype,
  which dealt first and could strand the engine in the boneyard.)
- `createMexicanTrainGame(playerIds: [string,string,string,string], seed): MTSession`
  — round 0, engine 12, empty trains, all open flags false, doublePending
  false, passStreak 0, scores 0, turn = `createTurnState(playerIds,'play')`
  (round 0 starter is seat 0; see START_NEXT_ROUND for later rounds).
- `laneEnd(publicState, lane): number` — last placed tile's `outer`, or the
  engine value when the lane is empty.
- `legalLanes(tile, seat, publicState): MTLaneKey[]` — candidate lanes are
  `'mex'`, the player's own `'p<seat>'`, and any other seat lane whose open
  flag is true; keep those where `tile.a === laneEnd || tile.b === laneEnd`.
- `handHasLegalPlay(hand, seat, publicState): boolean`.

## rules.ts — validator (+ `applyMTAction`, mirroring dominoes')

### PLAY_TILE
Reject unless: stage 'play'; playerId is current; tile is in the player's
hand; `lane` is in `legalLanes(tile, seat, publicState)`.
Apply: `inner = laneEnd`, `outer` = the other half, `isDouble = a === b`;
append to the train; remove from hand; if lane is the player's own seat
lane, clear that open flag (`opened: null`, and record the clear by just
setting `open.p<seat> = false`); `passStreak = 0`.
- Hand now empty → **round over, kind 'out'** (see Round end below) — this
  wins even if the tile was a double.
- Else if `isDouble` → `doublePending = true`, turn unchanged (same player
  plays again).
- Else `doublePending = false`, `advanceTurn`.

### DRAW_TILE
Reject unless: stage 'play'; current player; `!handHasLegalPlay` (with the
hand as it stands); boneyard non-empty. (This is also the escape hatch when
`doublePending` is true and the extra play can't be made — the same
conditions apply; no special casing needed beyond what follows.)
Apply: pop the TOP tile of the host-side boneyard Zone into the hand,
`passStreak = 0`, decrement boneyardCount.
- If the drawn tile has at least one legal lane: turn stays with the player
  (they must now PLAY_TILE it — with only that tile playable the validator
  already enforces it de facto). `lastAction: { kind:'draw', tile: null … }`.
- Else: mark the player's own train open (`open.p<seat> = true`,
  `opened: 'p<seat>'`), clear `doublePending`, `advanceTurn`.

### PASS
Reject unless: stage 'play'; current player; `!handHasLegalPlay`; boneyard
EMPTY. (The App host auto-issues PASS for whoever is stuck, human or bot —
the module just enforces it.)
Apply: `open.p<seat> = true`, `doublePending = false`,
`passStreak + 1`, `lastAction { kind:'pass-open', opened:'p<seat>' }`.
- If the new passStreak `>= 4` → **round over, kind 'blocked'**.
- Else `advanceTurn`.

### Round end (shared by 'out' and 'blocked')
Compute each player's remaining pip sum (`a + b` over their hand — the
out-player's is 0); add to `scores`; set `roundResult` with those per-round
pips. If `round === 12` (the double-0 round) → stage `'over'` and
`matchWinnerId` = the player with the LOWEST total; on a tie, the tied
player earliest in `seatOrder`. Otherwise stage `'roundEnd'`.

### START_NEXT_ROUND
Valid only in stage 'roundEnd', from any seated player (the App host
auto-fires it after a delay, like dominoes). Deal round `round + 1` via
`dealMTRound` (fresh 90-tile shuffle from the same match rng); reset trains/
open/doublePending/passStreak/roundResult/lastAction; engine =
`MT_ENGINE_SEQ[round + 1]`; **starter rotates**: the new round's starter is
seat `(round + 1) % 4` — build a fresh `createTurnState(seatOrder, 'play')`
and `advanceTurn` it `(round + 1) % 4` times.

## bot.ts

Mirror the dominoes bot's use of the engine bot plumbing. Policy for the
current bot in stage 'play':
1. Collect every `(tile, lane)` legal pair from its hand. If any: pick the
   max by `laneRank * 100 + (isDouble ? 20 : 0) + (a + b)` where laneRank is
   own train 2, mex 1, open opponent 0 → `PLAY_TILE`.
2. Else if boneyardCount > 0 → `DRAW_TILE`.
3. Else → `PASS`.
(No special doublePending logic needed — the same policy covers the extra
play.)

## mexican-train.test.ts (vitest, ≥ 35 tests)

Real assertions for at least: set is 91 unique tiles; deal extracts the
engine (no hand nor boneyard contains it, every seat has 13, boneyard 38);
lane legality (own + mex always candidates, other seats only when open,
matching by either half against `laneEnd`, empty lane matches the engine
value); placed-tile orientation (`inner` = lane end); playing on own train
clears its open flag; PLAY on a non-legal lane / out-of-turn / tile not in
hand all rejected; DRAW rejected when a legal play exists or boneyard empty;
DRAW of a playable tile keeps the turn; DRAW of a dead tile opens the train
and advances; PASS rejected when boneyard non-empty or a play exists; four
consecutive PASSes end the round blocked with correct pip accumulation;
double grants the extra play (turn unchanged, doublePending true); double as
last tile ends the round 'out'; stuck-after-double resolves via DRAW and via
PASS (the prototype's deadlock — prove both paths advance the game);
going-out player adds 0, others add their pips; START_NEXT_ROUND rejected
outside roundEnd, advances engine 12→11, rotates the starter (rounds 1,2,3
start at seats 1,2,3), resets trains/open/passStreak; after round 12 stage
'over' with lowest-total winner and earliest-seat tie-break; snapshot leak
test — `deriveSnapshot` for player A contains A's hand but NOT B's (mirror
the dominoes/battleship no-leak test); wire safety (`assertWireSafe` + JSON
round-trip); bot: prefers own train over mex over open-opponent at equal
pips, plays doubles preferentially within a lane tier, draws when stuck,
passes when stuck with empty boneyard.

Build test fixtures the way dominoes.test.ts does (construct sessions with
known hands rather than fishing random deals).

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` all green. Another agent may be
editing App.tsx concurrently — IGNORE any App.tsx/route/Landing state; your
files are independent. If its work-in-progress breaks `tsc -b` on files you
don't own, verify instead with `npx vitest run src/board-games/mexican-train/`
and say exactly that in the report. Report files, test count, verbatim final
outputs; if red or blocked, say so plainly.
