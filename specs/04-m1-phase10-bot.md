# Spec 04 — M1: Phase 10 house-player bot strategy

Read `CLAUDE.md` first — binding. Read `src/card-games/rummy/bot.ts` as
your structural pattern reference (a `BotStrategy` from
`card-engine/bot.ts`, called once per turn-action — draw, lay, hit, or
discard are each a SEPARATE call, composing a full turn across repeated
invocations, exactly like Rummy's). Do not reinvent that calling
convention.

This spec assumes M0b (`src/card-games/phase10/{state,rules,scoring}.ts`)
already exists — read those files for the exact types
(`Phase10PublicState`, `Phase10PrivateState`, `Phase10Action`,
`Phase10Group`, `fullGroupCards`) before writing anything. If any type
named here doesn't match what M0b actually produced, use the real M0b
types (they're authoritative) and note the discrepancy in your report
rather than guessing.

## Files you own
```
src/card-games/phase10/bot.ts
src/card-games/phase10/bot.test.ts
```
Do not modify any other file. Do not run `git commit`.

## Strategy shape

```ts
export const phase10BotStrategy: BotStrategy<Phase10PublicState, Phase10PrivateState, Phase10Action> =
  (publicState, privateState, playerId) => { ... }
```

Decision order, first applicable branch wins (mirrors Rummy's bot.ts
structure — a defensive early-return chain, not a scored search):

**1. Round already over:**
```ts
if (publicState.roundOver) return { type: 'START_NEXT_ROUND' }
```

**2. Draw phase** (`publicState.turn.phase === 'draw'`):
- Let `pile = publicState.discardPile.cards`, `top = pile[pile.length-1]`
  (if `pile.length > 0`).
- If `pile.length > 0` and `top.meta?.kind !== 'skip'` (a Skip can never
  legally be drawn from discard — never even attempt it) and taking `top`
  would let the bot complete its current phase: call
  `canCompletePhase([...hand, top], requirement)` (see helper below) — if
  it returns `true`, return `{ type: 'DRAW_FROM_DISCARD' }`.
- Livelock-prevention fallback (same reasoning as Rummy's bot): if
  `publicState.stockCount === 0` and `pile.length >= 1` and `top.meta?.kind
  !== 'skip'`, return `{ type: 'DRAW_FROM_DISCARD' }` regardless of
  whether it completes anything — a plain top-card take is always legal
  when the pile is non-empty and its top isn't a Skip, and without this
  fallback the bot could propose `DRAW_FROM_STOCK` forever once stock is
  empty and the top card isn't immediately useful. (If the top card IS a
  Skip and stock is empty, do NOT take this fallback — fall through to
  `DRAW_FROM_STOCK`, which is what actually triggers discard-pile
  recycling or the correctly-blocked-round outcome; never try to draw a
  Skip from discard under any circumstance.)
- Otherwise: `return { type: 'DRAW_FROM_STOCK' }`.

**3. Discard-phase, haven't laid this round**
(`!publicState.hasLaidPhase[playerId]`):
- `requirement = PHASES[publicState.phaseIdx[playerId]]` (import `PHASES`
  from `./phases.ts`).
- `selection = findPhaseSelection(hand, requirement)` (helper below). If
  found, `return { type: 'LAY_PHASE', cardIds: selection }`.

**4. Discard-phase, already laid this round**
(`publicState.hasLaidPhase[playerId]` is `true` — either from a prior turn
or because case 3 didn't fire this call):
- Scan every group on the table (own and opponent's, via
  `publicState.groups`) for **any single hand card** (skip-kind cards
  excluded — never offered for a hit) that legally extends it. For each
  `(targetPlayerId, groupIndex, group)` in order, for each non-skip card
  in hand: compute `combined = [...fullGroupCards(publicState.groups,
  publicState.hits, targetPlayerId, groupIndex), card]` and check it with
  the matching predicate from `./classify.ts` for `group.type`
  (`isValidSet`/`isValidRun`/`isValidColorGroup`). On the first match,
  `return { type: 'HIT', targetPlayerId, groupIndex, cardIds: [card.id] }`
  (one card per action, same "runBotTurn gets called again" composition
  Rummy's `LAY_OFF` uses — no need to find the best hit, first legal one
  is fine, this is a "one reasonable strategy" bot per project scope, not
  an optimizer).

**5. Nothing productive found — discard.**
`return { type: 'DISCARD_CARD', cardId: selectDiscard(hand, publicState, playerId) }`.

## Helper functions (write these; exact behavior specified)

```ts
function canCompletePhase(cards: Card[], requirement: PhaseRequirement): boolean
```
`true` iff some subset of `cards` of size `requirement.parts.reduce((s,p)
=> s+p.count, 0)` — **that must include every card in `cards` beyond just
the drawn one is NOT required; search all size-matching subsets** —
passes `classifyPhaseHand`. Implementation: brute-force every combination
of that exact size from `cards` (hand-relevant sizes are small, ~11 cards
max, `requirement.parts` totals never exceed 9 — combinatorially fine,
same complexity class as `classify.ts`'s own partition search). Return
`true` on the first size-matching subset where `classifyPhaseHand(subset,
requirement).valid` is `true`.

```ts
function findPhaseSelection(cards: Card[], requirement: PhaseRequirement): string[] | null
```
Same search as `canCompletePhase` but returns the matching subset's card
`id`s (in any order) instead of a boolean, or `null` if none exists.
**Exclude Skip-kind cards from every candidate subset up front** (filter
them out of the search space entirely — they can never be part of a
phase, searching subsets that include one would only waste time and, if
`classifyPhaseHand`'s own Skip-rejection has any gap, could return an
illegal selection; don't rely solely on the downstream check).

```ts
function selectDiscard(hand: Card[], publicState: Phase10PublicState, playerId: string): string
```
Decision order:
1. **Tempo play:** if `hand` contains a Skip-kind card AND
   `!publicState.skipUsed[playerId]` (this round), return that Skip
   card's `id` (playing a Skip when available and not yet used this round
   is always at least tactically neutral and often good — it costs a
   turn from the opponent for free). If more than one Skip card is in
   hand, any one of them works — return the first found.
2. Otherwise, among all **non-wild, non-skip** (i.e. `meta.kind ===
   'number'`) cards in hand, compute a connectivity score for each and
   discard the LOWEST-scoring one (ties broken by highest
   `cardPenalty` — shed the most expensive isolated card first, same
   tiebreak convention as Rummy's bot):
   ```ts
   function connectivityScore(card, hand, requirement): number
   ```
   `score = (count of OTHER number-kind hand cards with the same rank) +
   (count of OTHER number-kind hand cards with the same suit/color whose
   numeric rank is within 3 of this card's) `. (A window of 3 is a
   reasonable proxy for "close enough to plausibly end up in the same run
   or color group together" — don't try to special-case which of the
   current phase's parts is a run vs a set vs a color, a single generic
   proximity+rank-match score is the whole heuristic, matching the
   project's explicit "one reasonable strategy, not optimal" scope.)
3. **Fallback** (hand has no non-wild-non-skip cards, or step 1/2 found
   nothing — extremely rare, e.g. an all-wild hand): return the `id` of
   any card in `hand` (e.g. `hand[0].id`) — must never crash or return
   `undefined`.

## Tests (`bot.test.ts`)

Mirror `rummy/bot.test.ts`'s style (literal fixture `Phase10PublicState`/
`Phase10PrivateState` objects, not full game sessions, for most cases —
construct the minimal state needed for each decision branch). Required
cases:

- `roundOver` → returns `START_NEXT_ROUND` regardless of anything else.
- Draw phase: discard pile top card that completes the phase when
  combined with hand → `DRAW_FROM_DISCARD`; discard pile top is a Skip
  card (even if it would otherwise "complete" something, which it can't
  since Skips are excluded from selections) → never returns
  `DRAW_FROM_DISCARD`, falls through to `DRAW_FROM_STOCK`; stock empty +
  non-Skip discard top that doesn't complete anything → still takes it
  (livelock-prevention fallback); stock empty + Skip on top of discard →
  returns `DRAW_FROM_STOCK` (not stuck, not incorrectly taking the Skip).
- `findPhaseSelection`/`canCompletePhase`: a hand that can complete the
  current phase → found, cardIds form a valid `classifyPhaseHand` result
  when checked back; a hand that can't → `null`/`false`; a hand that
  COULD complete the phase only by including a Skip card among the
  selected cards → must NOT be found (Skip-exclusion is working).
- `hasLaidPhase[playerId] === false` and a valid selection exists →
  returns `LAY_PHASE` with exactly that selection.
- `hasLaidPhase[playerId] === true` and some hand card extends an
  existing group (own or opponent's, cover both) → returns `HIT` with the
  correct `targetPlayerId`/`groupIndex`/that card's id.
- No lay, no hit possible → falls through to discard.
- `selectDiscard`: hand with an unused Skip card and `skipUsed[playerId]
  === false` → returns the Skip's id even if other cards look more
  "useful" by connectivity; hand with a Skip but `skipUsed[playerId] ===
  true` already → does NOT return the Skip, falls through to
  connectivity scoring instead; a hand of ordinary number cards → returns
  the lowest-connectivity one (construct a case where the "obviously
  isolated" card is clearly correct, e.g. one card totally disconnected
  in rank/color from the rest of a tightly-clustered hand); a tie in
  connectivity score → picks the higher-`cardPenalty` one.
- A full integration smoke test (like Rummy's `bot.test.ts` likely has
  one): build a real `Phase10Session` via `createPhase10Game`, run
  `runPhase10BotTurn` repeatedly in a loop until the bot's turn ends
  (`currentPlayer` changes or the round ends), asserting it never throws
  and every returned `outcome.ok` is `true` (a bot that ever proposes an
  action the validator rejects is a bug — same standard Rummy's bot holds
  itself to).

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean. Report exact output, files touched, any judgment call not
already decided above (should be none), confirm no `git commit` was run.
