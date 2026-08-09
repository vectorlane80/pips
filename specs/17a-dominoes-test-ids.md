# Spec 17a: fix tile-id normalization in dominoes.test.ts

The module follows spec 17's convention: `DominoTile.id = `${a}-${b}`` with
`a <= b`, and the test file's own `tile()` helper normalizes the same way.
But test literals reference unnormalized ids (`tileId: '6-4'`, `'5-0'`,
`'5-2'`, …) which can never match a hand tile → 9 failures, all
`outcome.ok === false`.

Fix ONLY `src/board-games/dominoes/dominoes.test.ts`:

1. Normalize every `tileId:` literal to lo-hi form ('6-4' → '4-6',
   '5-0' → '0-5', '5-2' → '2-5', etc. — audit every PLAY_TILE in the
   file).
2. Where an assertion assumed the unnormalized center orientation, fix it
   to the normalized one: a "6-4" lead stores center `{ a: 4, b: 6 }`, so
   the LEFT end is 4 and the RIGHT end is 6 — e.g. the double-lead test's
   expectations become `legalArms(tile(4, 1), pub2)` → `['left']` and
   `legalArms(tile(6, 1), pub2)` → `['right']`, and
   `expect(pub2.center).toEqual({ a: 4, b: 6 })` if asserted. Audit every
   center/arm expectation involving a non-double tile for the same
   orientation assumption. (Orientation of a lead is cosmetic — totals
   like 6-4 → 10 are unaffected.)
3. Do NOT touch state.ts / scoring.ts / rules.ts / bot.ts. If a failure
   survives that is NOT explained by id normalization or orientation,
   STOP and report it verbatim — that would be a real module bug and the
   lead wants it, not a workaround.

Verify: `npx tsc -b --noEmit`; `npm test` fully green (534 existing +
this file's full count); `npm run build`. Report commands + tallies +
deviations.
