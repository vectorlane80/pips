# Spec 25 — Mexican Train module: 2–8 seats

You own EXACTLY these files (all edits, no new files):

- `src/board-games/mexican-train/state.ts`
- `src/board-games/mexican-train/rules.ts`
- `src/board-games/mexican-train/bot.ts` (likely no change — verify only)
- `src/board-games/mexican-train/mexican-train.test.ts`

The module currently hardcodes exactly 4 players. Generalize to **2–8**,
keeping everything else (engine pre-pull, draw/pass rules, double extra
play, 13 rounds, lowest-pips wins, earliest-seat tie-break) identical.

Decisions, all locked:

1. **Types**: `seatOrder` becomes `string[]` (length 2–8; export
   `MT_MIN_SEATS = 2`, `MT_MAX_SEATS = 8`). Lane keys stay strings:
   `'mex' | 'p0'…'p7'` — type as `export type MTLaneKey = string` is too
   loose; use a template-literal type `'mex' | \`p\${number}\`` if it
   types cleanly, else a plain string alias with a comment. `trains`
   becomes `Record<string, MTPlacedTile[]>` holding exactly seatCount
   lanes + 'mex'; `open` becomes `Record<string, boolean>` with one key
   per seat lane. Build both from seatOrder at deal time.
2. **Hand sizes scale** (the published double-12 table; the flat 13 can't
   deal 8 hands from 90 tiles): export
   `MT_HAND_SIZES: Record<number, number> = {2: 16, 3: 16, 4: 15, 5: 14, 6: 12, 7: 10, 8: 9}`
   keyed by seat count. `dealMTRound` deals `MT_HAND_SIZES[playerIds.length]`
   per seat from the 90 after the engine pull; boneyard is the rest.
   (4-player games move from 13 to the standard 15 — deliberate.)
3. **Blocked round**: the pass-streak threshold becomes `seatOrder.length`
   (was hardcoded 4).
4. **Starter rotation**: round r starts seat `r % seatOrder.length`.
5. `createMexicanTrainGame(playerIds: string[], seed)` validates nothing
   about length (the room enforces 2–8; no defensive code) but all
   internals derive from `playerIds.length`.
6. **Tests**: update every fixture that assumes 4 seats; keep the full
   existing behavioral coverage passing at 4 seats (now 15-tile hands);
   ADD: a 2-player deal (16/16, boneyard 58, blocked after 2 passes,
   starter alternates by round), an 8-player deal (9 each, boneyard 18,
   lanes p0–p7 all present, blocked after 8 passes), and a 3-player
   full-round sanity (rotation r%3). Keep ≥ the current 39 tests.

Verify: `npx tsc -b --noEmit` will FAIL outside your files (App.tsx and
screens still assume 4 — a later spec fixes them); verify your slice with
`npx vitest run src/board-games/mexican-train/` all green and report the
remaining tsc errors' files honestly (they must all be in App.tsx or
src/screens/MexicanTrain*).
