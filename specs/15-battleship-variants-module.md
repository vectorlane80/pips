# Spec 15: Battleship rule variants — module (M1, no UI)

Add three fire modes to the Battleship game module. Every decision is
made. Modify ONLY `src/board-games/battleship/state.ts`,
`src/board-games/battleship/rules.ts`, and
`src/board-games/battleship/battleship.test.ts`. Do NOT touch `bot.ts`
(the strategy is mode-independent) or `oscar.test.ts`.

## state.ts

```ts
export type BattleshipVariant = 'standard' | 'streak' | 'free'
```

- Add `variant: BattleshipVariant` to `BattleshipPublicState`.
- `createBattleshipGame(playerIds: [string, string], seed: number, variant: BattleshipVariant = 'standard')`
  — store it in the public state. The default parameter keeps every
  existing call site and test compiling and behaving exactly as today.

## rules.ts — FIRE handler only (PLACE_FLEET unchanged)

- Turn check: currently rejects when `currentPlayer(turn) !== playerId`.
  Skip this check entirely when `variant === 'free'` (any seated player
  may fire at any time during battle). Keep it for the other two.
- Turn update after a resolved shot (when the match does not end):
  - `'standard'`: `advanceTurn(turn, 'fire')` — unchanged behavior.
  - `'streak'`: shot hit a ship (result 'hit' or 'sunk') →
    `extraTurn(turn, 'fire')` (same player, turnNumber+1); miss →
    `advanceTurn(turn, 'fire')`.
  - `'free'`: `extraTurn(turn, 'fire')` always — turnNumber becomes a
    pure shot counter; the current-player pointer is meaningless and
    never consulted in this mode.
- When the match ends (all sunk): leave the turn untouched, exactly as
  today, in all variants.
- Everything else (cell validation, repeat-cell rejection, hit/miss/sunk
  resolution, reveals, scores, lastShot, winner) is identical across
  variants — do not fork any of it.

## battleship.test.ts — add a `describe('variants')` block

Keep every existing test unchanged (they run on the 'standard' default).
Add, driving through `applyBattleshipAction` with known fleets (reuse the
existing fleetA/fleetB/place helpers):

1. `createBattleshipGame(..., 'streak').session.publicState.variant === 'streak'`;
   default call → 'standard'.
2. Streak: player hits → outcome ok, `currentPlayer` unchanged,
   `turnNumber` incremented; the same player fires again immediately and
   is accepted; then misses → turn passes to the opponent; opponent's
   out-of-turn fire while the streak holder is up → rejected.
3. Streak: sinking a ship also keeps the turn (result 'sunk' → same
   player may fire again).
4. Free: player A fires, then A fires again immediately (accepted), then
   B fires (accepted), then A (accepted) — arbitrary interleaving all ok;
   `turnNumber` incremented per accepted shot.
5. Free: repeat-cell still rejected; out-of-range still rejected; firing
   during 'placing' still rejected; PLACE_FLEET double-submit still
   rejected.
6. Free: end of match — the shot completing all five sinks sets stage
   'over' + winnerId; any subsequent FIRE by either player is rejected
   ('over' stage), so no post-game shots and no tie path.
7. Streak + free: full bot-vs-bot matches to completion (mirror the
   existing standard bot-vs-bot test; in free mode alternate the two
   players manually shot-by-shot regardless of turn state; in streak mode
   drive whoever `currentPlayer` reports). Both terminate with a winner
   and a 5 score in ≤ 200 accepted shots.
8. No-leak regression: run the existing snapshot no-leak assertions once
   under 'free' (build the game with the variant, place both fleets,
   fire a few interleaved shots, assert the guest snapshot's publicState
   contains no ship id before anything sinks and `variant` round-trips
   through JSON).

## Verify

```
npx tsc -b --noEmit
npm test        # all existing 514 pass + new variant tests
npm run build
```

## Forbidden

Touching bot.ts, oscar.test.ts, any file outside the three listed, UI
code, git commands. No behavior change for 'standard'.

## Report

(1) commands + verbatim tallies; (2) what changed per file; (3) deviations
or "no deviations".
