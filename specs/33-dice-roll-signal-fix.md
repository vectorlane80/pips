# Spec 33 — Fix suppressed dice sound/animation on a value-coincidence reroll

Real, reproducible bug, confirmed by reading the code (not yet caught by a
user reliably reproducing it live — this is exactly why it's easy to miss).

## Root cause

Both `src/hooks/useDiceAnimation.ts` (the shared 7-frame flicker, used by
Farkle and Yahtzee) and each of those two screens' own sound-effect blocks
detect "did a genuine roll happen" by diffing the dice **values** between
renders (`dice.map(d => d.val).join(',')`). If a genuine reroll happens to
land on the exact same face values as the immediately preceding state, the
diff sees no change and silently skips BOTH the flicker animation and the
roll sound — even though a real roll occurred.

This is far more likely than it sounds, especially in **Yahtzee**: held
dice keep their old value, so often only 1–2 dice are actually rerolling
(e.g. one unheld die has a 1-in-6 chance per roll of landing on the exact
value it already showed). Over many games this WILL happen occasionally —
matching a live user report exactly ("the third roll landed the same dice
as the second roll... the sound and animation was suppressed").

## The fix

Stop detecting "did a roll happen" from dice values. Use a signal that's
guaranteed to change on every genuine roll action, independent of what
values land.

### 1. `src/hooks/useDiceAnimation.ts`

Add a second, required parameter: `rollSignal: string | number`. The
effect's dependency array and its "should I start a new flicker" trigger
use `rollSignal` instead of the current `valuesKey`. Keep everything else
identical: the `dice.length === 0` early-return (clears display, no
flicker), the 7-frame/60ms flicker mechanics, held dice showing their real
value throughout. Remove the now-unused internal `valuesKey` computation
if nothing else in the file needs it.

```ts
export function useDiceAnimation(dice: Die[], rollSignal: string | number) {
  ...
  useEffect(() => {
    if (dice.length === 0) { setDisplay([]); return }
    const id = ++runId.current
    ...
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollSignal, dice.length])
  ...
}
```

### 2. `src/screens/YahtzeeTable.tsx`

`y.rollsLeft` already changes on every genuine roll (3→2→1→0, confirmed
reliable — it's already used as the dependency for the existing
`useLayoutEffect` that repartitions dice order, a few lines above) and
never coincidentally repeats mid-turn. Use it as the roll signal:

- `useDiceAnimation(y.dice, y.rollsLeft)` — pass rollsLeft as the new
  second argument.
- In the sound-effect block: replace the roll-detection condition
  `valuesKey !== p.valuesKey && y.dice.length > 0` with
  `y.rollsLeft !== p.rollsLeft && y.dice.length > 0` (rollsLeft is
  already tracked in `soundSigRef`, just wasn't being used for this
  check). Update the `die-select` branch's "still the same roll" guard
  from `valuesKey === p.valuesKey` to `y.rollsLeft === p.rollsLeft` to
  match (semantically equivalent for a pure hold-toggle, which never
  changes rollsLeft, but keep the two branches consistent). You may keep
  `valuesKey` for the `selKey`-adjacent uses if still needed, but the
  ROLL-detection specifically must use rollsLeft, not values.

### 3. `src/screens/FarkleTable.tsx`

Farkle has no existing per-roll counter, but `f.kept.length` combined
with `f.dice.length` is provably reliable: a reroll is only ever accepted
when at least one die was just selected-and-kept (the reducer rejects
`farkleRoll` outright if dice are showing and nothing is selected — check
`farkleRoll` in `src/state/room.ts` to confirm this invariant before
relying on it), so `kept.length` strictly increases (by the count just
kept) or resets to 0 (hot dice, all 6 kept) between any two consecutive
genuine rolls — always different from its immediately-prior value. Build:

```ts
const rollSig = `${f.kept.length}:${f.dice.length}`
```

- `useDiceAnimation(f.dice, rollSig)`.
- In the sound-effect block: replace `valuesChanged = valuesKey !== p.valuesKey`
  with a comparison against a newly-tracked `rollSig` in `soundSigRef`
  (add `rollSig` to the ref alongside the existing fields). The `hotDice`
  detection (`p.keptLen > 0 && f.kept.length === 0 && f.dice.length === 6`)
  and `busted` detection stay as they are — they already key off
  `keptLen`/`dice.length`/`log.length`, not values, so they're unaffected.
  Update the `die-select` branch's guard from `valuesKey === p.valuesKey`
  to `rollSig === p.rollSig`.

## Tests

Neither screen has its own test file today (screens in this codebase
generally don't — game logic in `src/games/farkle.ts`/`yahtzee.ts` and
`src/state/room.ts` does). Do not add screen-level tests. If you touch
`src/state/room.ts` at all while confirming the reroll-requires-a-keep
invariant, do NOT modify it — this spec is screen/hook-only, read-only
confirmation.

## Verify before reporting

`npx tsc -b --noEmit` silent (the `useDiceAnimation` signature change
means BOTH call sites must be updated together or this fails — confirm
both are). `npm test` all green (unaffected count, report it). Report the
exact diffs for all three files and verbatim final outputs. Also state
explicitly whether you found any OTHER caller of `useDiceAnimation`
beyond Farkle/Yahtzee (there shouldn't be — Wahoo has a comment
referencing it but reimplements the flicker inline, not via this hook —
confirm this by grepping, don't assume).
