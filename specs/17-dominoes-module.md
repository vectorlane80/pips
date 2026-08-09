# Spec 17: Dominoes (All Fives) game module — M1, no UI

Implement the dominoes game module for Pips on the engine core + generic
card-engine containers. Every decision is made below. Match the existing
style (plain functions, explicit types, no classes, no defensive code for
impossible states). Study first (read only): `src/engine/sync.ts`,
`src/engine/turn-engine.ts`, `src/engine/bot.ts`, `src/engine/rng.ts`,
`src/card-engine/zones.ts` + `deck.ts` (both generic since spec 16), and
`src/card-games/rummy/state.ts` + `rules.ts` (session/validator/wrapper
shape, host-only stock pattern).

Create exactly:
- `src/board-games/dominoes/state.ts`
- `src/board-games/dominoes/scoring.ts`
- `src/board-games/dominoes/rules.ts`
- `src/board-games/dominoes/bot.ts`
- `src/board-games/dominoes/dominoes.test.ts`

Imports allowed: `../../engine/*`, `../../card-engine/zones.ts`,
`../../card-engine/deck.ts` (shuffleDeck/dealCards only — NOT
createStandardDeck), vitest. Nothing else.

## state.ts

```ts
export interface DominoTile { id: string; a: number; b: number }  // id = `${a}-${b}`, a <= b

export function createDominoSet(): DominoTile[]
// all 28 double-six tiles, a from 0..6, b from a..6, in that deterministic order

export type DominoArm = 'right' | 'left' | 'up' | 'down'
export interface PlacedTile { inner: number; outer: number; isDouble: boolean }

export type DominoesStage = 'play' | 'roundEnd' | 'over'

export interface DominoesRoundResult {
  kind: 'out' | 'blocked'
  scorerId: string | null      // null = blocked tie, nobody scores
  points: number               // already rounded down to nearest 5
}

export interface LastDominoAction {
  by: string
  kind: 'lead' | 'play' | 'draw' | 'pass'
  tile: { a: number; b: number } | null   // set for lead/play ONLY — a draw must never name the tile
  arm: DominoArm | 'center' | null
  scored: number               // All-Fives points from this play, 0 otherwise
}

export interface DominoesPublicState {
  stage: DominoesStage
  turn: TurnState<'play'>
  center: { a: number; b: number } | null
  isSpinner: boolean
  arms: Record<DominoArm, PlacedTile[]>
  boneyardCount: number
  handCounts: Record<string, number>
  passStreak: number
  scores: Record<string, number>          // match score, accumulates across rounds
  target: number                          // 150
  roundNumber: number
  roundStarterId: string                  // who led this round
  roundResult: DominoesRoundResult | null // set while stage is roundEnd/over
  lastAction: LastDominoAction | null
  matchWinnerId: string | null
}

export interface DominoesPrivateState { hand: Zone<DominoTile> }

export type DominoesAction =
  | { type: 'PLAY_TILE'; tileId: string; arm: DominoArm | 'center' }
  | { type: 'DRAW_TILE' }
  | { type: 'PASS' }
  | { type: 'START_NEXT_ROUND' }

export interface DominoesSession {
  session: HostSession<DominoesPublicState, DominoesPrivateState>
  boneyard: Zone<DominoTile>   // host-only, outside HostSession — rummy-stock pattern
  rng: () => number            // one seeded generator for every shuffle across the match
}
```

`createDominoesGame(playerIds: [string, string], seed: number): DominoesSession`
— shuffle the fresh set with the rng, deal 7/7 (`dealCards`), boneyard =
remaining 14 in a `createPublicZone<DominoTile>('boneyard', 'private')`.
Stage 'play', turn `createTurnState<'play'>(playerIds, 'play')` with
playerOrder[0] leading round 1, `roundStarterId` = that player, center
null, arms all empty, passStreak 0, scores 0/0, target 150, roundNumber 1.
Export a shared `dealRound(playerIds, rng)` helper like rummy's so
START_NEXT_ROUND reuses the exact deal logic.

Pure helpers in state.ts:
- `endValue(center, isSpinner, arms, arm): number | null` — the pip value
  a new tile must match on that arm: last placed tile's `outer`; empty
  arm → non-spinner: `center.a` for 'left', `center.b` for 'right'
  (up/down are not legal arms for a non-spinner); spinner: `center.a`.
  Null when center is null.
- `legalArms(tile, publicState): (DominoArm | 'center')[]` — `['center']`
  when no center; else the open arms (4 if spinner, else right/left)
  whose `endValue` matches `tile.a` or `tile.b`.
- `handHasLegalPlay(hand: DominoTile[], publicState): boolean`

## scoring.ts — standardized All Fives end counting

`boardTotal(center, isSpinner, arms): number`, per the charter's
standardized rules (NOT the prototype's math — this is deliberate):

- No center → 0.
- Non-spinner center: total = leftEnd + rightEnd where each end is: arm
  empty → the center's exposed half (a for left, b for right); else the
  last tile's `outer`, DOUBLED if that tile `isDouble` (3-3 at an end
  counts 6).
- Spinner center (a double): main line = left + right.
  - If BOTH left and right are empty: main-line contribution = `2 * center.a`
    (counted once — a 5-5 lead totals 10).
  - Else each side contributes: empty → `2 * center.a` (the spinner is
    still that end); non-empty → last tile's outer, doubled if double.
  - Up/down arms contribute ONLY when non-empty (last outer, doubled if
    double); empty side arms add nothing.
- `scoreForTotal(total): number` — total > 0 && total % 5 === 0 ? total : 0.
- `pipSum(tiles: DominoTile[]): number` and
  `roundDownToFive(n: number): number` (floor(n/5)*5) for round-end
  scoring.

## rules.ts

`makeValidator(boneyard, rng, setBoneyard)` closure exactly like rummy's
stock pattern, plus `applyDominoesAction(dm, playerId, action)` and
`runDominoesBotTurn(dm, playerId, strategy)` wrappers that commit the
candidate boneyard only when the outcome is ok.

All actions reject when `stage !== 'play'` except START_NEXT_ROUND
(requires 'roundEnd'). All reject when `currentPlayer(turn) !== playerId`
except START_NEXT_ROUND (host applies it as the acting player; accept
from either seated player — the App layer only ever dispatches it
host-side, same as rummy).

**PLAY_TILE:** tile must be in the player's hand; `action.arm` must be in
`legalArms(tile, publicState)` ('center' only when center is null; a
double lead sets `isSpinner`). Apply: remove from hand; center or append
`{ inner: endValue, outer: other half, isDouble }` to the arm; compute
`scored = scoreForTotal(boardTotal(...))` on the NEW board and add to the
player's score; lastAction kind 'lead' (center) or 'play' with the tile
and arm; passStreak = 0; handCounts updated.
- Hand now empty → round over, GOING OUT: points =
  `roundDownToFive(pipSum(opponent hand))` credited to the player (on TOP
  of any scored from this final play); `roundResult { kind: 'out',
  scorerId, points }`; stage 'roundEnd' — or 'over' with `matchWinnerId`
  when any score >= target and the scores are not equal (equal ≥ target →
  keep playing, stage 'roundEnd').
- Else `turn = advanceTurn(turn, 'play')`.

**DRAW_TILE:** reject unless the player's hand has NO legal play AND the
boneyard is non-empty. Take the TOP tile (last card of the boneyard zone
via the zones helpers), add to the player's hand, boneyardCount--,
passStreak = 0, lastAction `{ kind: 'draw', tile: null, arm: null,
scored: 0 }`, turn UNCHANGED — the same player keeps acting: if the drawn
tile is playable they must PLAY_TILE it (the validator's no-legal-play
gate on DRAW/PASS enforces "must play" without a special rule); if not,
their only legal action is another DRAW (or PASS once empty). This IS the
common draw-until-playable rule.

**PASS:** reject unless no legal play AND boneyard empty. passStreak + 1,
lastAction kind 'pass', turn advances. If passStreak reaches 2 → BLOCKED:
compare `pipSum` of both hands; lower total scores
`roundDownToFive(sum of BOTH hands' pips)`; equal totals → nobody scores
(`scorerId: null, points: 0`). Stage/matchWinner exactly as in going out.

**START_NEXT_ROUND:** stage 'roundEnd' only. Redeal via `dealRound` with
the SAME rng; roundNumber + 1; starter = the OTHER player from
`roundStarterId`, turn reset to them; center/arms/passStreak/lastAction/
roundResult cleared; scores persist. (Never legal from 'over'.)

## bot.ts

`dominoesBotStrategy: BotStrategy<DominoesPublicState, DominoesPrivateState, DominoesAction>`
(stateless export, no rng — fully deterministic):
- No center and it's the bot's lead: highest double in hand, else highest
  pip-sum tile → PLAY_TILE center.
- Else if any (tile, arm) legal: pick max `scoreForTotal(boardTotal(simulated))`;
  ties → doubles first, then higher pip sum, then first in hand order /
  arm order right,left,up,down. → PLAY_TILE.
- Else DRAW_TILE if `boneyardCount > 0`, else PASS.
- Never returns START_NEXT_ROUND.

## dominoes.test.ts — required coverage

Drive everything through `applyDominoesAction` with seeded games. Where a
known board is needed, build public state by hand (like battleship's
tests do).

1. `createDominoSet`: 28 unique ids, correct pips.
2. Deal: 7/7/14, disjoint, deterministic per seed.
3. `endValue`/`legalArms`: non-spinner left/right; spinner all four; a
   double lead → isSpinner true; non-double lead → up/down never legal.
4. **Scoring (the standardized table — test each):** 5-5 lead → 10 pts;
   6-6 lead → 0 (12); 5-5 then 5-0 right → 10 (10+0); 5-5 then 5-3
   right → 0 (13); non-spinner 6-4 lead → 10; 3-3 played at the end of
   an arm counts 6 (build a board where that makes the total 15 → 15
   pts); unstarted spinner side arms contribute 0.
5. Draw-until-playable: a player with no legal play must DRAW (PASS
   rejected while boneyard non-empty; PLAY of an illegal tile rejected);
   after drawing a playable tile, DRAW is rejected (a legal play exists)
   and PLAY succeeds — same player, turn never moved; after drawing an
   unplayable tile the same player DRAWs again.
6. PASS legality + blocked round: boneyard empty, both stuck → two
   passes → roundResult 'blocked', lower pip total scores both hands
   rounded down to 5, tie → nobody; stage 'roundEnd'.
7. Going out: final-play points AND go-out bonus both credited; opponent
   pips rounded down (e.g. 12 → 10).
8. Rounds: START_NEXT_ROUND from roundEnd redeals 7/7/14 with fresh
   board, starter alternates, scores persist; rejected during 'play' and
   'over'. Reaching ≥150 at a round close sets stage 'over' +
   matchWinnerId; tied ≥150 stays 'roundEnd'.
9. Bot: leads its highest double; picks the scoring play over a
   non-scoring one (construct a hand where exactly one play scores);
   draws when stuck; passes when stuck with empty boneyard. Full
   bot-vs-bot match via `runDominoesBotTurn` + host-applied
   START_NEXT_ROUND to completion: terminates with matchWinnerId, all
   actions accepted, total actions bounded (< 2000).
10. **No-leak:** `deriveSnapshot(session, guestId)` — privateState is the
    guest's own hand only; `JSON.stringify(publicState)` contains no
    tile ids from the opponent's hand or the boneyard (assert
    boneyardCount is a number, no tile arrays beyond arms/center);
    lastAction for a DRAW has `tile: null`; `isJsonSerializable(snapshot)`
    true.
11. Revision: +1 per accepted action, unchanged on rejection.

## Verify

```
npx tsc -b --noEmit
npm test        # all 534 existing pass unchanged + this file
npm run build
```

## Forbidden

Touching any existing file. UI code. `createStandardDeck`. Randomness in
bot.ts. git commands. If verification fails outside your five files, STOP
and report the exact output.

## Report

(1) commands + verbatim tallies; (2) files + one-line description each;
(3) deviations or "no deviations".
