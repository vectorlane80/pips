# Spec 40 — Skip-Bo card-engine module

First of 3 specs building Skip-Bo from scratch (read `CHARTER.md`
first, in full — it locks the rules and explicitly rejects parts of
the design handoff you must NOT follow). This spec is engine only: no
React, no screens, no wiring. Read `Design Handoff/SKIPBO.md` for full
rules context, but every ambiguity it left open is resolved below —
follow this spec's decisions where the two differ.

Read `src/card-games/phase10/{deck,state,rules,bot}.ts` and
`src/card-games/rummy/{state,rules,bot}.ts` FIRST, in full, before
writing anything — this spec reuses their exact conventions
(file layout, `Zone`/`Card` primitives from `src/card-engine/`, the
`TurnState`/`advanceTurn`/`currentPlayer` primitives from
`src/engine/turn-engine.ts`, `applyAction`/`ActionOutcome`/
`ActionValidator` from `src/engine/sync.ts`, `runBotTurn`/
`BotStrategy` from `src/engine/bot.ts`) rather than inventing new
shapes. You own creating exactly these new files — do not touch any
existing file:

- `src/card-games/skipbo/deck.ts` (+ `deck.test.ts`)
- `src/card-games/skipbo/state.ts`
- `src/card-games/skipbo/rules.ts`
- `src/card-games/skipbo/bot.ts`
- `src/card-games/skipbo/skipbo.test.ts` (or split into multiple
  `*.test.ts` files if that reads better — your call, just make sure
  every file you create ends in `.test.ts` so `npm test` picks it up)

## Deck (`deck.ts`)

`createSkipBoDeck(): Card[]` — 162 cards total, reusing the generic
`Card` type from `../../card-engine/cards.ts` exactly like
`phase10/deck.ts` does:

- 144 numbered cards: ranks 1–12, 12 copies of each. `suit: 'number'`,
  `rank: String(n)`, `meta: { kind: 'number' }`.
- 18 Skip-Bo wild cards. `suit: 'special'`, `rank: 'WILD'`,
  `meta: { kind: 'wild' }`.
- `id` sequential like Phase 10's `p10-${id++}` — use `sb-${id++}`.
- `deckIndex: 0` for every card (matches every sibling's single-deck
  convention).

## State (`state.ts`)

```ts
export const SKIPBO_MIN_SEATS = 2
export const SKIPBO_MAX_SEATS = 4

export type SkipBoTurnPhase = 'play' // single-phase turn — see rules.ts below for why

export interface SkipBoBuildPile {
  cards: Card[]       // the actual stacked cards, top of array = top of pile (visually, its face)
  nextNeeded: number  // 1-12, the rank this pile currently needs (wild always satisfies it)
}

export interface SkipBoPublicState {
  turn: TurnState<SkipBoTurnPhase>
  seatOrder: string[]                      // fixed for the whole game, never reordered
  stockCounts: Record<string, number>      // public — every seat's remaining stockpile size
  handCounts: Record<string, number>       // public — every seat's current hand size (starts 5)
  discardTops: Record<string, (Card | null)[]>  // public — top card of each of a seat's 4 discard piles (null if empty), length always 4
  buildPiles: SkipBoBuildPile[]            // length 4, shared
  drawCount: number                        // public — size of the shared draw pile
  usedCount: number                        // public — size of the reshuffle pool
  roundOver: boolean
  winnerId: string | null                  // set the instant a stockpile hits 0, possibly mid-turn
}

export interface SkipBoPrivateState {
  stock: Zone   // this seat's own stockpile — only its OWN top card identity matters to the owner;
                // send the full zone privately same as Rummy's hand, since a player can see their
                // own stock's top card (drawn only when played) — simplest to just give them the
                // whole zone privately like a hand, they only ever act on cards.length-1 anyway.
  hand: Zone
  discards: Zone[]  // length 4, each a private-owned-but-effectively-public-per-top zone —
                     // simplest to keep these in PRIVATE state too (mirrors stock) and let
                     // PublicState.discardTops carry only what other seats are allowed to see
}

export type SkipBoAction =
  | { type: 'PLAY_STOCK' }
  | { type: 'PLAY_HAND'; cardId: string }
  | { type: 'PLAY_DISCARD'; pileIndex: number }   // 0-3, one of the acting player's OWN 4 discard piles
  | { type: 'DISCARD'; cardId: string }           // ends the turn; engine auto-picks the emptiest of the player's 4 discard piles (ties -> lowest index)
  | { type: 'PASS' }                              // only legal when hand.cards.length === 0
```

`createSkipBoGame(playerIds: string[], seed: number): SkipBoSession`
(mirror `createRummyGame`'s/`createPhase10Game`'s exact return shape —
check `HostSession` in `sync.ts`, use `createHostSession`):

- Shuffle the 162-card deck with the seeded RNG (`createRng(seed)`,
  `shuffleDeck`).
- Stockpile size: 30 if `playerIds.length === 2`, else 20 (3 or 4
  players) — deal that many cards face-down to each seat's `stock`
  zone, in `seatOrder` order.
- Deal 5 cards to each seat's `hand`, in `seatOrder` order (round-robin
  1 at a time, matching how `dealRound` deals elsewhere — doesn't
  matter for correctness since it's shuffled, but keep the loop shape
  consistent with siblings for readability).
- Remaining cards become the shared draw pile (a plain `Zone`, not part
  of per-seat state — store its full card identity in a place your
  `SkipBoSession`/private-state design can reach; it's never revealed
  to any single seat privately, so it can live in a HOST-only internal
  field the way Rummy's `stock` full zone does — check how Rummy's
  `RummySession` stores its stock, mirror that exactly).
- Each seat's 4 discard piles start empty.
- `buildPiles`: 4 entries, each `{ cards: [], nextNeeded: 1 }`.
- `usedCount`/used-pool: starts empty.
- `turn = createTurnState(seatOrder, 'play')` — `seatOrder[0]` (the
  host) always goes first; there is only one round ever, so no
  round-to-round rotation logic is needed (unlike Rummy/Phase10's
  `START_NEXT_ROUND` handler — Skip-Bo has no such action at all).
- `roundOver: false`, `winnerId: null`.

## Rules (`rules.ts`)

**Building-pile legality**: a card (numbered or wild) is legal on pile
`i` iff `card.meta.kind === 'wild'` OR `Number(card.rank) ===
buildPiles[i].nextNeeded`. A wild is legal on every pile, always.

**Auto-targeting** (used by `PLAY_STOCK`, `PLAY_HAND`, and
`PLAY_DISCARD` — all three share this exact targeting logic, factor it
into one helper): among all piles where the card is legal, pick the
one with the highest `buildPiles[i].cards.length` (furthest along);
tie-break by lowest index. If the card is legal on NO pile, the action
is rejected (`ok: false`, reason e.g. `'not a legal play right now'`).

**Playing a card onto a pile** (the shared effect of a legal play,
after the target pile is chosen): remove the card from its source zone
(stock top / the named hand card / the named discard pile's top —
reject with a clear reason if `PLAY_DISCARD`'s `pileIndex` is out of
range 0-3 or that pile is empty), push it onto the target pile's
`cards`, and:
- if `nextNeeded === 12` (the card just played completed the pile):
  move all of `buildPiles[i].cards` (now including the just-played
  card) into the used/reshuffle pool, reset `buildPiles[i]` to
  `{ cards: [], nextNeeded: 1 }`.
- else: `buildPiles[i].nextNeeded += 1`.

**Win check — after EVERY successful `PLAY_STOCK`** (the only source
that can empty a stockpile): if the acting player's `stock.cards.length
=== 0` post-play, set `roundOver: true`, `winnerId: <acting player>`
and return immediately — do not advance the turn, do not run the
discard step, the game is over the instant this happens even mid-turn,
per the real rules. `PLAY_HAND` and `PLAY_DISCARD` never trigger this
check (they can't empty a stockpile).

**`PLAY_STOCK`**: legal only if `stock.cards.length > 0` and it's the
acting player's turn and the round isn't over. Auto-targets per above.
On success: apply the win check.

**`PLAY_HAND`**: legal only if the named card is actually in the
acting player's hand. Auto-targets per above.

**`PLAY_DISCARD`**: legal only if `discards[pileIndex]` is non-empty.
Auto-targets per above (using that pile's TOP card, i.e.
`topCard(discards[pileIndex])`).

**`DISCARD`**: legal only if the named card is in the acting player's
hand. Effect: remove it from hand, add it to the emptiest of the
player's 4 discard piles (`Math.min` by `cards.length`, tie-break
lowest index), THEN end the turn — advance to the next seat
(`advanceTurn(turn, 'play')`) and auto-draw the new current player's
hand up to 5 cards from the shared draw pile (see "Draw" below), all
in the same state transition. No separate draw action exists.

**`PASS`**: legal only if `hand.cards.length === 0`. Effect: same
turn-ending sequence as `DISCARD` (advance turn, auto-draw next
player), just without removing/placing any card.

**Draw** (the auto-draw-to-5 folded into `DISCARD`/`PASS`'s turn
advance, not its own action): draw from the shared draw pile until the
new current player's hand has 5 cards OR the draw pile is empty,
whichever first. If the draw pile empties before reaching 5, recycle
the used/reshuffle pool into it (`recyclePile` with a `shuffle` using
the session's RNG, no `keepTop` — the whole used pool moves, there's
no "must stay visible" top card here unlike Rummy's discard) and keep
drawing. If BOTH the draw pile and used pool are empty (extreme edge
case — every other card is already in stockpiles/hands/discards/build
piles), stop and leave the hand short of 5; this must never throw or
block the game, it should simply give the player whatever's available
(possibly 0 extra cards).

**Hand sort** (a UI concern, but the ENGINE must return hands in a
stable, documented order so the screens spec can rely on it rather
than re-deriving a sort — same convention Rummy uses of keeping
`hand.cards` in a canonical order the UI sorts for display; check
whether Rummy sorts at the engine layer or leaves raw order + a UI
`sortHand` helper, and mirror whichever it actually does). If you add
cards via `addCards` they'll append in draw order — that's fine, no
engine-level resort is required if Rummy doesn't do one either; just
confirm and match Rummy's actual precedent instead of guessing.

**No engine-level auto-play**: exhausting all legal plays before
discarding is a *choice* the player (or bot) makes each turn, not
something the engine forces — a human can always choose to discard
immediately even mid-turn with legal plays still available. The engine
only rejects genuinely illegal actions (no legal pile match, wrong
turn, wrong phase, empty source).

## Bot (`bot.ts`)

`skipBoBotStrategy: BotStrategy<SkipBoPublicState, SkipBoPrivateState,
SkipBoAction>` — mirrors `rummyBotStrategy`'s shape (a pure function
returning ONE action per call; the host's bot-turn loop calls it
repeatedly, same as every sibling). Priority order, checked fresh
every call (state changes between calls as the loop re-invokes you
after each successful action):

1. If `stock.cards.length > 0` and the stock's top card
   (`topCard(stock)`) is legal on any build pile: `PLAY_STOCK`.
2. Else, if any of the bot's own 4 discard piles has a non-empty top
   card legal on any build pile: `PLAY_DISCARD` with that pile's
   index (if multiple qualify, pick the lowest index — deterministic).
3. Else, if any NUMBERED hand card is legal on any build pile:
   `PLAY_HAND` with that card's id (lowest card id / first match if
   multiple — deterministic, don't overthink the choice among equally
   legal numbered cards).
4. Else, if any WILD hand card is legal (always true if the bot has
   one, since wilds are universally legal): `PLAY_HAND` with that
   wild's id. Wilds are checked LAST among hand cards specifically so
   the bot hoards them until genuinely stuck (matches the real rules
   doc's stated bot behavior).
5. Else (no plays possible anywhere): if `hand.cards.length === 0`,
   `PASS`. Otherwise `DISCARD` with the highest deadwood-value hand
   card, preferring a non-wild over a wild if both are otherwise tied
   for "highest value" (i.e. never discard a wild while a numbered
   card of equal-or-lower priority is available — wilds are precious,
   discard them only if the entire hand is wilds).

## Verify before reporting

Write tests covering: deck composition (162 cards, 144 numbered/18
wild, correct rank distribution), deal correctness at 2, 3, and 4
seats (stockpile sizes 30/20/20, 5-card hands, remainder in the shared
draw pile, `totalCards` conservation — sum of every zone + build piles
+ draw + used always equals 162), building-pile legality and the
12→clear→1 wraparound (including a wild completing a pile), auto-
targeting's furthest-along tie-break, the mid-turn win check firing
the instant a `PLAY_STOCK` empties a stockpile (including the "does
NOT advance turn or run discard" part), `DISCARD` auto-picking the
truly emptiest pile, the draw-pile-empty-triggers-reshuffle path, the
both-draw-and-used-empty edge case not throwing, and the bot priority
loop at every rung (a case where each of the 5 rungs is the one that
fires). Run `npx tsc -b --noEmit`, `npm test -- --run`, `npm run build`
yourself, paste the actual output (expect the existing 963 tests to
stay green plus your new ones — do not touch any existing test file),
then report a summary, every judgment call you made beyond what this
spec locked down, and confirmation of all three commands passing.
