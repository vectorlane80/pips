# Spec 35 — Rummy engine: N-player (2-4)

First milestone of the Rummy+Phase10 N-player charter. Generalizes
Rummy's engine from hardcoded 2-player to 2-4 players. Screens and
wiring are separate, later specs — this one is `src/card-games/rummy/`
only.

You own edits to EXACTLY these files:

- `src/card-games/rummy/state.ts`
- `src/card-games/rummy/rules.ts`
- `src/card-games/rummy/rummy.test.ts` (or whatever the actual test
  filename is — find it, there is exactly one test file for this
  module; read it in full before editing)

Do NOT touch `src/card-games/rummy/bot.ts`, `melds.ts`, `scoring.ts`,
`rank.ts` — read them (referenced below) but they need ZERO changes.
Confirmed by the lead before writing this spec: `bot.ts` already
iterates `Object.entries(publicState.melds)` generically and never
assumes exactly 2 players; `scoring.ts`'s `playerContributedMeldValue`
already takes an arbitrary `playerId`. If your own reading finds
otherwise, STOP and report the discrepancy rather than editing those
files.

Do NOT touch screens or `App.tsx` — those are later specs in this same
charter.

## Locked decisions (do not redesign any of this)

**Seat cap**: export `RUMMY_MIN_SEATS = 2` and `RUMMY_MAX_SEATS = 4`
from `state.ts` (mirror `UNO_MIN_SEATS`/`UNO_MAX_SEATS`'s exact
export style in `src/card-games/uno/state.ts`). The cap is derived from
deck math, already verified by the lead: `createStandardDeck()` is a
single 52-card deck, hand size stays 10 (unchanged) — at 5 players
`5×10+1=51` leaves only 1 stock card (degenerate), at 4 it leaves 11
(playable). This spec does NOT introduce a second deck — 4 is the real
ceiling for a single deck at this hand size, full stop.

**New public-state field**: add `seatOrder: string[]` to
`RummyPublicState` — the fixed player order for the whole match, set
once at `createRummyGame` and never reordered (unlike the OLD 2-player
code's `turn.playerOrder`, which got explicitly swapped `[prevB, prevA]`
each round — that mechanism is being replaced, not extended, per the
rotation rule below). This exactly mirrors `UnoPublicState.seatOrder`.

**`dealRound`** (`state.ts`): currently `(playerIds: [string,string],
rng) => { p0Hand, p1Hand, stock, discardPile }`. Change to `(playerIds:
string[], rng) => { hands: Record<string, Zone>; stock: Zone;
discardPile: Zone }` — deal 10 cards to each player in `playerIds`
order (a simple loop, same `dealCards` calls just N times instead of
2), then 1 to the discard pile, remainder to stock. Same function
shape Uno's `dealUnoRound` in `src/card-games/uno/state.ts` already
uses — read it for the exact loop pattern, don't invent a different
one. `dealRound` stays exported (rules.ts's `START_NEXT_ROUND` handler
still needs it).

**`createRummyGame`** (`state.ts`): `playerIds: [string, string]` →
`playerIds: string[]`. Build `turn = createTurnState<RummyPhase>
(playerIds, 'draw')`, and `melds`/`scores`/`handCounts`/`privateStates`
all via a loop over `playerIds` (e.g. `Object.fromEntries(playerIds.map
(id => [id, ...]))`) instead of the old two-literal-key object
construction. Set the new `seatOrder: playerIds` field. This function
does NOT itself validate `playerIds.length` against the seat-cap
constants — same as `createUnoGame`, that validation belongs to the
wiring layer (a later spec), not this pure constructor.

**`START_NEXT_ROUND` handler** (`rules.ts`, inside `makeValidator`):
currently swaps exactly two players' start order (`const [prevA, prevB]
= publicState.turn.playerOrder; const nextOrder = [prevB, prevA]`).
Replace with Uno's exact rotation mechanism (`src/card-games/uno/
rules.ts`'s own `START_NEXT_ROUND` handler — read it, mirror it
precisely, this is not a place for a different rotation idea): rotate
against the FIXED `publicState.seatOrder` (not the previous round's
turn order), computing the new starter as `seatOrder[(publicState.
roundNumber) % seatOrder.length]` (round numbers are 1-based here,
unlike Uno's 0-based `round` — adjust the modulus arithmetic so round 1
starts at `seatOrder[0]`, round 2 at `seatOrder[1]`, etc., wrapping —
verify this by hand against a 3-player, 4-round trace before writing
the test for it, don't guess). Build the new turn via `createTurnState
(seatOrder, 'draw')` then call `advanceTurn` the correct number of
times to reach that starter seat (exactly Uno's pattern). Rebuild
`melds`/`handCounts`/`privateStates` via a loop over `seatOrder`
(same shape as `createRummyGame`), using `dealRound(seatOrder, rng)`'s
new `hands: Record<string,Zone>` return shape.

**`finishRoundByGoingOut`** (`rules.ts`): currently hardcodes exactly
one "opponent" (`publicState.turn.playerOrder.find(p => p !== playerId)`)
and applies two different formulas (the going-out player gets only
their own meld contribution; the opponent gets their contribution minus
their remaining deadwood). Generalize to a SINGLE uniform formula
applied in a loop over every seated player (`publicState.seatOrder`),
INCLUDING the going-out player — do not special-case them:

```
for (const p of publicState.seatOrder) {
  const handCards = p === playerId ? [] : privateStates[p].hand.cards
  newScores[p] = publicState.scores[p]
    + playerContributedMeldValue(groups, contributedBy, p)
    - deadwood(handCards)
}
```

This is a genuine simplification, not just a generalization — the
going-out player's hand is empty so `deadwood([])` is naturally 0,
which is exactly the old `playerDelta` formula's behavior, so the old
two-formula split was never actually necessary even at 2 players; one
loop covers both cases correctly. Verify this equivalence yourself
against the OLD 2-player formula by hand before trusting it, and say so
in your report.

**Match-win logic** (inside the same function): currently a 2-player
if/else tree. Generalize: after computing `newScores` for everyone,
find every player whose score is `>= publicState.target`. If none,
`matchWinnerId = null`. If the GOING-OUT player (`playerId`) is among
them, they win outright regardless of anyone else's score (mirrors the
old tiebreak intent: going out wins ties). Otherwise, among the
players who ARE at/above target, the single highest-scoring one wins;
if there's a tie among THEM (not involving the going-out player, who's
already been ruled out of this branch), break it by earliest position
in `publicState.seatOrder` — pick whichever deterministic rule you
implement, but it must be deterministic and documented in a comment,
not arbitrary object-iteration order.

## Tests

Read the existing test file in full first — you are extending an
existing suite, not replacing it. Every existing 2-player test must
still pass unchanged (2-player behavior must be provably identical
after this generalization — if any existing assertion's expected value
needs to change, that's a red flag your generalization altered 2-player
behavior, which is not allowed; stop and report rather than "fixing" the
assertion). Add new tests covering 3 and 4 player games specifically:
a full round with melds/layoffs from multiple players, a going-out
scenario with 3+ players verifying every non-going-out player's score
drops by their own deadwood correctly (not just the "opponent" in a
2-player sense), a `START_NEXT_ROUND` rotation trace across at least 3
consecutive rounds at 3 or 4 players confirming the starter actually
rotates through every seat in `seatOrder` order (hand-verify the
expected starter for each round before writing the assertion — don't
guess the expected seat). If you judge it useful, a property-style test
cycling seat count 2-4 across many trials (Uno's `uno.test.ts` has this
pattern, e.g. `2 + (trial % 3)` to cycle 2..4) proving invariants like
"sum of all deltas across a going-out round equals the total meld value
on the table" is welcome but not required — use your judgment on
whether it adds real coverage beyond the targeted tests above.

## Verify before reporting

`npx tsc -b --noEmit` silent. `npm test` green — report the exact
before/after test count (this repo is at 953 currently; you're only
touching Rummy's own test file, so the delta should be exactly however
many new tests you add, nothing should be REMOVED). `npm run build`
clean. Report explicitly: your hand-verified rotation trace (which seat
starts each of the first 3-4 rounds at 3 players, and why), your
verification that the new uniform `finishRoundByGoingOut` formula is
mathematically identical to the old 2-player one, and the exact
tiebreak rule you implemented for simultaneous target-crossing among
non-going-out players.
