# Spec 46 — Uno house rule: the 7-0 rule

Follow-up to spec 34c (landed — the generic house-rules pathway plus
`drawUntilPlayable`) and independent of spec 45 (stacking) — implement
whichever lands first; they touch overlapping files but not overlapping
logic, so do them as separate branches/PRs, not combined. Adds a third
toggle, `sevenZero`: playing a `7` lets the player swap their entire hand
with one opponent of their choice; playing a `0` rotates every seated
player's hand one seat around the table in the current turn direction.
This is the second most common real-world Uno house rule after stacking.

You own EXACTLY these files — all already exist, edit only. No files
beyond the one test file listed:

- `src/card-games/uno/state.ts`
- `src/card-games/uno/rules.ts`
- `src/card-games/uno/bot.ts`
- `src/screens/UnoTable.tsx` (+ `UnoTable.css` only if a genuinely new
  class is needed for the swap-target picker — try reusing the existing
  color-picker classes/layout first, see below)

And this NEW file:

- `src/card-games/uno/seven-zero-house-rule.test.ts`

Do NOT touch `deck.ts`, `uno.test.ts`, `uno-call.test.ts`,
`house-rules.test.ts`, `UnoRoom.tsx`, `UnoResults.tsx`,
`UnoRulesOverlay.tsx`, or `UnoCard.tsx`. `UnoRoom.tsx` needs NO change — it
already maps generically over `UNO_HOUSE_RULE_DEFS`, so the new
`sevenZero` def gets a working toggle for free. UNLESS the new state
fields break an existing test fixture's object-literal construction (same
caveat as spec 34c) — in that case fix ONLY the resulting compile errors,
minimally, and report exactly what and why. Do NOT touch any file outside
those listed. Do NOT run git.

## Design decisions (locked)

- New `UnoHouseRuleKey` member: `'sevenZero'`. New entry in
  `UNO_HOUSE_RULE_DEFS`:
  ```ts
  {
    key: 'sevenZero',
    label: '7-0 rule',
    description: 'Play a 7 to swap hands with one opponent of your choice. Play a 0 and everyone passes their hand to the next player around the table.',
    default: false,
  }
  ```
  Default `false`. When off, playing a `7` or `0` is completely unaffected
  — both are ordinary number cards today (they only set `activeColor` and
  advance the turn) and MUST remain exactly that when `sevenZero` is
  false. The existing `number`-kind branch in `PLAY_CARD` must stay the
  fallback path, reached whenever `sevenZero` is off OR the played number
  card's value is neither 7 nor 0.
- New `UnoPublicState` field:
  ```ts
  pendingSevenSwap: { cardId: string } | null
  ```
  Mirrors the existing `pendingWild` pattern: set when a `7` is played
  under `sevenZero`, cleared once the swap target is chosen. `null`
  always when `sevenZero` is off. Add to `createUnoGame`'s initial state
  (`null`) and to `START_NEXT_ROUND`'s reset block (alongside
  `pendingWild: null`, `unoWindow: null`).
- New `UnoAction` variant: `{ type: 'CHOOSE_SWAP_TARGET'; targetPlayerId:
  string }` — same shape/role as `CHOOSE_COLOR`, gates on
  `pendingSevenSwap !== null` the same way `CHOOSE_COLOR` gates on
  `pendingWild !== null`.
- **Playing a 7 under `sevenZero`:** in `PLAY_CARD`'s `number`-kind
  branch, when `card.value === 7` and `houseRules.sevenZero` is true:
  update `activeColor` to the played card's color immediately (exactly as
  the normal number branch already does), but do NOT advance the turn and
  do NOT compute the Uno-call window yet — instead set `pendingSevenSwap:
  { cardId: card.id }`. As with the existing wild-card flow, the "going
  out ends the round immediately, the special effect never applies"
  short-circuit already runs before this branch is reached, so a 7 that
  empties the hand never sets `pendingSevenSwap` — verify this and do not
  duplicate the check.
- **`CHOOSE_SWAP_TARGET` action:** legal only when `pendingSevenSwap !==
  null` and it is still the acting player's turn (same turn-gating as
  every other action). Validate `action.targetPlayerId` is a DIFFERENT
  seated player in `publicState.seatOrder` (reject self-target and
  reject unknown player ids). Swap the two players' ENTIRE private hands
  (`privateStates[playerId].hand` ↔ `privateStates[targetPlayerId].hand`
  — a plain object swap, no card-by-card logic needed). Update both
  `handCounts` entries. Clear `pendingSevenSwap: null`, advance the turn
  NORMALLY (`advanceTurn`), `hasDrawnThisTurn: false`.
  - Uno-call window after the swap: since the single-window model
    (`unoWindow: { playerId } | null`) can only represent one vulnerable
    player at a time, and a swap can legitimately leave BOTH participants
    at exactly 1 card, apply this deterministic priority — check the
    ACTING player's (the one who played the 7 and is submitting
    `CHOOSE_SWAP_TARGET`) new hand first: if `cardCount === 1`, that's the
    window. Otherwise check the target's new hand: if `cardCount === 1`,
    that's the window. Otherwise `null`. This is a deliberate, documented
    simplification of the existing single-window architecture, not new
    scope to design around — state this explicitly in your PR/commit
    notes, do not silently pick a different priority.
- **Playing a 0 under `sevenZero`:** in `PLAY_CARD`'s `number`-kind
  branch, when `card.value === 0` and `houseRules.sevenZero` is true:
  update `activeColor` as normal, then rotate every SEATED player's
  current-turn-of-play hand one seat in `publicState.turn.direction`
  (i.e., seat `i`'s hand moves to whichever seat `skippedPlayer`-style
  arithmetic would call "the next seat in the current direction" — reuse
  or mirror the existing `((currentIndex + direction) % len + len) % len`
  pattern from `turn-engine.ts`/the local `skippedPlayer` helper, applied
  to EVERY seat, not just relative to the current player). The rotation
  is computed over hands AFTER the just-played `0` has already left the
  acting player's hand (same "remaining hand" timing as the 7-swap and as
  every other card-kind branch — the played card is already moved to the
  discard pile by the time the `switch` on `card.kind` runs). Update
  every seat's `handCounts` entry to match. No pending-state is needed —
  this resolves synchronously within the same `PLAY_CARD` call, unlike
  the 7 case. Turn then advances NORMALLY to the next player past the one
  who played the 0.
  - Uno-call window after a rotation: deliberately does NOT open
    automatically from this branch — set `unoWindow: null` regardless of
    whether the rotation left one or more players at exactly 1 card. This
    is a locked, explicit scope decision (the single-window model has no
    correct way to represent "several players may need to call Uno
    simultaneously," and guessing one arbitrary player would be worse than
    representing none) — do not treat this as an oversight to fix, and do
    not attempt to extend `unoWindow` to a multi-player shape; that is out
    of scope for this spec.
- Neither the 7 nor 0 special-case interacts with `skip`/`reverse`/
  `draw2`/`wild`/`wild4` handling at all — those branches are completely
  untouched by this spec.

## bot.ts

Add handling for `publicState.pendingSevenSwap !== null` (checked
alongside/before the existing `pendingWild` branch — the two are mutually
exclusive at any instant since a 7 never sets `pendingWild` and a wild
never sets `pendingSevenSwap`, so ordering between the two checks doesn't
matter, but both must be checked before the normal playable-card logic):
submit `CHOOSE_SWAP_TARGET` targeting whichever OTHER seated player
currently has the fewest cards (`publicState.handCounts`), tie-broken by
seat order (first in `seatOrder` among the tied). Do not otherwise change
the bot's existing decision tree — a bot holding a 7 under `sevenZero`
still just plays it via the existing `pickBest`/`playable` logic in the
normal turn branch (playing a 7 needs no special preference over other
action cards for this spec; only the follow-up target choice is new).

## UnoTable.tsx

Minimal UI, reusing existing patterns:

- Gate a new "choose a player to swap with" picker on
  `publicState.pendingSevenSwap !== null` and it being the local player's
  turn — same conditional shape as the existing `showColorPicker` gate
  (`UnoTable.tsx` around line 248). Render one button per OTHER seated
  player (name via the existing `names` prop, seat ink via the existing
  `colors` prop), each calling a new `onChooseSwapTarget(targetPlayerId:
  string)` prop (add to `UnoTableProps`, threaded through the same way
  `onChooseColor`/`onCallUno` already are). Reuse the color-picker's
  layout container/classes (`uno-centre-right`, or whatever the closest
  applicable class is) rather than inventing a new modal.
- No UI is needed for the 0-rotation — it resolves synchronously, and the
  existing `lastAction`-driven footer/toast copy is the right place to
  surface it (extend whatever text derivation already renders
  `lastAction` for a `'play'` kind to say something like "hands rotated"
  when the played card was a 0 under `sevenZero`, and "swapped hands with
  {name}" for the 7 case — follow whatever minimal-diff approach the
  existing `lastAction` rendering already uses; do not invent a new
  `UnoLastAction` field unless the existing `card`/`kind` fields are
  genuinely insufficient to distinguish these cases in the UI, in which
  case say exactly what's missing before adding a field).

## seven-zero-house-rule.test.ts (vitest, ≥ 14 tests)

Build fixtures the way `house-rules.test.ts` does. Cover at minimum:

- `sevenZero` defaults to `false` via `resolveHouseRules()`/`createUnoGame`.
- **Regression, rule OFF:** playing a `7` or a `0` behaves byte-identical
  to before this spec (ordinary number-card branch: `activeColor` updates,
  turn advances normally, `pendingSevenSwap` stays `null` throughout, no
  hand contents change beyond the played card leaving the hand).
- **Rule ON, playing a 7 opens the pending swap:** `pendingSevenSwap:
  { cardId }` gets set, turn does NOT advance, `activeColor` already
  updated to the 7's color.
- **Rule ON, CHOOSE_SWAP_TARGET swaps hands correctly:** construct two
  players with distinguishable hands (different card counts/contents),
  confirm after the swap each holds exactly what the other held,
  `handCounts` reflect the swap, `pendingSevenSwap` is `null`, turn has
  advanced to the correct next player.
- **CHOOSE_SWAP_TARGET rejects self-target** and **rejects when
  `pendingSevenSwap` is null**.
- **Uno-call window priority after a swap:** one fixture where the
  ACTING player ends at 1 card post-swap (window opens for them, not the
  target, even if the target also ends at 1) and one fixture where only
  the TARGET ends at 1 (window opens for the target).
- **Going out on a 7:** a player whose 7 empties their hand goes out
  immediately via `finishRoundByGoingOut` — `pendingSevenSwap` never gets
  set, no swap occurs, round ends.
- **Rule ON, playing a 0 rotates all hands one seat in the current
  direction:** a 3+ seat fixture, confirm every seat's new hand equals
  the PREVIOUS seat's (in rotation direction) old hand, `handCounts`
  match post-rotation, turn advances to the correct next player,
  `unoWindow` is `null` regardless of any resulting 1-card hands.
- **0-rotation direction respects a prior reverse:** construct a fixture
  where `turn.direction === -1` (e.g. after an earlier reverse card) and
  confirm the rotation goes the other way around the table.
- **Going out on a 0:** a player whose 0 empties their hand goes out
  immediately — no rotation happens, since going-out is checked before
  the `card.kind` switch (same short-circuit as every other card kind).
- `pendingSevenSwap` survives `START_NEXT_ROUND` reset to `null`.

## Verify before reporting

`npx tsc -b --noEmit` silent. `npm test` all green — report the new
total. Separately re-run `npx vitest run src/card-games/uno/uno.test.ts`,
`npx vitest run src/card-games/uno/uno-call.test.ts`, and
`npx vitest run src/card-games/uno/house-rules.test.ts` in isolation and
confirm all three are STILL fully green with at most the minimal fixture
touch-up described above — report exactly what, if anything, needed
touching and why. `npm run build` clean. Manually sanity-check in a
browser with `sevenZero` on at a 3+ seat table (host + 2 house bots):
play a 7 as the human and confirm the swap-target picker appears and
works; watch a bot play a 7 and confirm it picks a sensible target without
pausing longer than the game's existing bot-turn pacing; play a 0 and
confirm hands visibly rotate. Per CLAUDE.md, treat this as a bot-pacing
check even though no new animation is introduced — a bot's swap-target
decision must not resolve faster than a human could follow, matching the
existing rhythm of Uno's other bot decisions.
