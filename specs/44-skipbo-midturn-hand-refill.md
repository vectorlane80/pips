# Spec 44 — Skip-Bo mid-turn hand refill

Fixes a real, reported bug: if a player plays all 5 hand cards during
their turn (via `PLAY_HAND`), the game currently just leaves them with
an empty hand and no way to end their turn — `DISCARD` requires a hand
card, and `PASS` requires the hand to ALREADY be empty at turn start,
not mid-turn after playing it down. The player is stuck.

Real Skip-Bo's actual rule: **if your hand empties before you're done
with your turn, immediately draw back up to 5 from the draw pile and
keep playing** — your turn does not end just because your hand ran
out; you keep going with a fresh hand. This is distinct from the
existing turn-START draw (folded into `DISCARD`/`PASS`'s turn-advance,
landed in spec 40) — this is a MID-turn refill for the CURRENT player,
who keeps acting afterward.

You own edits to exactly these files:

- `src/card-games/skipbo/rules.ts`
- `src/card-games/skipbo/skipbo.test.ts` (add coverage; do not touch
  `bot.test.ts`, this doesn't change bot behavior)

Read the current `PLAY_HAND` branch and the existing `drawToFive`
helper in `rules.ts` before writing anything — this fix reuses
`drawToFive` in a NEW place, it does not need a new drawing mechanism.

## The fix

Only `PLAY_HAND` can ever bring a hand to exactly 0 cards (`PLAY_STOCK`
and `PLAY_DISCARD` never touch the hand). In `PLAY_HAND`'s success
path, after computing `newHand` (the hand with the played card
removed): if `cardCount(newHand) === 0`, immediately refill it via
`drawToFive(currentDrawPile, currentUsedPile, newHand, rng)` BEFORE
returning — same player, same turn, `turn`/`turnNumber` UNCHANGED (this
is not a turn-ending event, the player keeps their turn and can
immediately act again with the new hand). Update `handCounts`,
`drawCount`, `usedCount` in the returned public state, and the
player's own `hand` in private state, to reflect the refill.

If `cardCount(newHand) > 0` after removing the played card (the normal
case — plenty of players still have cards), no refill happens, exactly
as today.

`drawToFive`'s existing behavior already handles every edge case
correctly for this new call site with zero changes to the helper
itself: it draws up to 5 or until the draw pile AND used pool are both
exhausted (never throws, never blocks — spec 40's own documented
resilient behavior). In the genuinely rare case where BOTH are empty,
the hand stays at 0 after the refill attempt — the player is then
correctly stuck with no `DISCARD` option, and must rely on other
sources (stock, own discard piles) to keep playing, or the game
proceeds to whoever's turn is next once THIS player's own stockpile
also can't produce a legal play... actually: re-read `PASS`'s existing
legality (`cardCount(myState.hand) !== 0` rejects it) — after this
fix, if the hand is truly stuck at 0 post-refill-attempt, `PASS` is
STILL legal (hand actually is 0), so the turn-ending path still exists
for that specific double-empty edge case. No engine change needed
there; just confirm this reasoning holds with a test (see below).

## Verify before reporting

Add tests: (1) playing the last hand card via `PLAY_HAND` when the
draw pile has 5+ cards refills the hand to 5, does NOT advance the
turn (`turnNumber` unchanged, `currentPlayer` unchanged), and the
player can immediately make another `PLAY_HAND`/`PLAY_STOCK`/etc call
in the same "turn"; (2) the refill correctly triggers a used-pool
recycle if the draw pile alone has fewer than 5 cards remaining
(reuse the same recycle mechanics `drawToFive` already has, just
confirm this NEW call site exercises it correctly); (3) the genuine
double-empty edge case (draw pile AND used pool both empty when the
hand empties) leaves the hand at 0 without throwing, and confirm
`PASS` remains legal in exactly that state. Run `npx tsc -b --noEmit`,
`npm test -- --run`, `npm run build` yourself, paste the actual
output (expect 1021 baseline plus your new tests), and report a
summary, every judgment call, and confirm the turn genuinely does NOT
advance on a mid-turn refill (walk through the exact state before and
after).
