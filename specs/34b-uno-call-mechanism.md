# Spec 34b — Uno-call race mechanism

Follow-up to spec 34/34a (landed, 900 tests). Adds the Uno-call window: at
most one active window in the whole game ever, opened when a player's turn
ends holding exactly 1 card, destroyed by a successful call (self or catch)
or by the next player's first action, with a flat draw-2 catch penalty.
Design fully settled with the user in an earlier conversation — nothing
here is open for redesign.

You own EXACTLY these two files — both already exist, edit only. No new
files, no new file ownership beyond these two:

- `src/card-games/uno/state.ts`
- `src/card-games/uno/rules.ts`

And this ONE new file:

- `src/card-games/uno/uno-call.test.ts`

Do NOT touch `deck.ts`, `bot.ts`, or `uno.test.ts`. Do NOT touch any file
outside `src/card-games/uno/`. Do NOT run git.

## Design decisions (locked)

- `unoWindow: { playerId: string } | null` — added to `UnoPublicState`. At
  most one ever active, by construction: it can only be created at the
  moment a turn-ending action leaves the ACTING player (the one whose turn
  it was) holding exactly 1 card, and it is unconditionally cleared the
  instant the NEXT player's first action is validated — before that next
  action could itself ever create a second window for someone else. There
  is no code path where two windows could coexist; do not add a
  `Record<playerId, ...>` or any other multi-window structure.
- **Opens**: at the end of ANY turn-ending branch in `PLAY_CARD` (number,
  skip, reverse, draw2 — NOT the go-out branch, see below) and at the end
  of `CHOOSE_COLOR` (both the plain-wild and wild4 branches) and at the
  end of `DRAW_CARD`'s "unplayable, auto-advance" branch and `PASS` — i.e.
  every branch that already calls `advanceTurn`/`skipNext` and did NOT go
  out. Set `unoWindow = { playerId }` (the ACTING player, not whoever the
  turn now belongs to) whenever, after that branch's hand mutation,
  `cardCount(newHand) === 1`. Otherwise (hand size is 0 — already handled
  by going out — or ≥2) set `unoWindow = null` in that same branch.
  Concretely: every one of those branches currently ends by setting `turn:
  advanceTurn(...)` or `turn: skipNext(...)`; add one line right next to
  it computing `unoWindow` from the post-mutation hand size of the acting
  player. Going out (`cardCount(newHand) === 0`) never sets a window — a
  player who just emptied their hand isn't "at 1 card," the round is over.
- **Destroyed uncalled**: at the very top of the validator, for every
  action type EXCEPT `START_NEXT_ROUND` and `CALL_UNO` (new action, see
  below), once you've confirmed `stage === 'play'` and it's this player's
  turn — i.e. this is genuinely the first action of a new current player —
  clear `unoWindow` to `null` if it's currently non-null AND belongs to a
  DIFFERENT player than the one now acting (it must, since the window's
  owner just finished their own turn and it's now someone else's turn) —
  simplify: since a window can only ever belong to the player whose turn
  JUST ended, and this check runs at the start of the NEW current player's
  first action, unconditionally clear any non-null `unoWindow` here,
  before validating the rest of the action. Do this by threading a
  cleared-`unoWindow` value through to every outcome this validator
  returns for a "new current player's first action" — the simplest correct
  way is: compute `const clearedWindow = null` once near the top of the
  function body (after the stage/turn checks, before the action-type
  branches) and use `unoWindow: clearedWindow` as the DEFAULT in every
  branch's returned publicState EXCEPT the ones that immediately open a
  fresh window per the bullet above (those override it back to a real
  value in that same branch). Read through the whole switch/if-chain
  before writing this — every existing branch's returned object needs
  either `unoWindow: null` (clearing, most branches) or a computed
  `unoWindow` value (the turn-ending branches per the bullet above) added
  to it. `CALL_UNO` and `START_NEXT_ROUND` are the only two actions that do
  NOT go through this "it's a new current player's first action, clear the
  window" logic — `CALL_UNO` explicitly interacts with the window instead
  (see below), and `START_NEXT_ROUND` already resets everything fresh.
- **`CALL_UNO { targetPlayerId: string }`** — new `UnoAction` variant.
  Reject unless `unoWindow !== null`. Reject unless
  `action.targetPlayerId === unoWindow.playerId` (you may only call the
  window that's actually open — this also means self-calls and catches use
  the SAME action shape, just with `targetPlayerId` equal to either the
  caller's own id or someone else's; no separate self-call action type).
  This action is NOT gated by "is it your turn" — ANY seated player
  (including the vulnerable player themselves) may send it while the
  window is open, exactly like `START_NEXT_ROUND`'s "not gated by whose
  turn it is" precedent. Reject if `playerId` is not a seated player
  (`Object.hasOwn(privateStates, playerId)` check, same pattern as
  `START_NEXT_ROUND`).
  Apply: if `playerId === unoWindow.playerId` (self-call): just clear
  `unoWindow = null`. No card penalty either way for a successful self or
  catch call — the CALLER never draws; only a FAILED-to-call player who
  gets caught draws. If `playerId !== unoWindow.playerId` (a catch): the
  TARGET (`unoWindow.playerId`, NOT the caller) draws 2 cards (same
  `drawFromStock`/recycle mechanics already used for draw2/wild4 — reuse
  that exact function, don't reimplement), `unoWindow = null`. Note the
  target's hand goes from 1 card to 3 — this does NOT retroactively open
  or affect any OTHER window logic; it's just a draw. If the draw can't be
  satisfied (the same vanishing-stock edge case as everywhere else): reuse
  `blockedRound` exactly as the other draw sites do. Turn does NOT change
  as a result of `CALL_UNO` either way — it's an out-of-band action, the
  current player (whoever that now is) keeps their turn exactly as it was.
  Update `handCounts` for whichever player drew.
- **UI-only timing**: nothing in this spec requires wall-clock time. The
  1-second self-priority stagger described to the user earlier is a
  client-side-only cosmetic concern for a LATER (screens) spec — this
  spec's host validator has zero concept of "how long has the window been
  open," and must not gain one. Do not add a timestamp field anywhere.
- **Going out while a window is open for someone ELSE**: if the current
  player empties their hand (goes out) while `unoWindow` is open for a
  DIFFERENT player (that player never got caught/called before their own
  next turn — impossible actually, since the window's owner's "next turn"
  IS what clears it, and the current player going out means it's already
  past that; more precisely this can't arise because whichever player's
  turn it now is already cleared any prior window as their first action,
  per the "destroyed uncalled" bullet above — by the time anyone can go
  out, any stale window is already gone). Do NOT special-case this in
  `finishRoundByGoingOut` — just make sure it also sets `unoWindow: null`
  in its returned state (the round is over, nothing should carry into the
  next round). Add this one field to `finishRoundByGoingOut`'s existing
  return object.
- **`START_NEXT_ROUND`**: add `unoWindow: null` to its reset list (it
  already resets `pendingWild`/`hasDrawnThisTurn`/etc. — one more field,
  same treatment).

## state.ts changes

Add `unoWindow: { playerId: string } | null` to `UnoPublicState` (with a
short comment: "at most one ever active — opens when a turn-ending action
leaves the acting player at exactly 1 card, destroyed by a call or by the
next player's first action"). Add `unoWindow: null` to `createUnoGame`'s
initial state. Add `'CALL_UNO'` to `UnoAction`:
```ts
| { type: 'CALL_UNO'; targetPlayerId: string }
```

## uno-call.test.ts (vitest, ≥ 20 tests)

Build fixtures the same way `uno.test.ts` does — read that file's `cards`/
`buildGame` helpers and reuse them (import from `./uno.test.ts` is NOT
allowed for test helpers that live in a `.test.ts` file — instead,
duplicate the minimal fixture-building you need directly in this new file,
following the exact same pattern; keep it small, you likely only need a
`buildGame`-equivalent, not the full helper set). Cover at minimum:

- Playing down to exactly 1 card opens the window for the player who just
  moved, with the correct `unoWindow.playerId`.
- Playing down to 0 cards (going out) does NOT open a window.
- Playing a card that leaves 2+ cards does not open a window (and clears
  any window that happened to be open from a prior turn — construct this
  explicitly: a window open for player X, then player Y — a different
  player — takes a turn and ends with 3 cards; assert the window is now
  null, not still X's).
- The next player's first action (a `PLAY_CARD`, a `DRAW_CARD`, and a
  `PASS` — test all three kinds of "first action") clears an open window
  from the PREVIOUS player, uncalled, before that action's own effects
  apply.
- Self-call: the vulnerable player calling `CALL_UNO` on themselves clears
  the window, no card penalty, their hand count unchanged.
- Catch: a DIFFERENT player calling `CALL_UNO` on the vulnerable player
  gives the vulnerable player +2 cards (drawn from the real stock,
  `handCounts` and `stockCount` updated correctly) and clears the window.
  Turn stays exactly where it was (assert `currentPlayer` unchanged by the
  catch).
- `CALL_UNO` rejected when no window is open at all.
- `CALL_UNO` rejected when `targetPlayerId` doesn't match the actually-open
  window's owner (construct a window open for X, call targeting Y).
  `CALL_UNO` rejected from a non-seated playerId.
- A player who sits at 1 card across MULTIPLE consecutive turns (plays a
  card each turn but keeps drawing back to 1, or simply never goes below 1
  — construct via a hand where they play a card and immediately draw one
  back, or just directly re-verify via two separate PLAY_CARD turns each
  ending at 1 card) gets a FRESH window each time — prove this explicitly:
  window opens turn 1, gets destroyed uncalled by the next player's
  action, player's turn comes around again, ends at 1 card again, window
  reopens (a NEW window, same `playerId`, but assert it went through a
  null in between — don't just assert "window is open again," assert the
  full open→null→open sequence across three separate action applications).
  This is the single most important test in this file — Oscar will look
  for it specifically.
- `finishRoundByGoingOut` always leaves `unoWindow: null` in the resulting
  state, even when a window was open for a DIFFERENT player at the moment
  someone else went out (construct this: window open for X, then Y goes
  out on their own turn — note per the design this requires X's window to
  have already been cleared when Y's turn began, so this test is really
  proving "no window survives into `roundOver`/`over`" as a blanket
  invariant, not proving a specific cross-player scenario is reachable —
  write it as: after ANY go-out, `unoWindow` is null, full stop).
- `START_NEXT_ROUND` always deals into `unoWindow: null`.
- Wire safety: the new `CALL_UNO` action and `unoWindow` field both survive
  `isJsonSerializable` (import from `../../engine/sync.ts`).

## Verify before reporting

`npx tsc -b --noEmit` silent. `npm test` all green — report the new total
(should be 900 + however many tests you wrote in `uno-call.test.ts`, ≥ 20,
so ≥ 920). Also re-run the EXISTING `uno.test.ts` in isolation
(`npx vitest run src/card-games/uno/uno.test.ts`) and confirm it is STILL
fully green with no changes needed there — if adding `unoWindow` to
`UnoPublicState` breaks any existing test's exact-shape assertion (e.g. a
`toEqual` on the whole public state object), that is expected and you
should fix those specific assertions to include the new field's expected
value, but do not change what they're actually testing. Report exactly
which (if any) existing tests needed that kind of touch-up and why.
