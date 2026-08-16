# Spec 37 — Phase 10 engine: N-player (2-6)

Third milestone of the Rummy+Phase10 charter (mirrors spec 35's Rummy
engine work — read spec 35 AND the actual landed diff in
`src/card-games/rummy/state.ts`/`rules.ts` first, since Phase 10's
current code is structurally almost identical to Rummy's PRE-
generalization shape, and you should reuse the same techniques, not
reinvent them).

You own edits to EXACTLY these files:

- `src/card-games/phase10/state.ts`
- `src/card-games/phase10/rules.ts`
- `src/card-games/phase10/phase10.test.ts`
- `src/card-games/phase10/bot.test.ts` (only if it constructs a
  `Phase10PublicState` literal that breaks after `seatOrder` is added —
  confirm by reading it first, same situation Rummy's `bot.test.ts` was
  in)

Do NOT touch `src/card-games/phase10/bot.ts`, `classify.ts`,
`scoring.ts`, `phases.ts`, `deck.ts` — confirmed by the lead before
writing this spec: `bot.ts` already iterates `Object.entries(
publicState.groups)` generically with no player-count assumption. If
your own reading finds otherwise, STOP and report rather than editing.

Do NOT touch Rummy's files (spec 35/36, already done) or any screens/
`App.tsx` — those are separate, later specs.

## Locked decisions

**Seat cap**: export `PHASE10_MIN_SEATS = 2` / `PHASE10_MAX_SEATS = 6`
from `state.ts` (mirror `RUMMY_MIN_SEATS`/`RUMMY_MAX_SEATS`'s exact
export style). Derived from real deck math, verified by the lead:
`createPhase10Deck()` is 108 cards (96 number + 4 skip + 8 wild), hand
size stays 10 — at 6 players `6×10+1=61`, leaving 47 in stock,
comfortable. This also matches real Phase 10's own official 6-player
cap independently, which is a coincidence worth noting in your report
but not a reason to second-guess the number — both lines of reasoning
agree.

**New public-state field**: add `seatOrder: string[]` to
`Phase10PublicState` — same purpose and shape as Rummy's, the FIXED
player order for the whole match, never reordered by round-end logic.

**`dealRound`** (`state.ts`): currently `(playerIds: [string,string],
rng) => { p0Hand, p1Hand, stock, discardPile }`. Change to
`(playerIds: string[], rng) => { hands: Record<string, Zone>; stock:
Zone; discardPile: Zone }` — same loop transformation as Rummy's
`dealRound` (deal 10 to each player in order, 1 to discard, remainder
to stock). Stays exported.

**`createPhase10Game`** (`state.ts`): `playerIds: [string, string]` →
`string[]`. Build `groups`/`hasLaidPhase`/`phaseIdx`/`scores`/
`handCounts`/`privateStates` via a loop over `playerIds`, same pattern
as `createRummyGame`. Set `seatOrder: playerIds`. No seat-count
validation here (wiring layer's job, same as Rummy/Uno).

**`START_NEXT_ROUND` handler** (`rules.ts`): currently swaps exactly
two players (`[prevA, prevB] → [prevB, prevA]`). Replace with the SAME
rotation mechanism Rummy's spec 35 already implemented (rotate against
the fixed `publicState.seatOrder`, `createTurnState` + `advanceTurn`
exactly `publicState.roundNumber % seatOrder.length` times — read
Rummy's ALREADY-LANDED `rules.ts` for the exact 1-based-round-number
arithmetic, it's correct and proven, copy it, don't re-derive it from
scratch or from Uno's 0-based version). Rebuild `groups`/
`hasLaidPhase`/`handCounts`/`privateStates` via a loop over
`seatOrder`. **Do NOT touch `phaseIdx`** in this handler — the existing
comment already explains why (phase advancement happens in
`finishRoundByGoingOut`, not here) and that design is unchanged and
correct; just make sure your loop-based rebuild doesn't accidentally
start touching it.

**`finishRoundByGoingOut`** (`rules.ts`): currently finds exactly one
`opponentId` and gives them `+= handPenalty(their hand)` while the
going-out player gets `+= 0` (implicit, via `[playerId]:
publicState.scores[playerId]`, i.e. unchanged). Generalize to a loop
over every OTHER seated player (`publicState.seatOrder`, excluding
`playerId`), each getting `scores[p] += handPenalty(privateStates[p]
.hand.cards)`; the going-out player's own score is explicitly
UNCHANGED (this game's rule, unlike Rummy, never gives the going-out
player a positive contribution — Phase 10 only ever penalizes hand
leftovers, going out just means paying nothing this round). This is a
straightforward loop generalization with no equivalent-formula subtlety
like Rummy needed — verify it by hand anyway before trusting it (both
players' old-code deltas at 2 players must match the new loop's output
exactly for the SAME two players).

**Match-win / phase-advancement logic**: ALREADY N-player-safe as
written (`completers = publicState.turn.playerOrder.filter(...)`, the
tiebreak-by-lowest-score-then-by-playerOrder-position loop, and the
`phaseIdx` advancement loop all already iterate generically with no
2-hardcoding). Confirmed by the lead — do NOT change this logic at
all, just make sure it keeps working once `playerOrder`/`seatOrder`
can have more than 2 entries (it should, since it was never actually
keyed to exactly 2).

## Tests

Read `phase10.test.ts` in full first — extend, don't replace. Every
existing 2-player test must still pass with UNCHANGED expected values
(if you find yourself wanting to change an existing assertion's
expected value, STOP and report rather than silently "fixing" it — that
happened once already this charter, in Rummy's spec 35, and it turned
out to be a real bug in that spec, not a false alarm; take the same
signal seriously here). Add tests covering 3-6 player games: a round
where multiple players haven't gone out and each gets penalized by
their OWN hand penalty (not just "the opponent"'s), a phase-completion
match-win scenario at 3+ players (including a tie-for-lowest-score
case among multiple simultaneous completers, if you can construct one,
to prove the existing tiebreak logic really does generalize), and a
`START_NEXT_ROUND` rotation trace across several rounds at 3+ players
(hand-verify the expected starter for each round exactly the way
Rummy's spec 35 did, don't guess).

## Verify before reporting

`npx tsc -b --noEmit` silent. `npm test` green — report exact before/
after count (958 baseline). `npm run build` clean. Report your hand-
verified rotation trace, confirm the `finishRoundByGoingOut`
generalization matches the old 2-player code exactly at 2 players, and
confirm you did NOT modify the match-win/phase-advancement logic
(since it needed no changes) or `phaseIdx` handling inside
`START_NEXT_ROUND`.
