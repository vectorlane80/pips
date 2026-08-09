# Spec 15a: make BattleshipPublicState.variant required

In `src/board-games/battleship/state.ts` the new field was declared
`variant?: BattleshipVariant` (optional, "undefined ≡ standard"). Spec 15
required it non-optional — an absent variant silently acting as 'standard'
is exactly the fragility the type system should prevent, and UI code would
have to `?? 'standard'` everywhere.

Change it to `variant: BattleshipVariant` (remove the `?` and the comment),
then fix every place that fails to compile — expected to be only hand-built
public states in `src/board-games/battleship/battleship.test.ts` (and
possibly `oscar.test.ts` — you MAY touch it for this one mechanical
addition only): add `variant: 'standard'` to each object literal.
`createBattleshipGame` already always sets it; do not change rules.ts.

Verify all three: `npx tsc -b --noEmit`, `npm test` (523 green),
`npm run build`. Touch nothing beyond the described edits. Report
commands + tallies + files touched + deviations.
