# Spec 34a — Uno module: address Oscar's two review nits

Follow-up to spec 34 (already landed, 899 tests passing). Oscar's review of
that module was clean (approve, no blockers) but flagged two non-blocking
items to close out rather than leave behind:

You own EXACTLY these two files — both already exist, edit only:

- `src/card-games/uno/state.ts`
- `src/card-games/uno/uno.test.ts`

Do NOT touch any other file (in particular, do not touch `rules.ts` or
`bot.ts` — neither nit requires a behavior change in either). No new files.

## Nit 1 — document that `turn`/`hasDrawnThisTurn` are stale outside stage 'play'

In `rules.ts`, `finishRoundByGoingOut` and `blockedRound` never reset
`turn.currentIndex` or `hasDrawnThisTurn` when a round ends — they're
harmless leftovers (every action is already rejected once `stage !==
'play'`, and `START_NEXT_ROUND` builds a fresh `TurnState` and resets
`hasDrawnThisTurn` explicitly) but a future reader could mistake the stale
value for something meaningful. Add a one-line comment directly above the
`turn` and `hasDrawnThisTurn` fields in the `UnoPublicState` interface in
`state.ts` — something like:

```ts
export interface UnoPublicState {
  stage: UnoStage
  // Only meaningful in stage 'play' — a round-ending action (going out, or
  // the blocked-round fallback) leaves these at their pre-transition
  // values rather than resetting them; nothing reads them outside 'play',
  // and START_NEXT_ROUND rebuilds turn fresh and resets hasDrawnThisTurn.
  turn: TurnState<'play'>
  ...
  hasDrawnThisTurn: boolean
  ...
}
```

Place the comment once, above whichever of the two fields comes first in
the interface as currently written — do not duplicate it on both fields,
and do not change the fields' types or add a runtime reset. This is a
documentation-only change.

## Nit 2 — a property-based invariant smoke test

Add ONE new test (not a whole new describe block hierarchy — one `it`
inside a new `describe('property-based invariants')` block at the end of
`uno.test.ts`) that runs many random legal-action sequences across random
player counts and asserts core invariants never break. Concretely:

- For `trial` in 0..49 (50 trials): pick `N` = `2 + (trial % 9)` (cycles
  2..10across trials so every seat count in range gets covered), build a
  fresh game via `createUnoGame` with `N` sequential player ids (`p0`..`p{N-1}`)
  and seed `trial` (reuse `createUnoGame` directly, not the `buildGame`
  test helper — this test needs a REAL fresh deal, not a hand-constructed
  fixture).
- Drive up to 300 actions per trial using a **bot for every seat**
  (`runUnoBotTurn` with `unoBotStrategy` from `bot.ts` — every seat is a
  bot, so the sequence is automatically always legal; this test is not
  about generating illegal input, it's about proving invariants hold
  across a long, varied REAL sequence of legal play). Stop the trial early
  if `stage === 'over'`.
- After EVERY single action inside the loop (not just at the end of the
  trial), assert:
  1. `publicState.stockCount === cardCount(uno.stock)` (the desync check
     Oscar specifically tried to break by hand and couldn't — prove it
     holds generatively too).
  2. Total card conservation: sum of every hand's `cardCount` (read each
     player's private hand off `uno.session.privateStates`) + `cardCount`
     of `uno.stock` + `cardCount(publicState.discardPile)` === 108.
  3. Every value in `publicState.handCounts` equals the real
     `cardCount` of that player's actual private hand (no drift between
     the count field and the real Zone).
  4. `isJsonSerializable(publicState)` is true (import from
     `../../engine/sync.ts`, already used elsewhere in this file for the
     wire-safety test — reuse the same import, don't add a duplicate one).
- If a trial's action is rejected (`outcome.ok === false`) treat that as a
  hard test failure and fail loudly with the trial number, action index,
  and the rejection reason in the assertion message — a bot should never
  produce an illegal action against its own validator; if this actually
  fires during your own verification run, that is a REAL bug (either in
  the bot or the validator) and must be reported honestly as a finding,
  not silently worked around by e.g. catching and ignoring the rejection.

Keep the trial/action counts exactly as specified (50 trials × up to 300
actions = up to 15,000 assertions of each of the 4 invariants) — this is
deliberately sized to be a real generative check while still running in
well under a second, consistent with this suite's existing speed.

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` all green — report the new total
test count (should be 899 + 1 = 900; the property test is one `it`, not
many, even though it runs thousands of assertions internally). If the
property test reveals a real invariant violation, do NOT paper over it —
stop and report the exact trial/action/reason honestly; that would be a
genuine finding in already-landed code, which I need to know about
immediately, not a spec-compliance failure on your part.
