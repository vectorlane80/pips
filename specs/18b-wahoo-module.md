# Spec 18b: Wahoo game module (M2 — rules/state/bot, no UI)

Create exactly:
- `src/board-games/wahoo/state.ts`
- `src/board-games/wahoo/rules.ts`
- `src/board-games/wahoo/bot.ts`
- `src/board-games/wahoo/wahoo.test.ts`

Study first (read only): `src/engine/{sync,turn-engine,rng,bot}.ts`,
`src/board-games/wahoo/board.ts` (spec 18 — use `trackIndexFor` and the
corner constants), `src/board-games/battleship/{state,rules}.ts` for the
session/validator idiom. Imports: `../../engine/*` and `./board.ts`
only. Every rule below is final (charter, user-approved).

## state.ts

```ts
export type WahooSeatCount = 2 | 3 | 4
// marble position: -1 base, -2 center, 0..51 track (relative to own arm's
// entry), 52..55 home lane (52 innermost, 55 deepest)
export type MarblePos = number

export interface WahooPublicState {
  stage: 'play' | 'over'
  turn: TurnState<'roll' | 'move'>       // phase 'roll' = awaiting ROLL, 'move' = die shown, awaiting MOVE
  seatArms: Record<string, number>        // playerId -> arm 0..3
  positions: Record<string, MarblePos[]>  // playerId -> 4 marbles
  centerBy: { playerId: string; marbleIdx: number; entryCornerRel: 12 | 25 } | null
  die: number | null                      // current roll while phase 'move'
  sixStreak: number                       // consecutive 6s in the current player's chain
  lastMoved: { playerId: string; marbleIdx: number } | null  // for the triple-six bust
  lastEvent: WahooEvent | null            // drives status + sounds
  winnerId: string | null
  mutedArm: number | null                 // 3-player games: the unused arm
}

export type WahooEvent =
  | { kind: 'roll'; by: string; die: number }
  | { kind: 'move'; by: string; marbleIdx: number; bumpedId: string | null }
  | { kind: 'out'; by: string; bumpedId: string | null }       // brought a marble out of base
  | { kind: 'shortcut'; by: string; bumpedId: string | null }  // entered center
  | { kind: 'exit'; by: string; bumpedId: string | null }      // left center
  | { kind: 'bust'; by: string }                               // triple six
  | { kind: 'pass'; by: string }                               // no legal move
  | { kind: 'win'; by: string }

export type WahooAction =
  | { type: 'ROLL' }
  | { type: 'MOVE'; move: WahooMove }     // one of the legal moves for the shown die

export interface WahooMove {
  marbleIdx: number
  kind: 'out' | 'advance' | 'shortcut' | 'exit'
}
```

Private states: `Record<string, Record<string, never>>` — empty objects
per player (everything is public), still one entry per player (engine
contract).

`createWahooGame(playerIds: string[], seed: number): WahooSession` —
2–4 ids. `WahooSession = { session, rng }`. Arm assignment with the rng:
2 players → one of the two opposite pairs at random, then shuffle which
player gets which arm; 3 players → drop one random arm (store it in
`mutedArm`), shuffle the rest; 4 → shuffle all. Turn order = playerIds
order as given (the room already randomized seating); phase 'roll'.
All marbles -1.

Pure helpers (exported):
- `legalMoves(publicState, playerId, die): WahooMove[]` — the complete
  move generator; the validator and bot both use it. Rules:
  - `out` (die 1 or 6, ≥1 marble in base, own entry hole (relative 0)
    not occupied by own marble). Bumps an opponent sitting there.
  - `advance` a track marble: new relative = pos + die. If new ≤ 51:
    legal unless own marble occupies it (in ABSOLUTE terms — two
    players' relative coords differ; convert via trackIndexFor +
    seatArms to compare). If new ≥ 52: entering the lane — legal only
    if new ≤ 55 AND no own marble sits on any lane slot in the path or
    the target (exact count, no jumping own lane marbles; overshoot
    past 55 is illegal). Lane marbles can also `advance` within the
    lane by the same no-pass/exact rules.
  - `shortcut`: marble on track with relative pos p, for a valid corner
    c ∈ {12, 25}: p ≤ c and die === (c − p) + 1, center empty or
    occupied by an OPPONENT (bump), and no own... (path is a jump — no
    intermediate blocking; only the center's occupant matters).
  - `exit`: marble in center owned by this player, die 1 or 6; target =
    diagonal corner (entry 12 → relative 38, entry 25 → relative 51),
    illegal if own marble occupies the target; opponent there is
    bumped.
- `applyMove(...)` internal to rules.ts is fine; keep state.ts to
  types + createWahooGame + legalMoves + small position utilities
  (`absoluteIndex(seatArms, playerId, rel)` etc.).

## rules.ts

`makeValidator(rng, setDie...)` — no, simpler: the die roll needs the
host rng. Follow the rummy closure pattern:
`applyWahooAction(wh, playerId, action)` / `runWahooBotTurn(wh,
playerId, strategy)` wrap `applyAction`/`runBotTurn` with a validator
closed over `wh.rng`.

**ROLL** — stage 'play', current player, phase 'roll'. die =
`1 + Math.floor(rng() * 6)`. Set `die`, phase → 'move'
(`setPhase`), event `roll`. If `legalMoves(state, playerId, die)` is
EMPTY after this roll: resolve immediately in the same action —
- if die === 6: six chain still applies (see MOVE) — treat as a
  no-op move: increment handled below? NO — keep it simple and
  uniform: when there are no legal moves, emit event 'pass', clear
  die, reset sixStreak to 0, phase 'roll', `advanceTurn`. (A 6 with no
  legal move does NOT grant another roll — the chain needs a move.)
**MOVE** — stage 'play', current player, phase 'move', and `action.move`
must be a member of `legalMoves(state, playerId, die)` (deep-compare
kind + marbleIdx + implied target; recompute server-side, never trust
the client's coordinates). Apply position changes; bump = opponent
marble at the landing absolute hole (or center) → their pos -1, named
in the event. Update lastMoved. Then:
- Win check: all 4 of the player's marbles ≥ 52 → stage 'over',
  winnerId, event 'win'.
- Six chain: if die === 6 → sixStreak + 1. If sixStreak reaches 3:
  BUST — the marble just moved (lastMoved) returns to base (-1; if it
  was the center, clear centerBy), event 'bust', sixStreak 0, die
  null, phase 'roll', advanceTurn. Else (streak 1–2): extraTurn with
  phase 'roll' (same player rolls again), die null.
- Non-6: sixStreak 0, die null, phase 'roll', advanceTurn.
Center bookkeeping: entering sets `centerBy` (player, marble, entry
corner rel); exiting/bumping out clears it.

## bot.ts

`wahooBotStrategy` (stateless, deterministic): if phase 'roll' →
`{ type: 'ROLL' }`. Else pick from `legalMoves` by priority:
move that wins now → move that bumps an opponent → lane entry
(target ≥ 52) → `shortcut` → `exit` → `out` → the `advance` whose
marble has the highest relative position (closest to home). Ties by
lower marbleIdx. Return `{ type: 'MOVE', move }`.

## wahoo.test.ts — required coverage (drive via applyWahooAction; build
fixed states by hand for targeted cases like battleship's tests do)

1. createWahooGame: 2P → opposite arms; 3P → mutedArm set, three
   distinct arms; 4P → all four; deterministic per seed; positions all
   -1; phase 'roll'.
2. ROLL out of turn / during 'move' phase rejected; MOVE during 'roll'
   rejected; MOVE not in legalMoves rejected (wrong marble, wrong
   kind).
3. Out: needs 1/6; blocked by own marble on entry; bumps opponent on
   entry (their pos → -1).
4. Advance: exact landing; own-marble block (cross-seat absolute
   collision — two seats, positions that collide absolutely but not
   relatively); bump on track.
5. Lane: enter with exact count; overshoot rejected; no passing own
   lane marbles; lane-internal advance; back-to-front fill reachable.
6. Shortcut: from p=10 die 3 via corner 12 (10 ≤ 12, 12−10+1=3) legal;
   corner 38/51 equivalents never offered; center occupied by own →
   illegal, by opponent → bump (their marble to base, centerBy
   replaced).
7. Exit: die 1/6 only; entry 12 → lands rel 38; entry 25 → rel 51;
   blocked by own marble on the corner; bumps opponent.
8. Six chain: roll 6 + move → same player phase 'roll' again
   (turnNumber bumped); second 6 same; third 6 → bust: lastMoved
   marble back to base, turn passes. A 6 with NO legal move → pass,
   streak dies, no extra roll.
9. No legal move on any roll → 'pass' event, turn advances, die
   cleared.
10. Win: fourth marble reaching the lane ends the game immediately;
    stage 'over'; further actions rejected.
11. Full bot games via runWahooBotTurn at 2, 3, AND 4 seats with
    host-applied rolls — each terminates with a winner within 5000
    actions, every action accepted.
12. Serialization: `isJsonSerializable(snapshot)` for every player;
    revision +1 per accepted action.

## Verify

```
npx tsc -b --noEmit
npm test        # 606 existing + this file
npm run build
```

## Forbidden

Touching existing files; UI; card-engine imports; Math.random (rng
only); git.

## Report

(1) commands + tallies; (2) files; (3) deviations or "no deviations".
