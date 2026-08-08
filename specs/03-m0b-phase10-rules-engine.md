# Spec 03 — M0b: full Phase 10 rules engine

Read `CLAUDE.md` at the repo root first — binding. Read `CHARTER.md` for
context. Everything you need is decision-locked below. Work only in the
files listed. Do not run `git commit`.

This wires `src/card-games/phase10/{deck,phases,classify}.ts` (already
built and fixed) onto `card-engine`'s `sync.ts`/`turn-engine.ts` seams,
mirroring `src/card-games/rummy/{state.ts,rules.ts}` exactly in structure
— **read those two files first**, they are your pattern reference. Do not
reinvent the stock-visible-to-nobody closure pattern; copy its shape.

## Files you own (create these, nothing else)
```
src/card-games/phase10/scoring.ts
src/card-games/phase10/scoring.test.ts
src/card-games/phase10/state.ts
src/card-games/phase10/rules.ts
src/card-games/phase10/phase10.test.ts   (integration harness, like rummy.test.ts)
```

Do not modify `deck.ts`, `phases.ts`, or `classify.ts` (already built) or
any file outside this list. Do not import React or anything from
`src/screens/`, `src/components/`, `src/games/`, `src/state/room.ts`.

## `scoring.ts`

```ts
export function cardPenalty(card: Card): number
export function handPenalty(cards: Card[]): number
```
`cardPenalty`: numbers 1-9 → 5, numbers 10-12 → 10, Skip (`meta.kind ===
'skip'`) → 15, Wild (`meta.kind === 'wild'`) → 25. Read the number from
`Number(card.rank)` only when `meta.kind === 'number'`. `handPenalty` sums
`cardPenalty` over an array of cards. Tests: one of each kind/value
bucket, an empty array → 0, a full 10-card mixed hand computed by hand.

## `state.ts`

Mirror `rummy/state.ts`'s shape and imports. Key differences from Rummy,
all deliberate:

```ts
export type Phase10TurnPhase = 'draw' | 'discard'

export interface Phase10Group {
  type: import('./classify.ts').GroupType
  zone: Zone   // the cards THIS player originally laid for this group
}

export interface Phase10Hit {
  id: string
  playerId: string          // who played these cards (hit them onto the group)
  targetPlayerId: string    // whose group (own or opponent's) this extends
  targetGroupIndex: number  // index into groups[targetPlayerId]
  cards: Card[]
}

export interface Phase10PublicState {
  turn: TurnState<Phase10TurnPhase>
  discardPile: Zone
  stockCount: number
  groups: Record<string, Phase10Group[]>   // playerId -> groups THEY laid this round
  hits: Phase10Hit[]
  hasLaidPhase: Record<string, boolean>    // this round only, reset each round
  phaseIdx: Record<string, number>         // 0-based (0 = Phase 1 .. 9 = Phase 10). PERSISTS
                                             // across rounds — never reset by START_NEXT_ROUND.
  skipUsed: Record<string, boolean>        // keyed by the player who PLAYED a skip — caps at
                                             // one skip actually applied per player per round
                                             // (this round only, reset each round)
  scores: Record<string, number>           // match score, accumulates across rounds. LOWER IS
                                             // BETTER — this is the opposite convention from
                                             // Rummy's state.ts, which has higher-wins. There is
                                             // NO target score to cross; winning is entirely
                                             // about completing Phase 10, scores only break ties.
  roundNumber: number
  roundOver: boolean
  roundWinnerId: string | null   // who went out, or null if the round was blocked (no draw possible)
  matchWinnerId: string | null
  handCounts: Record<string, number>
}

export interface Phase10PrivateState {
  hand: Zone
}

export type Phase10Action =
  | { type: 'DRAW_FROM_STOCK' }
  | { type: 'DRAW_FROM_DISCARD' }   // top card only, no index — real rule difference from Rummy
  | { type: 'LAY_PHASE'; cardIds: string[] }
  | { type: 'HIT'; targetPlayerId: string; groupIndex: number; cardIds: string[] }
  | { type: 'DISCARD_CARD'; cardId: string }
  | { type: 'START_NEXT_ROUND' }
```

`fullGroupCards(groups, hits, targetPlayerId, groupIndex): Card[]` — same
shape as Rummy's `fullMeldCards`: the group's original `zone.cards` plus
every hit's `cards` where `targetPlayerId`/`targetGroupIndex` match,
flattened in order.

`Phase10Session { session: HostSession<Phase10PublicState,
Phase10PrivateState>; stock: Zone; rng: () => number }` — same
stock-outside-the-session pattern as `RummySession`.

`createPhase10Game(playerIds: [string, string], seed: number):
Phase10Session` — deal via a shared `dealRound(playerIds, rng)` helper
(exported, reused by `rules.ts`'s `START_NEXT_ROUND`, same as Rummy):
`createPhase10Deck()` (NOT `createStandardDeck` — this game has its own
deck), shuffle, deal 10 to each player, flip 1 to start the discard pile,
rest is stock. **No special-casing if the starting discard flip happens to
be a Skip** — it just sits there untakeable-from-discard like any other
Skip would, exactly like the normal in-round rule; the first player simply
draws from stock instead. Initial `Phase10PublicState`: `groups: {[p0]:[],
[p1]:[]}`, `hits: []`, `hasLaidPhase: {[p0]:false,[p1]:false}`,
`phaseIdx: {[p0]:0,[p1]:0}` (both start on Phase 1), `skipUsed:
{[p0]:false,[p1]:false}`, `scores: {[p0]:0,[p1]:0}`, `roundNumber: 1`,
`roundOver: false`, `roundWinnerId: null`, `matchWinnerId: null`,
`handCounts: {[p0]:10,[p1]:10}`.

## `rules.ts`

Mirror `rummy/rules.ts`'s `makeValidator`/`applyPhase10Action`/
`runPhase10BotTurn` structure exactly (the stock-closure commit-only-on-
`outcome.ok` pattern is non-negotiable — copy it verbatim, adapted to
Phase10's types). Import `isValidSet`, `isValidRun`, `isValidColorGroup`,
`classifyGroup`, `classifyPhaseHand` from `./classify.ts` and `PHASES`
from `./phases.ts`.

**`START_NEXT_ROUND`** (not gated by whose turn it is, same as Rummy):
- Reject unless `publicState.roundOver && !publicState.matchWinnerId`.
- Alternate who starts (`[prevB, prevA]`, same as Rummy).
- Fresh `dealRound`, fresh `turn` via `createTurnState(nextOrder, 'draw')`.
- Reset **round-scoped** fields: `groups: {[a]:[],[b]:[]}`, `hits: []`,
  `hasLaidPhase: {[a]:false,[b]:false}`, `skipUsed: {[a]:false,[b]:false}`,
  `roundOver: false`, `roundWinnerId: null`, `roundNumber: +1`.
- **Do NOT reset `phaseIdx` or `scores`** — those persist across the whole
  match, that's the entire point of a multi-round Phase 10 match.

**Turn-gated actions** (all others): reject with `'not your turn'` if
`currentPlayer(publicState.turn) !== playerId`.

**`DRAW_FROM_STOCK`**: identical logic to Rummy's handler (draw top of
stock if non-empty; else recycle discard via `recyclePile(discardPile,
stock, {keepTop:1, shuffle:(cards)=>shuffleDeck(cards,rng)})` if discard
has ≥2 cards; else if discard has exactly 1 card, reject with `'stock is
empty — draw from the discard pile instead'`; else (discard also empty)
the round is blocked: `{ok:true, publicState:{...publicState, roundOver:
true, roundWinnerId: null}, privateStates}` — **no score/phaseIdx changes
on a block**, nobody completed or failed anything, it's a dead round).
Must be `turn.phase === 'draw'`.

**`DRAW_FROM_DISCARD`**: must be `turn.phase === 'draw'`. Reject if
`discardPile` is empty. Let `top = topCard(discardPile)`. **If
`top.meta?.kind === 'skip'`, reject**: `'a Skip card can never be picked
up from the discard pile — draw from the stock instead'`. Otherwise move
just that one card into the hand (`moveCards(discardPile, myHand,
[top.id])`), set `turn.phase` to `'discard'`. No obligation concept —
Phase 10 has no reach-in, so there's nothing further to track.

**`LAY_PHASE { cardIds }`**: must be `turn.phase === 'discard'` (i.e.
already drawn this turn — same "discard" phase name Rummy uses to mean
"post-draw action window," not literally about discarding). Reject if
`hasLaidPhase[playerId]` is already `true` (`'you have already laid your
phase this round'`). Resolve `selected = myHand.cards.filter(c =>
cardIds.includes(c.id))`; reject if `selected.length !== cardIds.length`
(`'card not in hand'`). Reject if any selected card has `meta?.kind ===
'skip'` (`'a Skip card cannot be used in a phase'`). Look up
`requirement = PHASES[phaseIdx[playerId]]`, call
`classifyPhaseHand(selected, requirement)`; reject if `!valid`
(`'that does not complete your phase'`). On success: remove `cardIds` from
`myHand` (one `removeCardsById` call); for each entry in
`classification.groups`, create a fresh `Zone` via `createPlayerZone(
playerId, `p10group-${existingGroupCount + i}`, 'public')` populated with
that group's cards (`addCards`), and append `{type: group.type, zone}` to
`groups[playerId]`. Set `hasLaidPhase[playerId] = true`. If the resulting
hand is empty, call the shared `finishRoundByGoingOut` helper (below);
otherwise return the updated public/private state (update `handCounts`).

**`HIT { targetPlayerId, groupIndex, cardIds }`**: must be `turn.phase ===
'discard'`. Reject unless `hasLaidPhase[playerId]` is `true`
(`'lay your own phase before hitting'`). Reject if `groups[targetPlayerId]
?.[groupIndex]` doesn't exist (`'no such group'`). Resolve `selected`
same way as `LAY_PHASE`, reject on missing cards or if `cardIds.length ===
0`, reject if any selected card is Skip-kind (`'a Skip card cannot be used
in a phase'`). Compute `currentFull = fullGroupCards(groups, hits,
targetPlayerId, groupIndex)`, `combined = [...currentFull, ...selected]`.
Look up the group's `type` and call the matching un-wrapped predicate
(`isValidSet`/`isValidRun`/`isValidColorGroup`) on `combined` — **not**
`classifyGroup` (no exact-count constraint when extending an existing
group). Reject if invalid (`'those cards cannot be added to that group'`).
On success: `removeCardsById(myHand, cardIds)` (cards leave the hand but
are **not** merged into the target zone — same append-only attribution
pattern as Rummy's `RummyLayoff`), push a new `Phase10Hit` record (`id:
`hit-${hits.length}`, playerId, targetPlayerId, targetGroupIndex:
groupIndex, cards: removed`) onto `hits`. If hand now empty, go through
`finishRoundByGoingOut`; else return updated state (`handCounts`).

**`DISCARD_CARD { cardId }`**: must be `turn.phase === 'discard'`. Reject
if `cardId` not in hand. Move it to `discardPile`. If the resulting hand is
empty: call `finishRoundByGoingOut` (pass `newDiscard`; turn doesn't
matter, the round is over). Otherwise: determine the next `turn` state —
**if** the discarded card's `meta?.kind === 'skip'` **and**
`!skipUsed[playerId]` (this round), set `skipUsed[playerId] = true` and
use `skipNext(turn, 'draw')` instead of the normal advance (in this
2-player game, `skipNext` moves the index by 2, which lands back on the
SAME player — i.e. the opponent's turn is skipped and it becomes this
player's turn again; this is `card-engine/turn-engine.ts`'s documented
2-player `skipNext` behavior, exactly what's needed here, don't second-
guess it). **Otherwise** (not a skip, or a skip already used against the
opponent this round — discarding a second Skip just discards normally,
no further effect) use `advanceTurn(turn, 'draw')`. Return updated state
(`discardPile`, `turn`, `handCounts`).

**Shared `finishRoundByGoingOut` helper** (module-private function, called
from all three action handlers above):
```ts
function finishRoundByGoingOut(
  publicState: Phase10PublicState,
  privateStates: Record<string, Phase10PrivateState>,
  playerId: string,               // who went out
  newGroups: Record<string, Phase10Group[]>,
  newHits: Phase10Hit[],
  newHasLaidPhase: Record<string, boolean>,
  newDiscard?: Zone,
): ActionOutcome<Phase10PublicState, Phase10PrivateState>
```
Logic:
1. Round scoring: the player who went out scores `+0` this round. Every
   OTHER player (in this 2-player game, just the opponent) scores
   `+handPenalty(theirHand.cards)` added to their existing
   `publicState.scores[opponentId]` (lower cumulative is better — do not
   invert or subtract, just add the penalty).
2. Phase advancement: for each player in `publicState.turn.playerOrder`,
   if `newHasLaidPhase[player]` is `true`, their `phaseIdx` for NEXT round
   is `Math.min(phaseIdx[player] + 1, 9)` (capped — completing Phase 10
   doesn't advance past it); if `false`, `phaseIdx` stays the same (they
   repeat their current phase next round). Compute this into a
   `newPhaseIdx` object but note: **this becomes the value carried into
   the NEXT round via `phaseIdx`, so write it into the returned
   `publicState.phaseIdx` now** — `START_NEXT_ROUND` deliberately does
   NOT touch `phaseIdx`, so the advancement must happen here, at round-
   end, not there.
3. Match win check: a player "completed Phase 10 this hand" iff
   `newHasLaidPhase[player] === true` AND their **pre-advancement**
   `publicState.phaseIdx[player] === 9` (i.e. the phase they just
   successfully laid was Phase 10 itself, index 9). Collect every player
   for whom this is true into `completers`. If `completers.length > 0`:
   the match is over. `matchWinnerId` = the completer with the lowest
   value in the NEW `scores` (post this round's scoring, from step 1); if
   there's an exact tie, pick whichever completer appears first in
   `publicState.turn.playerOrder` (deterministic, arbitrary but stable —
   document this as the tiebreak-of-last-resort in a code comment, real
   ties are vanishingly rare but the function must be total). If
   `completers.length === 0`, `matchWinnerId` stays `null`.
4. Return `{ ok: true, publicState: {...publicState, groups: newGroups,
   hits: newHits, hasLaidPhase: newHasLaidPhase, phaseIdx: newPhaseIdx,
   ...(newDiscard ? {discardPile: newDiscard} : {}), scores: newScores,
   matchWinnerId, roundOver: true, roundWinnerId: playerId, handCounts:
   {...publicState.handCounts, [playerId]: 0}}, privateStates }`.

**`applyPhase10Action`/`runPhase10BotTurn`**: same shape as Rummy's
`applyRummyAction`/`runRummyBotTurn` — candidate-stock closure, commit
only on `outcome.ok`.

## `phase10.test.ts` — integration harness (vitest, `describe`/`it`)

Mirror `rummy/rummy.test.ts`'s style and rigor (literal fixture hands where
you need exact control — you may need to construct a `Phase10Session` by
hand with a specific dealt hand rather than relying on the shuffled deal,
same as Rummy's tests do for meld scenarios). Required coverage:

- **Deal correctness**: 10 cards each, discard has 1, stock has 87, no
  duplicate ids across the whole session, `phaseIdx` both start at 0.
- **Draw**: from stock (phase→discard, stock count -1); from discard
  (top only, phase→discard); rejecting `DRAW_FROM_DISCARD` when the top
  card is a Skip, with a clear reason.
- **Lay phase**: happy path (valid composition succeeds, `hasLaidPhase`
  flips true, `groups` populated with correct `type`s); rejects a second
  `LAY_PHASE` the same round; rejects a composition that doesn't match
  the current `PHASES[phaseIdx[playerId]]`; rejects a selection containing
  a Skip card even if the rest would otherwise work; going out via
  `LAY_PHASE` (laying your entire remaining hand as your phase) triggers
  `finishRoundByGoingOut`.
- **Hit**: rejects hitting before your own phase is laid; happy path onto
  your own group; happy path onto the opponent's group; rejects an
  invalid addition (breaks the run/set/color constraint); rejects hitting
  a nonexistent group index; going out via `HIT`.
- **Discard**: ends the turn normally (`advanceTurn`); going out via
  `DISCARD_CARD`; discarding a Skip card skips the opponent's turn (in
  2-player, verify `currentPlayer` after the discard is the SAME player
  who discarded the Skip — the skip mechanically returns to them);
  discarding a second Skip the same round (after one already skipped
  successfully) does NOT skip again, just advances normally — verify
  `currentPlayer` is the opponent this time.
- **Stock recycling**: draining stock to empty then drawing recycles the
  discard pile (keeping its top card in place), matching Rummy's test for
  this.
- **Blocked round**: stock empty and discard down to 0 cards (construct by
  hand) → `DRAW_FROM_STOCK` sets `roundOver:true, roundWinnerId:null`, and
  verify NO score or `phaseIdx` change happened for either player.
- **Scoring exact values**: construct a going-out scenario with a known
  opponent hand (e.g. one card each of value-5, value-10, Skip, Wild) and
  assert the opponent's score increases by exactly `5+10+15+25=55`, the
  winner's score is unchanged.
- **Phase advancement**: a round where the winner had laid their phase
  (their `phaseIdx` increments by 1 for next round) and the loser had NOT
  laid theirs (`phaseIdx` unchanged) — verify both after
  `finishRoundByGoingOut` runs (check the returned `publicState` directly,
  don't need a full `START_NEXT_ROUND` round-trip for this one).
- **Match win, single completer**: a player whose `phaseIdx` was 9 (Phase
  10) lays it and goes out → `matchWinnerId` is set to them immediately
  (not just `phaseIdx` incrementing past 9 — 9+1 capped at 9, and
  `matchWinnerId` set the same action).
- **Match win, simultaneous completers, tiebreak**: construct a scenario
  where BOTH players have `phaseIdx === 9` and both have
  `hasLaidPhase === true` in the same round (one hits/lays earlier, the
  other goes out later that round) — verify `matchWinnerId` is whichever
  ends up with the lower score after that round's scoring.
- **`START_NEXT_ROUND`**: resets `groups`/`hits`/`hasLaidPhase`/`skipUsed`/
  `roundOver`/`roundWinnerId`, increments `roundNumber`, deals fresh
  hands — but explicitly assert `phaseIdx` and `scores` are UNCHANGED
  from before the call (this is the detail most likely to get silently
  broken by a careless implementation that copies Rummy's reset-everything
  pattern too literally).
- **Hidden-info leak check**: derive a snapshot for player A (via
  `deriveSnapshot` from `card-engine/sync.ts`) and confirm it contains
  no trace of player B's hand contents (same style as Rummy's/card-
  engine's existing leak tests — look at `sync.test.ts` for the pattern).
- **Malformed action rejection**: an action with a garbage `type`, or
  `cardIds` that isn't an array, is rejected with `ok:false` and does NOT
  throw.

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean. In your report: exact command output, every file touched, any
judgment call you had to make that wasn't already decided above (there
shouldn't be any), and confirmation you didn't touch anything outside
"Files you own" or run `git commit`.
