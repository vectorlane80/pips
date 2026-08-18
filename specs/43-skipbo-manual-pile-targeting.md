# Spec 43 — Skip-Bo manual pile targeting + public stockpile tops

Fixes three real, reported gaps in Skip-Bo's initial implementation —
all three are the same underlying mistake in different places: the
engine auto-deciding something the PLAYER should be deciding.

**1. No manual build-pile targeting.** Skip-Bo currently auto-targets
whichever build pile is "furthest along" when you play a card, with no
way to choose. This is especially bad for wilds — a wild is legal on
every pile, so the auto-target silently claims it for whichever pile
happens to be furthest along, even when the player clearly intended to
play it somewhere else. This was carried over faithfully from the
design handoff's own "auto-targets" behavior
(`Design Handoff/SKIPBO.md`), but it's wrong in practice and the user
has explicitly asked for manual targeting instead. This spec overrides
that one specific inherited decision.

**2. Stockpile tops are wrongly private.** Real Skip-Bo rules (per the
user, confirmed against how the game is actually played) keep every
seat's stockpile TOP card face-up and visible to the whole table at
all times — it is public information, not hidden like a hand. The
current implementation treats it as private (`SkipBoPrivateState.
stock: Zone`, sent only to its owner), so opponent tiles render a
face-down card back for the stockpile instead of the real top card.
This is a genuine correctness bug, not a UI preference — fix it at the
state layer, not just the rendering layer.

**3. No manual discard-pile targeting.** `DISCARD` currently auto-
picks "the emptiest of the player's 4 discard piles" (ties → lowest
index) instead of letting the player choose which of their own 4
piles a hand card lands on. Same underlying mistake as Fix 1, same
fix shape: the player chooses, the engine validates.

All three fixes touch overlapping files in the same engine/wiring/
screens area, so land them together in one spec rather than three
dispatch cycles.

You own edits to exactly these files. Do not touch anything else:

- `src/card-games/skipbo/state.ts` (action shape + stock visibility)
- `src/card-games/skipbo/rules.ts` (validation + stock relocation)
- `src/card-games/skipbo/bot.ts` (bots still auto-target for pile
  choice, and now read their own stock top from public state)
- `src/card-games/skipbo/skipbo.test.ts` / `bot.test.ts` (update every
  existing test that constructs the old action shapes or reads
  `privateState.stock`; add coverage for both fixes)
- `src/screens/SkipBoTable.tsx` / `.css`
- `src/App.tsx` (Skip-Bo wiring section only — the three dispatch
  callbacks need a new parameter, and the broadcast function's private-
  state shape changes)

## Engine change (`state.ts` + `rules.ts`)

`SkipBoAction`'s three play variants each gain an explicit
`buildPileIndex: number` (0-3) naming the DESTINATION build pile the
client is choosing:

```ts
export type SkipBoAction =
  | { type: 'PLAY_STOCK'; buildPileIndex: number }
  | { type: 'PLAY_HAND'; cardId: string; buildPileIndex: number }
  | { type: 'PLAY_DISCARD'; pileIndex: number; buildPileIndex: number }
  | { type: 'DISCARD'; cardId: string }
  | { type: 'PASS' }
```

(`PLAY_DISCARD.pileIndex` is unchanged — it's still which of the
player's OWN 4 discard piles to play FROM. `buildPileIndex` is the new
field, the destination.)

Add a small exported pure helper in `rules.ts`, alongside the existing
`chooseBuildPile`:

```ts
export function isCardLegalOnPile(card: Card, pile: SkipBoBuildPile): boolean {
  return card.meta?.kind === 'wild' || Number(card.rank) === pile.nextNeeded
}
```

`chooseBuildPile` should be rewritten in terms of this helper (same
furthest-along-then-lowest-index behavior, now just calling
`isCardLegalOnPile` per pile instead of duplicating the legality
check) — it stays exported and is still needed by bots (see below) and
by the screens (to know which piles to show as legal targets).

In each of the three validator branches (`PLAY_STOCK`/`PLAY_HAND`/
`PLAY_DISCARD`): replace the internal `chooseBuildPile(card,
publicState.buildPiles)` auto-target call with validation of the
CLIENT-SUPPLIED `action.buildPileIndex`:
- Reject if not an integer in range 0-3 (`'invalid build pile index'`).
- Reject if `!isCardLegalOnPile(card, publicState.buildPiles[action.buildPileIndex])`
  (`'not a legal play on that pile'`).
- Otherwise use `action.buildPileIndex` as the target — the rest of
  the play effect (`playCardOntoPile`, the mid-turn win check on
  `PLAY_STOCK`, etc.) is unchanged.

This is a real security/correctness boundary, not just a UI nicety:
the host must validate the client's chosen pile server-side exactly
like every other action, never trust it blindly — same as this
project's every other host-authoritative action.

## Bot change (`bot.ts`)

Every rung that currently calls `chooseBuildPile(...) !== -1` to check
legality now also needs to CAPTURE that computed index and include it
in the returned action:

```ts
// 1. Stock top first
if (stock.cards.length > 0) {
  const target = chooseBuildPile(topCard(stock)!, buildPiles)
  if (target !== -1) return { type: 'PLAY_STOCK', buildPileIndex: target }
}
```

Same pattern for the discard-pile rung and both hand-card rungs
(numbered, then wild). Bots keep auto-targeting via the existing
furthest-along logic — this spec only changes who chooses for a HUMAN
player; bots have no UI to choose from and should keep their current,
already-correct behavior unchanged in spirit.

## Screens change (`SkipBoTable.tsx` / `.css`)

Replace the single generic "Play" button with direct pile-targeting,
mirroring the established "hittable" click-to-target convention this
codebase already uses (`Phase10Table.tsx`'s `GroupCluster` /
`.p10-group--hittable` — read that pattern before writing this one).

- Remove the `playable` boolean and the `handlePlay`/"Play" button
  entirely from the render.
- Compute `legalPileIndices: number[]` — for the currently selected
  card (if any), which of the 4 build piles `isCardLegalOnPile` returns
  true for. Empty array when nothing is selected or nothing is legal
  anywhere.
- Each build-pile tile becomes clickable (`role="button"`,
  `tabIndex={0}`, `onClick`) exactly when its index is in
  `legalPileIndices` AND `canAct` — apply a `.sb-build-slot--playable`
  class for the visual affordance (yellow outline + pointer cursor,
  matching `.p10-group--hittable`'s exact treatment, not inventing a
  new visual language).
- Clicking a playable pile calls a new `handlePlayOnto(buildPileIndex:
  number)` that dispatches the correct callback based on
  `selection.kind` (`onPlayStock(buildPileIndex)`,
  `onPlayHand(selection.cardId, buildPileIndex)`,
  `onPlayDiscard(selection.pileIndex, buildPileIndex)`) and then clears
  `selection` — this REPLACES `handlePlay` as the confirm action; there
  is no separate button click needed once a legal pile is clicked.
- Update `SkipBoTableProps`: `onPlayStock: (buildPileIndex: number) =>
  void`, `onPlayHand: (cardId: string, buildPileIndex: number) =>
  void`, `onPlayDiscard: (pileIndex: number, buildPileIndex: number) =>
  void`.
- Update the status-line copy (`computeStatus`) for the
  card-selected-but-no-pile-chosen state — something like "Selected:
  tap a highlighted pile to play it there, or pick something else" —
  the old "Play it, or pick something else" no longer makes sense
  without a Play button.
- Discard and Pass buttons/logic are UNCHANGED — this spec only
  touches the three PLAY_* actions' targeting.

## Wiring change (`App.tsx`)

Update the three dispatch closures in the render branch to accept and
forward the new parameter:
```ts
onPlayStock={(buildPileIndex) => skipBoDispatch({ type: 'PLAY_STOCK', buildPileIndex })}
onPlayHand={(cardId, buildPileIndex) => skipBoDispatch({ type: 'PLAY_HAND', cardId, buildPileIndex })}
onPlayDiscard={(pileIndex, buildPileIndex) => skipBoDispatch({ type: 'PLAY_DISCARD', pileIndex, buildPileIndex })}
```
No other wiring logic changes — `skipBoDispatch` itself is unchanged,
it already forwards whatever action shape it's given.

`bot.ts`'s changes (above) mean `runSkipBoBotTurn`'s calls into
`skipBoBotStrategy` need no wiring changes — the bot loop just gets a
richer action back from the same strategy call, same as before.

---

## Fix 2 — public stockpile tops

`SkipBoPrivateState.stock: Zone` is wrong: nobody, including the
owner, should have private visibility into a stockpile — only its
current TOP card is ever known, and that top card is known to
EVERYONE at the table, not just its owner. Treat it like
`discardTops` (already public, already per-seat), not like a hand.

### `state.ts`

- `SkipBoPublicState` gains `stockTops: Record<string, Card | null>`
  — every seat's current stockpile top card, publicly visible. Keep
  `stockCounts` as-is (still needed — a stockpile can be non-empty
  with counts differing from a simple presence check, and it's cheap
  to keep both).
- `SkipBoPrivateState` LOSES the `stock: Zone` field entirely — hands
  and discard-pile identity stay private (those genuinely are hidden
  from other seats), stock does not.
- `SkipBoSession` (the host-only wrapper, already carrying `drawPile`/
  `usedPile` outside `HostSession` per spec 40's established pattern)
  gains `stocks: Record<string, Zone>` — the actual full per-seat
  stockpile zones live here now, host-only, exactly like `drawPile`/
  `usedPile` already do. This is where the engine actually pops cards
  off when `PLAY_STOCK` resolves.
- `createSkipBoGame`: deal each seat's stockpile into this new
  `stocks` host-only field instead of into `privateStates[playerId].
  stock`. Compute `stockTops` into public state at creation
  (`topCard(stocks[playerId]) ?? null` per seat).

### `rules.ts`

- `PLAY_STOCK`'s validator branch now reads the acting player's stock
  from `game.stocks[playerId]` (the host-only session field) instead
  of `privateStates[playerId].stock`. Follow the SAME pattern spec
  40's own nit-fix already established for `drawPile`/`usedPile` —
  extend the local `SkipBoOutcome` type (already carries optional
  `drawPile`/`usedPile`) to also carry an optional `stocks:
  Record<string, Zone>` when it changes, and have
  `applySkipBoAction`/`runSkipBoBotTurn` read it off the outcome the
  same way they already do for the other two host-only zones. Do not
  reintroduce the closure-mutation pattern that spec 40's review
  already fixed once.
- After a successful `PLAY_STOCK`, recompute `stockTops[playerId]`
  into the returned public state (`topCard(newStock) ?? null`) — this
  is the one new piece of public-state bookkeeping every play needs.
- The mid-turn win check (`cardCount(newStock) === 0`) is otherwise
  unchanged in behavior, just reads from the relocated `stocks` field.

### `bot.ts`

Rung 1 ("stock top first — never sit on a playable stockpile card")
currently reads `privateState.stock`. Change it to read the bot's own
top card from `publicState.stockTops[playerId]` instead — the bot
strategy function already receives `playerId` as its third argument.
The rest of that rung's logic (checking `chooseBuildPile` legality,
returning `PLAY_STOCK` with the computed `buildPileIndex`) is
unchanged, just sourced from the public field now.

### `SkipBoTable.tsx`

- Remove the `stockTop: Card | null` prop from `SkipBoTableProps`
  entirely — it's now always derivable from
  `publicState.stockTops[localPlayerId]`, no need to thread it in
  separately. Update every internal use (`selectionCard`, the
  playability check, the local-stockpile render) to read from
  `publicState.stockTops[localPlayerId]` directly.
- Opponent tiles: replace the face-down `SkipBoCardBack size="stock"`
  render with the REAL face-up top card
  (`publicState.stockTops[seatId]`) using `SkipBoCard size="tile"` —
  same empty-outline treatment as an empty build/discard pile
  (`.sb-empty-tile`) for the (rare, likely game-over-adjacent) case
  where it's `null`. This is the actual bug fix the user reported —
  opponents' stockpile tops should be visibly readable at the table,
  not hidden behind a card back.
- Local player's own stockpile render: same switch, reading from
  `publicState.stockTops[localPlayerId]` instead of the removed
  `stockTop` prop — visually this seat's own stockpile already showed
  face-up (that part was already correct), just re-source where the
  card comes from.

### `App.tsx`

- `skipBoBroadcast`: the 'game'-kind view no longer needs to compute
  or send a separate `stockTop` field per recipient — `stockTops` is
  now part of `publicState` itself, which every recipient (host's own
  view AND every guest's `sendTo` payload) already carries in full.
  Remove `stockTop: topCard(...) ?? null` from both the host's local
  view construction and the per-guest `sendTo` payload, and remove
  `stockTop` from the `SkipBoView` 'game' variant's type entirely.
  Update the `SkipBoTable` render branch to stop passing a `stockTop`
  prop (removed from the component's own interface above).
- No change to hand delivery — hands remain genuinely private,
  unaffected by this fix.

---

## Fix 3 — manual discard-pile targeting

Same shape as Fix 1, applied to `DISCARD` instead of the three PLAY_*
actions. Unlike a build pile, a discard pile has NO legality
constraint — any card can land on any of your own 4 discard piles at
any time (that's the whole point of a discard pile). So this fix is
purely about who CHOOSES the pile, not about adding a new legality
check.

### `state.ts`

```ts
| { type: 'DISCARD'; cardId: string; pileIndex: number }   // 0-3, which of the player's OWN 4 discard piles
```

### `rules.ts`

- `DISCARD`'s validator branch: validate `action.pileIndex` is an
  integer 0-3 (`'invalid discard pile index'`) — no further legality
  check needed, any index in range is always legal. Use it directly as
  the destination instead of computing "the emptiest pile."
- Extract the OLD "emptiest pile, ties → lowest index" logic (currently
  inline in the `DISCARD` handler) into a small exported pure helper —
  `selectEmptiestDiscardPile(discards: Zone[]): number` — because the
  BOT still needs this exact logic (bots have no UI to choose from,
  they should keep auto-picking the emptiest pile, matching spec 40's
  documented bot behavior "discards ... onto its emptiest discard
  pile"). Don't duplicate the loop; move it once, call it from `bot.ts`.

### `bot.ts`

The final rung (`return { type: 'DISCARD', cardId:
selectSkipBoDiscard(hand) }`) now needs a `pileIndex` too:
```ts
return {
  type: 'DISCARD',
  cardId: selectSkipBoDiscard(hand),
  pileIndex: selectEmptiestDiscardPile(discards),
}
```
(`discards` is already in scope in the strategy function — same
variable rung 2 already reads.)

### `SkipBoTable.tsx`

This interacts with the SAME 4 discard-pile tiles Fix 1 already made
sometimes-clickable-as-a-source, so the click behavior on those tiles
now depends on what's currently selected — get this disambiguation
right, it's the trickiest part of this spec:

- **When `selection?.kind === 'hand'`** (a hand card is selected): all
  4 of the local player's own discard-pile tiles become discard
  TARGETS — clickable REGARDLESS of whether they're currently empty or
  not (discarding onto an empty pile starts a new pile, that's legal),
  styled with the same `--playable` affordance Fix 1 introduced for
  build piles. Clicking one calls a new `handleDiscardOnto(pileIndex:
  number)` that fires `onDiscard(selection.cardId, pileIndex)` and
  clears `selection` — this REPLACES the standalone "Discard" button
  entirely, same as Fix 1 removed the "Play" button.
- **Otherwise** (nothing selected, or a stock/discard-source is
  already selected): a NON-empty own discard-pile tile is clickable to
  SELECT it as a new play source (existing `handleSelect({kind:
  'discard', pileIndex: i})` behavior, unchanged from before this
  spec) — an EMPTY one stays non-clickable in this mode (nothing to
  pick up). This is exactly today's existing behavior, just now
  conditional on `selection?.kind !== 'hand'`.
- Remove the standalone "Discard" button and the `canDiscard`
  boolean/`handleDiscard` function entirely — replaced by the pile-
  click above.
- Update `SkipBoTableProps.onDiscard` to `(cardId: string, pileIndex:
  number) => void`.
- Update the status-line copy for the hand-card-selected state to
  mention both targets — something like "Selected: tap a highlighted
  build pile to play it, or one of your discard piles to end your
  turn there."
- Pass/roundOver-clearing logic is unaffected.

### `App.tsx`

Update the discard dispatch closure:
```ts
onDiscard={(cardId, pileIndex) => skipBoDispatch({ type: 'DISCARD', cardId, pileIndex })}
```

## Verify before reporting

Update every existing test that constructs the old action shapes
(`{ type: 'PLAY_STOCK' }`, `{ type: 'DISCARD', cardId }`, etc.) or
reads `privateState.stock` — grep for every call site across
`skipbo.test.ts`/`bot.test.ts` rather than guessing at the count; this
spec touches the action shape AND the state shape, so there will be
more of these than a typical fix. Add new tests covering all three
fixes:

- Fix 1: rejecting an out-of-range `buildPileIndex`, rejecting a
  legal-elsewhere-but-illegal-on-THIS-pile play (the exact bug being
  fixed — e.g. a wild explicitly targeted at a specific pile that
  isn't the "furthest along" one, proving the player's choice is
  honored rather than silently overridden), and confirming bots still
  pick a legal pile automatically.
- Fix 2: `stockTops` is correctly populated at deal time and after
  every `PLAY_STOCK`, a card conservation check still holds (162 cards
  across every zone including the relocated host-only `stocks`), and
  `SkipBoPrivateState` genuinely no longer carries any stock data (a
  `deriveSnapshot`-based test proving one seat's private state can't
  reveal another's stock — the same class of privacy test spec 40's
  own test suite already uses for hands).
- Fix 3: rejecting an out-of-range `pileIndex` on `DISCARD`, confirming
  a specific chosen pile (not just "the emptiest") is honored, and
  confirming bots still auto-pick the emptiest pile via the extracted
  `selectEmptiestDiscardPile` helper.

Run `npx tsc -b --noEmit`, `npm test -- --run`, `npm run build`
yourself, paste the actual output, and report a summary, every
judgment call, and specifically confirm: the exact wild-to-a-specific-
pile scenario now works as the player intends (walk through it), that
the host still validates both `buildPileIndex` and discard `pileIndex`
server-side rather than trusting the client, and that opponent
stockpile tops render as real face-up cards rather than a card back
(walk through what an opponent's tile shows before and after this
spec, since you can't visually verify it yourself — describe the
data flow precisely).
