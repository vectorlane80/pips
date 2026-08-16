# Spec 34 — Uno module (deck, state, rules, bot, tests)

You own EXACTLY these five new files — create the directory:

- `src/card-games/uno/deck.ts`
- `src/card-games/uno/deck.test.ts`
- `src/card-games/uno/state.ts`
- `src/card-games/uno/rules.ts`
- `src/card-games/uno/bot.ts`
- `src/card-games/uno/uno.test.ts`

Do NOT touch any other file. No React; import only from `src/engine/`,
`src/card-engine/` (Zone/deck helpers), and within the folder. Before
writing, READ `src/card-games/rummy/{state,rules,bot}.ts` and
`src/board-games/mexican-train/{state,rules,bot}.ts` — Uno mirrors Rummy's
hidden-stock-outside-HostSession pattern (see `docs/card-engine.md` §5) and
Mexican Train's N-player, `Record<playerId, T>`-everywhere shape (NOT
Rummy/Phase10's 2-player-only shape — Uno must work for any player count
`UNO_MIN_SEATS..UNO_MAX_SEATS`, see below). All state plain serializable
data — no class instances, no functions in state, JSON round-trip lossless.

This spec covers the BASE GAME ONLY. Do NOT implement: the Uno-call
window/race mechanism, or house rules. Both are later specs (34b, 34c).
Nobody can be "caught" for not calling Uno yet — that's correct for this
spec, not a gap to fill in.

## Player count

`UNO_MIN_SEATS = 2`, `UNO_MAX_SEATS = 10`. This is a deliberate override of
the design handoff's 4-seat cap — build genuinely N-player. The 10 ceiling
is deck math, not arbitrary: 108 cards, 7-card hands, 1 card flipped to
start the discard pile — at 10 players the initial deal consumes 70 cards,
leaving 37 for stock, comfortably more than at higher counts. Do not raise
it further without doing the same math; do not hardcode 2 or 4 anywhere.

## deck.ts

```ts
export type UnoColor = 'red' | 'yellow' | 'green' | 'blue'
export type UnoCardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4'

export interface UnoCard {
  id: string
  color: UnoColor | 'wild'   // 'wild' for both wild and wild4 cards
  kind: UnoCardKind
  value: number | null       // 0-9 for kind 'number', null otherwise — always present, never omitted
}

export function createUnoDeck(): UnoCard[]
```

Build in this exact order (id = `uno-0` .. `uno-107`, sequential, so the
composition is auditable by index range):

For each color in `['red', 'yellow', 'green', 'blue']` (in that order):
1. One `{ kind: 'number', value: 0 }`.
2. For value 1..9, two copies each (`{ kind: 'number', value }` ×2) —
   loop value outermost, copy innermost, so same-value copies are adjacent.
3. Two `{ kind: 'skip', value: null }`.
4. Two `{ kind: 'reverse', value: null }`.
5. Two `{ kind: 'draw2', value: null }`.

(25 cards per color × 4 = 100.)

Then: four `{ color: 'wild', kind: 'wild', value: null }`, then four
`{ color: 'wild', kind: 'wild4', value: null }`. (108 total.)

## deck.test.ts

Real assertions: exactly 108 cards, all unique ids; exactly 4 colors × 25
each (1 zero + 18 numbers + 2+2+2 action) = 100 colored cards; exactly 4
wild + 4 wild4; every `value` is `null` except `kind === 'number'`, where
it's 0-9; count of each number value 1-9 is exactly 2 per color, 0 is
exactly 1 per color.

## state.ts

```ts
export type UnoStage = 'play' | 'roundOver' | 'over'

export interface UnoLastAction {
  by: string
  kind: 'play' | 'draw' | 'pass'
  card: { color: UnoColor | 'wild'; kind: UnoCardKind; value: number | null } | null  // set for 'play' only
  drewCount: number   // for 'draw': always 1. Nonzero here also on a 'play' of draw2/draw4/wild4-that-drew, recording how many the NEXT player drew (0 if none) — lets the UI say "Riley drew 2"
}

export interface UnoRoundResult {
  outPlayerId: string
  pointsAdded: Record<string, number>   // what THIS round added to scores, keyed by playerId, out-player's own entry is 0
}

export interface UnoPublicState {
  stage: UnoStage
  turn: TurnState<'play'>
  seatOrder: string[]                    // N players, fixed for the whole match
  round: number                          // 0-based
  activeColor: UnoColor                  // color new plays are matched against (independent of the top card's own color once a wild is in play)
  discardPile: Zone<UnoCard>             // top = last played; visible to everyone
  stockCount: number
  handCounts: Record<string, number>
  hasDrawnThisTurn: boolean              // reset false whenever the turn advances to a new player
  pendingWild: { cardId: string; isDraw4: boolean } | null
  scores: Record<string, number>         // running total, HIGHER is better, first to UNO_TARGET wins
  roundResult: UnoRoundResult | null
  matchWinnerId: string | null
  lastAction: UnoLastAction | null
}

export interface UnoPrivateState { hand: Zone<UnoCard> }

export type UnoAction =
  | { type: 'PLAY_CARD'; cardId: string }
  | { type: 'CHOOSE_COLOR'; color: UnoColor }
  | { type: 'DRAW_CARD' }
  | { type: 'PASS' }
  | { type: 'START_NEXT_ROUND' }

export interface UnoSession {
  session: HostSession<UnoPublicState, UnoPrivateState>
  stock: Zone<UnoCard>       // host-only, mirrors Rummy's stock wrapper — never part of HostSession
  rng: () => number
}

export const UNO_MIN_SEATS = 2
export const UNO_MAX_SEATS = 10
export const UNO_HAND_SIZE = 7
export const UNO_TARGET = 500
```

Functions:

- `unoCardPoints(card: UnoCard): number` — `kind==='number' ? value! : (kind==='wild'||kind==='wild4') ? 50 : 20`.
- `isUnoPlayable(card: UnoCard, topCard: UnoCard, activeColor: UnoColor): boolean`
  — `card.kind==='wild'||card.kind==='wild4'` → true; else `card.color===activeColor` → true;
  else `card.kind==='number' && topCard.kind==='number' && card.value===topCard.value` → true;
  else `card.kind!=='number' && card.kind===topCard.kind` → true (skip-on-skip,
  reverse-on-reverse, draw2-on-draw2, regardless of color); else false.
- `handHasLegalPlay(hand: Card[] /* UnoCard[] */, topCard, activeColor): boolean`.
- `dealUnoRound(seatOrder: string[], rng): { hands: Record<string, Zone<UnoCard>>; stock: Zone<UnoCard>; discardPile: Zone<UnoCard>; activeColor: UnoColor }`
  — shuffle a fresh 108-card deck; deal `UNO_HAND_SIZE` to each seat in
  `seatOrder`; flip cards off the remaining stock one at a time, RESHUFFLING
  THE WHOLE REMAINING STOCK AND RETRYING whenever the flipped card is not
  `kind==='number'` (deliberately simple: the discard pile always starts on
  a plain number card, avoiding any "what does a starting action card do"
  ambiguity) — that card becomes the sole member of `discardPile`,
  `activeColor` = its color, the rest of the shuffled remainder is `stock`.
- `createUnoGame(seatOrder: string[], seed: number): UnoSession` — round 0,
  `dealUnoRound`, `hasDrawnThisTurn: false`, `pendingWild: null`, `scores`
  all 0, `roundResult: null`, `matchWinnerId: null`, `lastAction: null`,
  `turn: createTurnState(seatOrder, 'play')`, stage `'play'`.

## rules.ts — validator (+ `applyUnoAction`, `runUnoBotTurn`, mirroring rummy/mexican-train's shape)

Reject every action below with a clear reason string if `stage !== 'play'`
(except `START_NEXT_ROUND`, valid only when `stage === 'roundOver'`) or if
`playerId !== currentPlayer(publicState.turn)`.

### PLAY_CARD { cardId }
Reject unless: `pendingWild === null`; the card is in the player's hand.
Reject unless `isUnoPlayable(card, topOf(discardPile), activeColor)`.

Apply: remove the card from hand, push it onto `discardPile`.

**If the hand is now empty → go out immediately** (see Round end below).
Do NOT apply the card's special effect (skip/reverse/draw2/wild4/color
choice) at all — the round is already over. This is a locked decision:
winning with an action or wild card as your last card ends the round with
no further effect, in every case.

Otherwise (hand not empty), branch on `card.kind`:
- `'number'`: `activeColor = card.color`, `hasDrawnThisTurn = false`,
  `advanceTurn`.
- `'skip'`: `activeColor = card.color`, `hasDrawnThisTurn = false`,
  `skipNext(turn, 'play')` (skips exactly the next player, whatever N is).
- `'reverse'`: `activeColor = card.color`, `hasDrawnThisTurn = false`; if
  `seatOrder.length === 2` → `skipNext(turn, 'play')` (acts as skip, per
  the design doc); else → `advanceTurn(reverseDirection(turn), 'play')`.
- `'draw2'`: `activeColor = card.color`; give the player who is about to
  become current (i.e. the one `skipNext` will land past) 2 cards drawn
  from the host-side stock (recycling from discard-minus-top via
  `recyclePile` if stock runs out mid-draw, same as Rummy/Phase10 — see
  Draw-mechanics note below); `hasDrawnThisTurn = false`,
  `skipNext(turn, 'play')`. Record `drewCount: 2` on `lastAction`.
- `'wild'`: `pendingWild = { cardId, isDraw4: false }`. Turn does NOT
  advance yet — the current player must now send `CHOOSE_COLOR`.
- `'wild4'`: `pendingWild = { cardId, isDraw4: true }`. Same — turn stays
  put pending `CHOOSE_COLOR`; the draw-4 + skip happens once the color is
  chosen (see below), not here.

`lastAction = { by: playerId, kind: 'play', card: {color,kind,value}, drewCount }`
(`drewCount` 0 except the draw2 case above; wild4's draw4 is recorded when
`CHOOSE_COLOR` resolves it, not here).

### CHOOSE_COLOR { color }
Reject unless `pendingWild !== null`. Apply: `activeColor = color`. If
`pendingWild.isDraw4`: draw 4 cards (same stock/recycle mechanics as
draw2) into the hand of whoever `skipNext` will land past, `skipNext(turn,'play')`,
`lastAction.drewCount = 4` (update the existing lastAction from the
preceding PLAY_CARD rather than creating a new one — merge, don't push a
second history entry). If NOT `isDraw4` (plain wild): just `advanceTurn`.
Either way: `pendingWild = null`, `hasDrawnThisTurn = false`.

### DRAW_CARD
Reject unless `pendingWild === null`; `!hasDrawnThisTurn`;
`!handHasLegalPlay(hand, topOf(discardPile), activeColor)`.
Apply: draw 1 card from the host-side stock into the player's hand
(recycle-from-discard if stock is empty — see Draw-mechanics note),
`hasDrawnThisTurn = true`, `lastAction = { by: playerId, kind: 'draw', card: null, drewCount: 1 }`.
- If the drawn card is now playable against the current top/activeColor →
  turn STAYS with this player (they may now PLAY_CARD it, or PASS).
- Else → `advanceTurn` immediately (no further action needed from them
  this turn); `hasDrawnThisTurn` still gets reset to `false` as part of
  the normal "turn advanced" bookkeeping every other branch already does —
  do this via the same one-line reset every advance/skip branch performs,
  don't special-case it.

### PASS
Reject unless `pendingWild === null`; `hasDrawnThisTurn`. Apply:
`advanceTurn`, `hasDrawnThisTurn = false`,
`lastAction = { by: playerId, kind: 'pass', card: null, drewCount: 0 }`.

### Draw-mechanics note (applies to DRAW_CARD, draw2, wild4)
Drawing from an empty stock: recycle the discard pile (`recyclePile` from
`card-engine/zones.ts`, `keepTop: 1`, reshuffle via the match's own seeded
rng — identical pattern to Rummy/Phase10's `DRAW_FROM_STOCK` empty-stock
branch, read theirs before writing this). If recycling still can't produce
enough cards (discard has ≤1 card too — vanishingly rare given deck size,
but Phase10's validator has a "round blocked" fallback for this exact
case) mirror Phase10's handling: end the round with `roundResult: null`
(a blocked round, nobody goes out, no score change) rather than crashing.
Update `stockCount` after every draw/recycle.

### Round end (go-out path only — there is no "blocked" path for the base
game the way Phase10/Dominoes/MT have one, except the vanishing-stock
fallback above)
`scores[outPlayerId] += sum of unoCardPoints(c) for every c in every OTHER
player's hand`; every other player's own score is unchanged.
`roundResult = { outPlayerId, pointsAdded }` where `pointsAdded[outPlayerId] = 0`
and `pointsAdded[p] = 0` for every other `p` too (nobody else's score
changes — only the out-player's score moves, by the sum of everyone else's
hands; `pointsAdded` exists so a future UI can show "this round: +N" next
to the winner without recomputing).
If `scores[outPlayerId] >= UNO_TARGET` → `stage = 'over'`, `matchWinnerId = outPlayerId`.
Else → `stage = 'roundOver'`.

### START_NEXT_ROUND
Valid only in stage `'roundOver'`, from any seated player (any client may
call it — the host UI is expected to auto-fire it after a short delay,
mirroring Dominoes/MT; the validator itself doesn't care who triggers it,
same as those). `round += 1`; fresh `dealUnoRound(seatOrder, rng)`
(same match rng, continued, not reseeded); reset `hasDrawnThisTurn`,
`pendingWild`, `roundResult`, `lastAction` to their initial values;
**starter rotates**: build a fresh `createTurnState(seatOrder, 'play')`
then `advanceTurn` it `round % seatOrder.length` times (mirror MT's exact
approach — do not index into seatOrder directly). `stage = 'play'`.

## bot.ts

Mirror the Rummy/MT bot's use of the engine bot plumbing
(`BotStrategy<UnoPublicState, UnoPrivateState, UnoAction>`, `runBotTurn`).
Policy for the current bot:
1. If `pendingWild !== null` (bot itself is the pending player — can only
   happen if the bot just played a wild): `CHOOSE_COLOR` with whichever
   color the bot holds the most of in hand (ties broken by color order
   red/yellow/green/blue); if the bot's hand is empty (it just went out on
   a wild, which per the go-out rule means pendingWild would never
   actually be set — defensive but unreachable, still write it so the
   function is total) pick 'red'.
2. Else collect every legal card in hand (`isUnoPlayable` against the
   current top/activeColor). If any exist: prefer, in order, an action
   card (`skip`/`reverse`/`draw2`/`wild4`) over a plain `number`, and
   among non-wild options prefer non-wild over `wild`/`wild4` when both
   are legal — i.e. rank = number card (also legal) beats a wild only in
   the sense that the bot should NOT reach for a wild it doesn't need;
   concretely: sort candidates by `(isWild ? 0 : isAction ? 2 : 1)`
   descending (action highest, plain number middle, wild lowest,
   preferring to hold wilds in reserve) and `PLAY_CARD` the top pick. If
   the picked card is a wild/wild4, this same action also needs a
   follow-up `CHOOSE_COLOR` — since bot turns run as a sequence of
   `runBotTurn` calls until the turn passes (same convention as every
   other bot here), the color choice happens on the bot's next
   `runUnoBotTurn` invocation while `pendingWild` is still set for it
   (falls into branch 1 above).
3. Else (no legal card) → `DRAW_CARD`.
4. If, after drawing, `hasDrawnThisTurn` is true and the drawn card is now
   playable (bot can tell by re-deriving from its own snapshot's hand vs.
   the public top/activeColor): `PLAY_CARD` it (bots always play a
   playable drawn card — no bluffing/holding logic for bots in this
   spec). Else `PASS`.

## uno.test.ts (vitest, ≥ 45 tests)

Build fixtures the way rummy/mexican-train tests do — construct sessions
with known hands, not random deals. Cover at minimum:

- Deal: N players (test at least N=2, N=3, N=5, N=10) each get exactly 7
  cards; discard pile starts with exactly 1 number card; stock has the
  correct remaining count; starter-flip retries past a non-number card
  (construct an rng/seed or stub that would otherwise flip an action card
  first, and prove it retries — or directly unit-test the retry loop if
  factored as its own function).
- `isUnoPlayable` exhaustively: same color, same number, same action kind
  different color, wild/wild4 always, mismatched color+kind+number all
  rejected.
- PLAY_CARD: rejected out-of-turn, card-not-in-hand, not legal against top;
  a legal number card updates `activeColor` and advances turn.
- Skip skips exactly one player in a 3+ player game (prove seat 2 gets
  skipped when seat 0 plays skip with seat 1 next — turn lands on seat 3,
  not seat 1) — this must NOT degrade to "back to me" the way 2-player
  dominoes-style skip does; test the N=2 case separately to confirm reverse
  (not skip) is what degrades there.
- Reverse: flips direction and advances (does not skip) for N≥3; acts as
  skip for N=2 — both proven with an explicit before/after turn-order
  check, not just "some other seat is now current."
- Draw2: next player's hand count +2, then skipped past (turn lands on
  the player AFTER the one who drew); `lastAction.drewCount === 2`.
- Wild: sets `pendingWild`, turn does NOT advance; `PLAY_CARD`/`DRAW_CARD`/
  `PASS` all rejected while pending; `CHOOSE_COLOR` from a non-current
  player rejected; valid `CHOOSE_COLOR` sets `activeColor`, clears
  `pendingWild`, advances turn normally (no draw).
- Wild4: same pending mechanics, plus `CHOOSE_COLOR` triggers a 4-card draw
  and a skip past the drawer; `lastAction.drewCount === 4` after the color
  choice resolves.
- Going out: playing your last card ends the round immediately in EVERY
  case — explicitly test going out on a plain number, a skip, a reverse, a
  draw2, a wild, and a wild4 — and prove in each action/wild case that NO
  special effect applied (no other hand's count changed, no `pendingWild`
  was set, `stage` went straight to `roundOver` or `over`).
- Scoring: out-player's score increases by the exact sum of every other
  hand's `unoCardPoints`; other players' scores unchanged; match ends
  (`stage: 'over'`, correct `matchWinnerId`) exactly at `>= UNO_TARGET`,
  stays `'roundOver'` just under it.
- START_NEXT_ROUND: rejected outside `roundOver`; starter rotates
  correctly across at least 3 consecutive rounds for N=3 (round 0 starter
  seat 0, round 1 seat 1, round 2 seat 2); fresh deal; all transient state
  reset (`pendingWild`, `hasDrawnThisTurn`, `lastAction`, `roundResult`
  back to initial).
- DRAW_CARD: rejected when a legal play exists; rejected twice in a row
  same turn (`hasDrawnThisTurn` gate); drawing a card that turns out
  unplayable auto-advances the turn with no further action possible;
  drawing a playable card leaves the turn with the player, and PASS then
  ends it; PASS rejected before any draw this turn.
- Stock exhaustion mid-game: force it via a fixture with a near-empty
  stock and prove a recycle-from-discard happens (discard's top card is
  preserved, the rest reshuffles into stock, `stockCount` updates
  correctly) — mirror however Rummy/Phase10's equivalent test constructs
  this scenario.
- Snapshot no-leak test: `deriveSnapshot` for player A contains A's hand
  but not B's (mirror the existing convention in any other card-games test
  file).
- Wire safety: `assertWireSafe` (if that helper exists in this codebase —
  grep for it; if not, a plain `JSON.parse(JSON.stringify(x))` round-trip
  equality check on the full public state after a representative sequence
  of actions) .
- Bot: prefers an action card over an equally-legal plain number; prefers
  a non-wild legal card over reaching for a wild when a non-wild option
  exists; when forced to play a wild, chooses the color it holds most of
  (construct a hand where this is unambiguous); draws when no legal play
  exists; plays a drawn card immediately when it turns out legal.

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` all green. Another agent may be
editing unrelated files concurrently — if so, verify instead with
`npx vitest run src/card-games/uno/` and say exactly that in the report.
Report files, test count, verbatim final outputs; if red or blocked, say
so plainly — do not report success you have not reproduced.
