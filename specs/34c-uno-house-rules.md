# Spec 34c — Uno house rules structure + the one seed rule

Follow-up to spec 34/34a/34b (landed, 925 tests). Adds the generic house-
rules pathway (a config-driven list of togglable rules, chosen at game
creation) and exactly one real rule: "draw until you can play" (vs.
standard draw-one-and-pass). Design settled with the user earlier: this
proves the full pathway end to end with minimal risk, since the rule is
contained entirely inside the draw mechanics and touches nothing else
(not the Uno-call window from spec 34b, not turn order, not scoring).

You own EXACTLY these two files — both already exist, edit only. No new
files beyond the one test file listed:

- `src/card-games/uno/state.ts`
- `src/card-games/uno/rules.ts`

And this ONE new file:

- `src/card-games/uno/house-rules.test.ts`

Do NOT touch `deck.ts`, `bot.ts`, `uno.test.ts`, or `uno-call.test.ts`.
UNLESS adding the new `houseRules` field to `UnoPublicState`/
`createUnoGame`'s signature breaks an existing test's fixture construction
(the `buildGame` helpers in `uno.test.ts`/`uno-call.test.ts` build a
`UnoPublicState` object literal directly and will need one more field) —
in that case, fix ONLY the resulting compile errors in those two files (a
one-line addition to each file's fixture-building helper, most likely; do
not change what any existing test asserts) and report exactly what you
touched and why. Do NOT touch any file outside `src/card-games/uno/`. Do
NOT run git.

## Design decisions (locked)

- `UnoHouseRuleKey` — a string literal union with exactly one member for
  now: `'drawUntilPlayable'`. Add more members here later; this spec adds
  exactly one.
- `UNO_HOUSE_RULE_DEFS: { key: UnoHouseRuleKey; label: string; description: string; default: boolean }[]`
  exported from `state.ts` — one entry:
  ```ts
  export const UNO_HOUSE_RULE_DEFS: UnoHouseRuleDef[] = [
    {
      key: 'drawUntilPlayable',
      label: 'Draw until you can play',
      description: 'Keep drawing from the stock until you draw a card you can play, instead of drawing just one and passing if it isn’t playable.',
      default: false,
    },
  ]
  ```
  This array is what a later screens spec will map over to render toggles
  — do not write any per-rule UI or JSX here, this spec is data + rules
  logic only. Define the `UnoHouseRuleDef` interface (the shape shown
  above) and export it alongside.
- `UnoPublicState.houseRules: Record<UnoHouseRuleKey, boolean>` — add this
  field. Not optional, not a partial record — every key in
  `UNO_HOUSE_RULE_DEFS` must always have a real boolean value in this
  record (build it by defaulting from `UNO_HOUSE_RULE_DEFS` — see below).
- `createUnoGame(seatOrder: string[], seed: number, houseRules?: Partial<Record<UnoHouseRuleKey, boolean>>): UnoSession`
  — new optional third parameter. Build the actual stored `houseRules`
  record by starting from `UNO_HOUSE_RULE_DEFS`'s defaults and overlaying
  whatever the caller passed (a helper like
  `resolveHouseRules(overrides?: Partial<Record<UnoHouseRuleKey, boolean>>): Record<UnoHouseRuleKey, boolean>`
  that does exactly this — export it, later specs will need it too when
  wiring the room screen). Existing callers of `createUnoGame(seatOrder,
  seed)` (two-argument form, in `uno.test.ts`/`uno-call.test.ts` if any
  call it directly — grep for it) continue to work unchanged since the
  new parameter is optional and defaults every rule to its `default: false`.
- `START_NEXT_ROUND` in `rules.ts` must carry `houseRules` forward
  unchanged into the new round's state (it's a per-match setting, not
  per-round) — since it already spreads `...publicState` and only
  overrides specific fields, this requires NO code change there at all
  UNLESS you find it does something that would drop the field; if so,
  that's a real bug in the existing code, not something to design around
  — fix it minimally and report it as a finding, don't just silently
  patch around a spread that should already work.

## The rule itself — DRAW_CARD only

This is the ONLY behavior change in this whole spec. Everything else
(PLAY_CARD, CHOOSE_COLOR, PASS, CALL_UNO, going out, scoring, the Uno-call
window) is completely unaffected — do not touch any of that logic.

Add a new helper function in `rules.ts` (not exported, module-private,
same file as `drawFromStock`):

```ts
// Draws one card at a time until either a playable card is drawn or the
// stock (plus recycling) is exhausted. Bounded by the deck's finite size
// — cannot loop forever. Used only when houseRules.drawUntilPlayable is
// true; the standard (false) path still draws exactly one card via the
// existing drawFromStock(..., 1, ...) unchanged.
function drawUntilPlayable(
  currentStock: Zone<UnoCard>,
  discardPile: Zone<UnoCard>,
  activeColor: UnoColor,
  rng: () => number,
): DrawOutcome {
  let stock = currentStock
  let discard = discardPile
  const drawn: UnoCard[] = []
  for (;;) {
    const step = drawFromStock(stock, discard, 1, rng)
    if (!step.ok) return { ok: false }
    stock = step.stock
    discard = step.discardPile
    drawn.push(...step.drawn)
    const justDrawn = step.drawn[0]
    if (isUnoPlayable(justDrawn, topCard(discard)!, activeColor)) {
      return { ok: true, stock, discardPile: discard, drawn }
    }
  }
}
```

In `DRAW_CARD`'s handler, where it currently calls
`drawFromStock(currentStock, publicState.discardPile, 1, rng)`: branch on
`publicState.houseRules.drawUntilPlayable` — if true, call
`drawUntilPlayable(currentStock, publicState.discardPile, publicState.activeColor, rng)`
instead; if false, the existing single-card `drawFromStock` call is
unchanged. Both return the same `DrawOutcome` shape, so the rest of the
handler (the `!draw.ok` blocked-round check, `onStockChange`, building
`newHand` via `addCards(myHand, draw.drawn)`, `lastAction`) needs almost
no change — EXCEPT:
- `lastAction.drewCount` should be `draw.drawn.length` (not hardcoded `1`)
  so a UI can show "drew 3 cards" when the house rule caused multiple
  draws — update this regardless of which branch was taken (it's `1` in
  the standard case anyway, so this is a strict generalization, not a
  behavior change for the default-off case).
- Since `drawUntilPlayable` only ever returns successfully with a drawn
  card that IS playable (or fails entirely), the existing "is the drawn
  card now playable?" branch after the draw becomes unconditionally true
  whenever `houseRules.drawUntilPlayable` is on and `draw.ok` is true —
  do NOT special-case this; the existing `isUnoPlayable(drawnCard, ...)`
  check after the draw will naturally evaluate to true in this case
  (since `drawnCard` = the last element of `draw.drawn`, which
  `drawUntilPlayable`'s own loop already confirmed is playable) — same
  code path, no branch duplication needed. Just make sure `drawnCard` is
  taken as `draw.drawn[draw.drawn.length - 1]` (the LAST drawn card, the
  one that broke the loop) rather than `draw.drawn[0]` (correct already
  for the standard 1-card case since first === last there, but would be
  wrong for the multi-card case if left as `[0]`).

That's the entire behavior change. Do not add a `CALL_UNO` interaction, a
turn-order interaction, or anything scoring-related — none of those are
touched by this rule.

## house-rules.test.ts (vitest, ≥ 12 tests)

Build fixtures the way `uno.test.ts` does (small local `buildGame`-style
helper, following that file's pattern — duplicate the minimal amount you
need, same as `uno-call.test.ts` did). Cover at minimum:

- `resolveHouseRules()` with no argument returns every key from
  `UNO_HOUSE_RULE_DEFS` at its `default` value.
- `resolveHouseRules({ drawUntilPlayable: true })` overlays correctly,
  leaving any other future keys (there are none yet, but the function
  must not assume exactly one key forever) at their defaults.
- `createUnoGame` with no third argument produces `houseRules.drawUntilPlayable === false`.
  `createUnoGame` with `{ drawUntilPlayable: true }` produces `true`.
- With the rule OFF (default): `DRAW_CARD` behaves exactly as spec 34
  originally specified — draws exactly 1 card regardless of whether it's
  playable (construct a fixture where the top of stock is deliberately
  NOT playable and confirm exactly 1 card is drawn, `drewCount === 1`,
  turn advances since it's unplayable) — this is a regression test
  proving the default behavior is byte-identical to before this spec.
- With the rule ON: construct a stock where the first 1-2 cards on top are
  NOT playable against the current top/activeColor but a later one IS —
  confirm `DRAW_CARD` draws MULTIPLE cards (all the unplayable ones plus
  the first playable one), all land in the player's hand, `handCounts`
  reflects the full count increase, `stockCount`/real stock both drop by
  the same total, `lastAction.drewCount` equals the number actually
  drawn, and the turn STAYS with the player (since the final drawn card
  is playable) — they may now play it or pass.
- With the rule ON and EVERY remaining card (stock + enough of discard to
  recycle) unplayable: `drawUntilPlayable` exhausts everything and returns
  `ok: false`; `DRAW_CARD` falls into the same blocked-round fallback as
  the standard path (`stage: 'roundOver'`, `roundResult: null`, no score
  change) — construct this fixture explicitly, don't just assert it in
  the abstract.
- `houseRules` survives `START_NEXT_ROUND` unchanged (deal a fresh round,
  confirm the SAME `houseRules` record — same rule set, same values — is
  still present after the round transition).
- `houseRules` is present and correct on the very first game state
  (`createUnoGame`'s initial `publicState.houseRules`), not just after
  some action.

## Verify before reporting

`npx tsc -b --noEmit` silent. `npm test` all green — report the new total
(925 + your new test count, ≥ 12, so ≥ 937). Separately re-run
`npx vitest run src/card-games/uno/uno.test.ts` AND
`npx vitest run src/card-games/uno/uno-call.test.ts` in isolation and
confirm both are STILL fully green (63 and 25 respectively) with at most
the minimal fixture touch-up described above — report exactly what, if
anything, needed touching in either file and why.
