# Spec 45 — Uno house rule: stacking draw cards

Follow-up to spec 34c (landed — the generic house-rules pathway plus
`drawUntilPlayable`). Adds a second toggle, `stackDraw`: playing a `draw2`
on a `draw2`, or a `wild4` on a `wild4`, passes the (growing) draw penalty
to the next player instead of resolving it immediately, until someone
can't or won't continue the chain and draws the whole accumulated pile.
Families do NOT mix — a `wild4` cannot be stacked on a `draw2` or vice
versa. This is the single most common real-world Uno house rule and the
next natural rule to add to `UNO_HOUSE_RULE_DEFS` after `drawUntilPlayable`.

You own EXACTLY these files — all already exist, edit only. No files
beyond the two test files listed:

- `src/card-games/uno/state.ts`
- `src/card-games/uno/rules.ts`
- `src/card-games/uno/bot.ts`
- `src/screens/UnoTable.tsx` (+ `UnoTable.css` if a new class is genuinely
  needed — prefer reusing existing classes/patterns first)

And these NEW files:

- `src/card-games/uno/stack-house-rule.test.ts`
- Any UI-only assertions can live in the existing `UnoTable.test.ts` if one
  exists (check first) — otherwise add to the new test file above only if
  it's engine-level; do not create a second new test file for UI.

Do NOT touch `deck.ts`, `uno.test.ts`, `uno-call.test.ts`,
`house-rules.test.ts`, `UnoRoom.tsx`, `UnoResults.tsx`,
`UnoRulesOverlay.tsx`, or `UnoCard.tsx`. `UnoRoom.tsx` needs NO change —
it already maps generically over `UNO_HOUSE_RULE_DEFS` to render a toggle
for any entry in that array, so the new `stackDraw` def gets a working
toggle for free. UNLESS the new state fields break an existing test
fixture's object-literal construction (same caveat as spec 34c) — in that
case fix ONLY the resulting compile errors, minimally, and report exactly
what and why. Do NOT touch any file outside those listed. Do NOT run git.

## Design decisions (locked)

- New `UnoHouseRuleKey` member: `'stackDraw'`. New entry in
  `UNO_HOUSE_RULE_DEFS`:
  ```ts
  {
    key: 'stackDraw',
    label: 'Stack draw cards',
    description: 'Play a Draw Two on a Draw Two (or a Wild Draw Four on a Wild Draw Four) to pass the penalty along instead of drawing — it keeps growing until someone can’t or won’t continue it.',
    default: false,
  }
  ```
  Default `false` everywhere the rule is off — every existing test and
  every existing game must be byte-identical to today when `stackDraw` is
  false. This is the load-bearing constraint of the whole spec: the
  `stackDraw`-off code path through `PLAY_CARD`'s `draw2`/`wild4` cases and
  `CHOOSE_COLOR`'s wild4 branch must be EXACTLY the code that exists today,
  untouched, reached via an `if (!publicState.houseRules.stackDraw) { ...
  existing code, verbatim... }` branch (or equivalent) — not rewritten to
  a unified implementation that happens to degenerate to the same result.
  Reviewers should be able to see the untouched original branch survives.
- No mixing: a pending `draw2` stack can only be continued by another
  `draw2`; a pending `wild4` stack can only be continued by another
  `wild4`. This is the standard, least-controversial stacking variant.
  There is no house-rule toggle for mixed stacking — out of scope.
- New `UnoPublicState` field:
  ```ts
  pendingStack: { kind: 'draw2' | 'wild4'; total: number } | null
  ```
  `null` whenever no stack is in progress (always true when `stackDraw` is
  off — this field simply never becomes non-null in that case). `total` is
  the cumulative draw count owed by whoever breaks the chain (2, 4, 6, 8…
  for draw2 chains; 4, 8, 12… for wild4 chains). Add it to
  `createUnoGame`'s initial state (`null`) and to `START_NEXT_ROUND`'s
  reset block (`null`, alongside `pendingWild: null`, `unoWindow: null`).
- Chain mechanics, `stackDraw: true` only:
  - Playing a `draw2` when `publicState.pendingStack === null`: instead of
    the existing immediate-draw-for-`skippedPlayer` + `skipNext` behavior,
    set `pendingStack: { kind: 'draw2', total: 2 }`, advance the turn
    NORMALLY (`advanceTurn`, not `skipNext` — the next player in line is
    now "on the hook" and gets a real turn to respond), `hasDrawnThisTurn:
    false`. No draw happens yet. `activeColor` still updates to the
    played card's color as normal.
  - Playing a `wild4` when `pendingStack === null`: same shape, but the
    stack doesn't open until the color is chosen (mirrors the existing
    `pendingWild` gate) — `PLAY_CARD` still sets `pendingWild: { cardId,
    isDraw4: true }` exactly as today; `CHOOSE_COLOR`'s `isDraw4` branch is
    where `pendingStack: { kind: 'wild4', total: 4 }` gets set (instead of
    the existing immediate draw-4 + `skipNext`), turn advances NORMALLY.
  - While `pendingStack !== null`, it is the current player's turn to
    respond. Their ONLY legal actions are: play a card of the matching
    `pendingStack.kind`, or draw (accepting the pile). No other card is
    playable, even one that would normally match by color/number/action —
    stacking suspends ordinary `isUnoPlayable` matching entirely. `PASS`
    is not reachable in this state (a player who can't stack must draw,
    which resolves the turn itself — see below).
  - `PLAY_CARD` while `pendingStack !== null`: reject (`ok: false, reason:
    'must stack a matching card or draw the pile'`) any card whose `kind`
    isn't `pendingStack.kind`. For a matching `draw2`: increment
    `pendingStack.total` by 2, keep `pendingStack.kind`, advance turn
    NORMALLY to the next player, `hasDrawnThisTurn: false`. For a matching
    `wild4`: same shape as the original wild4 play — sets `pendingWild:
    { cardId, isDraw4: true }` (turn does not advance yet, color must be
    chosen); `CHOOSE_COLOR` then increments `pendingStack.total` by 4 and
    advances the turn normally, same as the opening wild4 case. The
    existing "going out ends the round immediately, the card's special
    effect never applies" short-circuit (checked before the `switch` on
    `card.kind`) already handles a stacking card taking the player to 0
    cards — verify this still fires correctly ahead of the new stacking
    branch and do not duplicate that check.
  - `DRAW_CARD` while `pendingStack !== null`: unconditionally accepted
    regardless of whether the acting player holds a matching stack card
    (a player may always choose to eat the pile rather than continue it —
    the existing `handHasLegalPlay`-blocks-`DRAW_CARD` check must be
    bypassed entirely in this state, since normal legal-play detection
    doesn't apply while stacking). Draws exactly `pendingStack.total`
    cards via the existing `drawFromStock` (same blocked-round fallback on
    `!draw.ok`, reusing `blockedRound` unchanged), clears `pendingStack:
    null`, and advances the turn NORMALLY past the drawing player (they
    drew instead of playing — same as today's "unplayable draw" turn
    handling, `hasDrawnThisTurn: false` since the turn is already over,
    not left `true` the way a normal single unplayable draw does — the
    accepting player never gets to act again this turn). Record
    `lastAction: { by: playerId, kind: 'draw', card: null, drewCount:
    pendingStack.total }` so the UI can say "drew 6".
  - The Uno-call window (`unoWindow`) behaves exactly per its existing
    rule at every turn-ending action in this flow: computed off
    `cardCount(newHand) === 1` for whichever player's action just ended
    the turn (the stacker who just played, or the player who just
    accepted the pile) — no special-casing needed, thread it through the
    same way the existing branches do.
  - `stockCount`/`handCounts` update exactly as today's draw2/wild4/DRAW_CARD
    branches already do, just with `pendingStack.total` instead of a fixed
    `2`/`4`/`1`.

## bot.ts

Add handling for `publicState.pendingStack !== null` (checked before the
existing `pendingWild` branch, since a wild4-stack still routes through
`pendingWild` for the color choice — the two states aren't mutually
exclusive mid-chain, order the checks correctly): if the bot holds a card
of `pendingStack.kind`, play it (any one is fine — deterministic: first
match in hand order, or reuse `pickBest`-style determinism, your choice as
long as it's deterministic); otherwise `DRAW_CARD`. Do not otherwise
change the bot's existing decision tree.

## UnoTable.tsx

Minimal UI, reusing existing patterns:

- When `publicState.pendingStack !== null` and it's the local player's
  turn: only hand cards matching `pendingStack.kind` should render as
  playable/clickable (reuse whatever mechanism currently drives the
  playable-card highlight, gated on `isUnoPlayable` — add a
  `pendingStack`-aware branch alongside it, do not delete the existing
  check, since it must still govern every other state).
- The draw control (`canDraw`/whatever renders the draw button) must be
  enabled while `pendingStack !== null` regardless of whether the local
  player holds a matching card, and its label should read something like
  `Draw {pendingStack.total}` instead of the generic draw label. Follow
  the existing footer-label pattern used for `drawUntilPlayable`
  (`UnoTable.tsx:660`) as the template for how a house-rule-driven label
  swap is already done in this file.
- No new picker/modal is needed — stacking only ever offers "play a
  matching card" or "draw," both already-existing controls, just
  relabeled/regated.

## stack-house-rule.test.ts (vitest, ≥ 14 tests)

Build fixtures the way `house-rules.test.ts` does. Cover at minimum:

- `stackDraw` defaults to `false` via `resolveHouseRules()`/`createUnoGame`.
- **Regression, rule OFF:** playing a `draw2` behaves byte-identical to
  before this spec (immediate draw-2 for the skipped player, `skipNext`,
  `pendingStack` stays `null` throughout). Same for `wild4` via
  `CHOOSE_COLOR`. These are the load-bearing "nothing changed" tests.
- **Rule ON, opening a draw2 stack:** playing a `draw2` sets `pendingStack:
  { kind: 'draw2', total: 2 }`, turn advances to the very next player
  (NOT skipped), no draw has happened yet (`stockCount` unchanged,
  opponent hand counts unchanged).
- **Rule ON, continuing a draw2 stack:** from a state with `pendingStack:
  { kind: 'draw2', total: 2 }` and the current player holding a `draw2`,
  playing it raises `pendingStack.total` to 4, turn advances again, still
  no draw has happened.
- **Rule ON, breaking a draw2 chain:** from `pendingStack: { kind:
  'draw2', total: 4 }`, the current player has no `draw2` and calls
  `DRAW_CARD` — confirm they receive exactly 4 cards, `pendingStack`
  becomes `null`, turn advances past them (they get no further action),
  `lastAction.drewCount === 4`.
- **Rule ON, PLAY_CARD rejects non-matching cards during a stack:** with
  `pendingStack: { kind: 'draw2', ... }`, attempting to play a normally-
  legal color-matching number card (or a `wild4`) is rejected
  (`ok: false`).
- **Rule ON, wild4 stack end-to-end:** open a wild4 stack (`PLAY_CARD` a
  `wild4` → `CHOOSE_COLOR` → `pendingStack: { kind: 'wild4', total: 4 }`),
  continue it once (another player plays `wild4` → `CHOOSE_COLOR` →
  `total: 8`), then break it (`DRAW_CARD` draws exactly 8).
  Confirm `pendingWild` is correctly set/cleared at each intermediate step.
- **No mixing:** with `pendingStack: { kind: 'draw2', ... }`, playing a
  held `wild4` is rejected; with `pendingStack: { kind: 'wild4', ... }`,
  playing a held `draw2` is rejected.
- **Going out mid-chain:** a player whose stacking card empties their hand
  goes out immediately via the existing `finishRoundByGoingOut` path —
  `pendingStack` never gets set/updated for that play, round ends,
  nobody draws.
- **Blocked round:** construct a stock+discard that can't satisfy a large
  accumulated `pendingStack.total` on `DRAW_CARD` — confirm the existing
  `blockedRound` fallback fires (`stage: 'roundOver'`, `roundResult: null`).
- **Uno-call window still opens correctly** off a stacking play that
  leaves the player at exactly 1 card, and off an accepting `DRAW_CARD`
  that (rare edge, but test it) doesn't apply to the drawer since drawing
  only ever increases their count — instead confirm the window computed
  after a stack-ending play still reflects the actual acting player.
- `pendingStack` survives `START_NEXT_ROUND` reset to `null` (should
  already be `null` by the time a round ends, but assert the field exists
  and is `null` on the fresh round's initial state regardless).

## Verify before reporting

`npx tsc -b --noEmit` silent. `npm test` all green — report the new
total. Separately re-run `npx vitest run src/card-games/uno/uno.test.ts`,
`npx vitest run src/card-games/uno/uno-call.test.ts`, and
`npx vitest run src/card-games/uno/house-rules.test.ts` in isolation and
confirm all three are STILL fully green with at most the minimal fixture
touch-up described above — report exactly what, if anything, needed
touching and why. `npm run build` clean. Manually sanity-check in a
browser with `stackDraw` on at a 3+ seat table (host + 2 house bots) that
a draw2 chain visibly passes around the table before someone draws, and
that the draw button's count label updates each time the chain grows —
per CLAUDE.md, this is a bot-pacing-adjacent change (bots must still act
at human speed while resolving their stack turn) even though no new
animation is introduced, so confirm bot stack responses don't fire faster
than the existing bot turn pacing elsewhere in Uno.
