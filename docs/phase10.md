# Phase 10

Real, playable, two-player Phase 10 — host-vs-human over PeerJS or host-vs-
house-bot — built on the same generic card-engine foundation Rummy uses
(`docs/card-engine.md`, `docs/rummy.md`). This document covers what Phase 10
adds on top: the actual game rules, the one card-engine touch it needed, the
bot strategy, the UI, and what's deliberately not built.

Lives under `src/card-games/phase10/` (rules/bot, game-specific — same layer
the card-engine doc calls "not `card-engine/`"), `src/components/Phase10Card.tsx`
(shared visual pieces), `src/screens/Phase10Table.tsx`/`Phase10Room.tsx`/
`Phase10Results.tsx`/`Phase10RulesOverlay.tsx` (the screens), and a Phase-10-
specific branch inside `src/App.tsx` and `src/screens/Landing.tsx`.

## 1. The one card-engine touch: widening `Suit`/`Rank`

Phase 10 uses a dedicated 108-card deck — four colors instead of four suits,
numbers 1-12 instead of A-K, plus Skip and Wild pseudo-cards — none of which
fit `card-engine/cards.ts`'s original closed literal unions (`Suit =
'clubs'|'diamonds'|'hearts'|'spades'|'joker'`, `Rank = 'A'|'2'|...|'K'|'JOKER'`).
Rather than fork the card model or leak Phase-10 vocabulary into the shared
engine, both were widened to plain `string` — a pure type-level change, same
category of move as Rummy's own `peer.ts` generalization: `SUITS`/`RANKS`/
`createStandardDeck` keep producing byte-identical values, every existing
card-engine and Rummy test passed unmodified, and the only observable effect
is that TypeScript no longer exhaustiveness-checks `switch` statements over
the old literal unions (which nothing in this codebase relied on).

Phase 10 cards are told apart by `meta.kind` (`'number'|'skip'|'wild'`), set
once by `deck.ts` and read everywhere else — never by parsing `rank`/`suit`
strings. `suit` on a number card is the color (`'red'|'blue'|'green'|'yellow'`);
Skip and Wild cards use `suit: 'special'`.

## 2. The rules, as implemented

A dedicated 108-card deck (24 each of red/blue/green/yellow numbered 1-12, 4
Skip, 8 Wild), exactly 2 players.

- **Deal**: 10 cards to each player, 1 card flipped face-up to start the
  discard pile, the rest is the stock.
- **A turn**: draw (stock, or the top of the discard pile — **never** a
  Skip, which can never be picked up from discard) → optionally lay your
  entire current phase from hand at once (once per hand) → optionally hit
  cards onto any laid group, yours or the opponent's, once your own phase is
  laid → discard exactly one card to end your turn. Unlike Rummy, there is
  **no reach-in** — only the single top discard card is ever takeable, a
  real rule difference the design handoff calls out explicitly.
- **The 10 phases**, completed strictly in order (`src/card-games/phase10/phases.ts`):

  | # | Requirement |
  |---|---|
  | 1 | 2 sets of 3 |
  | 2 | 1 set of 3 + 1 run of 4 |
  | 3 | 1 set of 4 + 1 run of 4 |
  | 4 | 1 run of 7 |
  | 5 | 1 run of 8 |
  | 6 | 1 run of 9 |
  | 7 | 2 sets of 4 |
  | 8 | 7 cards of one color |
  | 9 | 1 set of 5 + 1 set of 2 |
  | 10 | 1 set of 5 + 1 set of 3 |

  A *set* is 2+ cards sharing the same number (any colors); a *run* is a
  contiguous sequence of numbers 1-12 with **no wraparound** (12 is not
  adjacent to 1); a *color group* (Phase 8 only) is cards all sharing one
  color. Wild cards substitute for any number/color in any group, as long as
  the group has at least one natural card — an all-wild group is never
  valid. `classify.ts`'s `isValidSet`/`isValidRun`/`isValidColorGroup` are
  the source of truth (each explicitly rejects a Skip card slipping into a
  group, a real bug review caught early: Skip cards are neither natural nor
  wild, so without an explicit `naturals.length + wildCount === cards.length`
  check they'd silently pass through as invisible padding). `isValidRun`'s
  span/gap/room arithmetic determines whether a set of naturals-plus-wilds
  can form a contiguous run within `[1,12]` — worked out once as an exact
  algorithm (span of the naturals, gaps wilds must fill, leftover wilds
  extending either end within the 1-12 ceiling) rather than brute-forced.
  `classifyPhaseHand` validates laying a *whole* phase at once — for the
  9 two-part phases it brute-forces every way to split the selected cards
  into the two required group sizes, since a wild can only correctly serve
  one of the two groups and the "obvious" split isn't always the valid one.
- **Laying your phase**: the whole phase comes from hand in a single action
  (`LAY_PHASE`) — no partial lays, no laying one group now and the other
  later. Only one lay per hand. A card that's part of a `LAY_PHASE` selection
  can never be a Skip.
- **Hitting**: once a player has laid their own phase this hand, they may add
  cards from hand onto ANY laid group on the table — their own or the
  opponent's (`HIT`). Validated against the group's *full* current cards
  (original lay plus every prior hit, via `fullGroupCards`) using the
  un-wrapped `isValidSet`/`isValidRun`/`isValidColorGroup` predicates (no
  exact-count constraint — a laid group can grow without bound). Hit cards
  stay attributed to whoever played them (`Phase10Hit`, an append-only
  record mirroring Rummy's `RummyLayoff`) — they render on the hitter's own
  side of the table and are never merged into the target group's zone.
- **Skip cards**: never part of any group, never drawable from the discard
  pile. Discarding one skips the opponent's next turn — implemented via
  `card-engine/turn-engine.ts`'s `skipNext`, whose 2-player behavior (index
  moves by 2, wrapping back to the SAME player) is exactly "skip the sole
  opponent" in this 2-player game, needing no new turn-engine logic. Every
  discarded Skip applies this effect.
  With only one possible opponent, there's no "choose who to skip" UI moment
  to design — the design handoff flagged this as an open question, resolved
  by the game's own 2-player scope making it moot.
- **Going out**: a player's hand reaching zero cards ends the round
  immediately, via `LAY_PHASE`, `HIT`, or `DISCARD_CARD` — whichever action
  happens to empty it. No separate "declare" action.
- **Stock exhaustion**: identical mechanism to Rummy — an empty stock
  recycles the discard pile (keeping its top card in place) via the shared
  `recyclePile`. A real defect found by review and fixed here: if the
  discard pile holds exactly one card and that card is a Skip, the original
  code assumed the player could just draw it instead — but a Skip can never
  be drawn from discard, so that player would have had **no legal move at
  all**, a genuine soft-lock reachable by a real human player, not just a
  bot quirk. Fixed by treating a lone Skip on the discard pile the same as
  a fully empty discard pile: the round blocks (no score or phase changes),
  same as when there's truly nothing left to draw.
- **Scoring**: every round, the player who went out scores 0; every other
  player (just the opponent, in this 2-player game) adds the point value of
  what's left in their hand to their running match score — **lower is
  better**, the opposite convention from Rummy's higher-wins scoring.
  Numbers 1-9 cost 5, 10-12 cost 10, Skip costs 15, Wild costs 25
  (`scoring.ts`'s `cardPenalty`/`handPenalty`). There is no target score to
  cross; scores exist purely to break ties on match completion.
- **Phase advancement**: a player who laid their phase this round advances
  to the next phase index for next round (capped — completing Phase 10
  doesn't advance past it); a player who didn't repeat their current phase.
  This happens once, at round-end (inside the shared `finishRoundByGoingOut`
  helper, called from all three hand-emptying actions) — `START_NEXT_ROUND`
  deliberately never touches `phaseIdx`, since the advancement already
  happened when the round ended.
- **Match end**: the moment a player both lays their phase **and** that
  phase was Phase 10 (checked against their *pre-advancement* `phaseIdx`,
  not the post-advancement value — the two are easy to conflate since a
  player who just finished Phase 9 and a player who just finished Phase 10
  land on the identical post-advancement index, 9), the match is decided. If
  more than one player completes Phase 10 in the same hand (one lays it
  early in the round, the other later in the same round before either
  redeals), the completer with the lowest score wins — matching official
  Phase 10 rules exactly, and deliberately more permissive than only
  considering the player who happened to go out.
- **Between rounds**: `START_NEXT_ROUND` deals a fresh round (10 cards each,
  new starting discard), alternates who goes first, resets all round-scoped
  state (`groups`, `hits`, `hasLaidPhase`), and carries
  `phaseIdx`/`scores` forward untouched. Fires automatically in the live app
  (host-driven, after a short pause), same as Rummy.

### What's explicitly NOT implemented

- More than 2 players — the design handoff's layout shows exactly one
  opponent band, no player-count picker, matching Rummy's own precedent
  (unlike Farkle/Yahtzee's 2-8 scaling).
- Bot difficulty tiers — one strategy, not easy/medium/hard.
- Host migration / resume on disconnect — same documented limitation as
  Rummy: if the host (who holds the only copy of the stock and both
  `privateStates`) drops mid-hand, the hand cannot continue. A disconnected
  guest gets the app's existing generic PeerJS disconnect handling and can
  return to the shelf.

## 3. Architecture: how the pieces fit together

### The trust boundary — `state.ts` + `rules.ts`

```
src/card-games/phase10/
  deck.ts       — createPhase10Deck (108 cards)
  phases.ts     — PHASES (the 10 phase requirements)
  classify.ts   — isValidSet/isValidRun/isValidColorGroup, classifyGroup, classifyPhaseHand
  scoring.ts    — cardPenalty, handPenalty
  state.ts      — Phase10PublicState/PrivateState/Action/Session, createPhase10Game, dealRound
  rules.ts      — the validator: makeValidator + applyPhase10Action/runPhase10BotTurn
  bot.ts        — phase10BotStrategy (card-engine/bot.ts seam)
```

`Phase10PublicState` (visible to both players) carries: `turn` (card-engine's
generic `TurnState`), `discardPile`, `stockCount`, `groups` (per player, the
`Phase10Group[]` they laid this round — each `{type, zone, phaseNumber}`,
where `phaseNumber` is fixed at lay time from the phase requirement being
satisfied, so a group's displayed phase number is never ambiguous even after
`phaseIdx` later advances — a real off-by-one review found and this field
exists specifically to fix, see §5), `hits` (an append-only list of
`Phase10Hit` records, mirroring Rummy's `RummyLayoff`), `hasLaidPhase`
(round-scoped), `phaseIdx` (0-based, PERSISTS across rounds — the whole point
of a multi-round match), `scores` (match-scoped,
lower is better), `roundNumber`/`roundOver`/`roundWinnerId`/`matchWinnerId`,
`handCounts` (same non-leaking opponent-hand-size mechanism as Rummy).

`Phase10PrivateState` is `{ hand: Zone }`, same shape as Rummy's.

**The stock is not part of either** — same "visible to nobody" gap
`docs/card-engine.md` documents, same wrapper pattern Rummy established:
`Phase10Session { session: HostSession<...>, stock: Zone, rng: () => number }`,
with `applyPhase10Action`/`runPhase10BotTurn` committing a candidate stock
mutation only when the outer call's `outcome.ok` is `true`, never inside the
validator itself.

### The bot — `bot.ts`

`phase10BotStrategy` is a single `BotStrategy` function, stateless per call,
called repeatedly by the host across a turn (draw, then optionally lay, then
optionally hit, then discard):

- **Draw**: take the discard pile's top card if it's not a Skip and adding
  it would let the bot complete its current phase (checked via a brute-force
  `canCompletePhase` search); otherwise draw from stock — except when stock
  is empty and the discard top isn't a Skip, in which case it always takes
  the top card regardless (a livelock-prevention fallback: a plain top-card
  take is always legal in that state).
- **Not yet laid this round**: if the hand can complete the current phase
  (`findPhaseSelection`, Skip cards excluded from the search up front), lay
  it.
- **Already laid**: hit the first single hand card (never a Skip) that
  legally extends any group on the table, own or the opponent's — first
  legal match, not an optimizer.
- **Otherwise, discard**: play a Skip first if one's in hand (a free tempo play — costs the opponent a turn for
  nothing); otherwise discard the lowest-"connectivity" number card (fewest
  same-rank/nearby-same-color neighbors in hand), tie-broken by highest
  `cardPenalty` (shed the most expensive isolated card first); an all-wild
  hand (extremely rare) falls back to discarding whatever's first.
- **If the round is already over** when called, returns `START_NEXT_ROUND`
  rather than crashing on a stale hand.

## 4. Transport and session wiring

`src/net/peer.ts`'s `createHost`/`joinHost` needed **no further work** —
Rummy's charter already generalized them to `<TState, TAction>`. Phase 10
calls the exact same functions with its own type arguments:
`createHost<Phase10View, Phase10Action>` / `joinHost<Phase10View,
Phase10Action>`, where `Phase10View = { revision, publicState, privateState,
opponentName }` is the per-recipient snapshot the host derives and
broadcasts.

**Room codes** use a `P10-` prefix (e.g. `P10-MINT-68`), alongside Rummy's
`RM-` and the dice games' bare codes, all disambiguated at the same shared
"Join with a code" field on `Landing.tsx` via a simple prefix check in
`App.tsx`'s `onJoin` handler.

**Session separation**: Phase 10's session is a third fully parallel branch
inside `App.tsx`, alongside the dice-game reducer and Rummy's own branch —
its own `useState`/`useRef` hooks, own host/guest/bot functions, own render
branch, its own `resetToEntry` cleanup. It doesn't touch `src/types.ts`'s
dice-game `Game`/`Action`/`RoomState` union or Rummy's code at all.
`Landing.tsx`'s shelf gained one additional hardcoded tile (not a new entry
in the dice games' shared `Game` type) wired to its own `onPickPhase10`
prop.

Reused Rummy's documented closure-staleness discipline verbatim:
`createHost(...)`'s callback object (`onJoin`/`onAction`/`onLeave`) is
created once and stored in a ref, never recreated on re-render, so anything
it reads that can change over time is read from a ref
(`phase10LocalPlayerIdRef`/`phase10OpponentIdRef`/`phase10OpponentNameRef`)
kept in sync with its state twin, not from React state directly — the exact
bug class that broke Rummy's entire host-vs-human flow in its own charter,
deliberately not reintroduced here.

## 5. The UI

- **`src/components/Phase10Card.tsx`/`.css`** — `Phase10Card` (size variants
  `hand`/`group`/`discard`) and `Phase10CardBack` (size variants
  `fan`/`stock`), matching the design handoff's exact spec: a flat-ink card
  back with a yellow keyline and a centered "10" (an earlier rainbow-striped
  version was explicitly rejected in design as hard to read at fan size —
  implemented flat, not "improved" on); solid-color number tiles (ink text
  on the yellow tile for legibility, white elsewhere); a solid-ink Skip tile;
  a 4-stop diagonal-gradient Wild tile. Hand/fan/stock sizes match the
  handoff's stated measurements exactly; `group`/`discard` sizes are
  documented judgment calls, scaled proportionally from Rummy's own
  precedent for the same kind of unspecified-size gap.
- **`src/screens/Phase10Table.tsx`/`.css`** — the four-band layout from the
  design handoff (their side / phase ladder / centre / your side). The
  ladder is a single 10-chip strip (deliberately not duplicated, per the
  handoff) with hover-to-caption (not a native `title` attribute — the
  handoff notes those don't reliably render in this preview environment)
  and two small progress dots per chip showing both players' current phase
  at a glance. Lay-phase and hit gating call the real `classify.ts`
  predicates directly in the UI (`layPhaseEnabled` → `classifyPhaseHand`,
  `canHitGroup`/`groupHittable` → `isValidSet`/`isValidRun`/
  `isValidColorGroup` against `fullGroupCards`), the same "mirror the
  validator, don't just check counts" discipline `RummyTable.tsx` uses.
  Discard is top-card-only (no reach-in strip, unlike Rummy). All
  selection/hover/local-UI state is local `useState`; everything else
  arrives via props.
- **`src/screens/Phase10Results.tsx`** — the match-end panel. Rows sort
  **ascending** by score (lower is better — the opposite of `RummyResults`'s
  descending sort) and show each player's final phase number instead of a
  target score, since Phase 10 has no target to cross.
- **`src/screens/Phase10Room.tsx`**/**`Phase10RulesOverlay.tsx`** — the
  waiting room and rules modal, structurally identical to Rummy's
  equivalents, with Phase-10-specific copy.
- **`App.tsx`'s Phase 10 branch** owns the host waiting-room screen, the
  host/guest/bot session state and PeerJS wiring described above, a
  host-only bot-turn loop (same `stale(key)`-guarded async pattern as the
  other games' bots), and a host-only round-transition effect that fires
  `START_NEXT_ROUND` automatically after a short pause.

## 6. Verification notes

Every milestone touching game rules or the UI's validation-mirroring logic
went through independent re-verification beyond typecheck/build — an
adversarial review pass, or for the wiring milestone, direct reading of the
actual code plus a real browser session (host-vs-bot, not a mocked prop
harness) confirming a full draw → discard → bot-turn cycle, checked for
console errors, with a live regression check that Farkle and Rummy still
worked unchanged. Four real defects were found and fixed across the run,
documented in full in `docs/DEVLOG.md`'s Phase 10 cycles 1-5:

1. `isValidSet`/`isValidRun`/`isValidColorGroup` didn't verify every card in
   a group was accounted for as natural-or-wild, so a Skip card silently
   passed through as invisible padding inside an otherwise-valid group.
2. A genuine engine soft-lock: stock empty and the discard pile holding
   exactly one Skip card left no legal move for anyone, human or bot — the
   engine didn't recognize this as a blocked round the way a fully empty
   discard pile already was.
3. A UI-side inference of which phase a laid group belonged to
   (`groupPhaseNumber`, since `Phase10Group` didn't originally store its own
   phase number) had a real off-by-one at the Phase 9/Phase 10 boundary —
   fixed at the root by adding a real `phaseNumber` field to `Phase10Group`,
   set once at lay time, rather than patching the inference further.
4. The stock pile was wrongly unclickable whenever `stockCount === 0`, even
   though the engine treats an empty stock as a fully legal draw trigger
   (recycle or block) — the UI gate could leave a player with zero
   clickable actions in a state the engine was specifically built to
   resolve.

## 7. File map

| File | Owns |
|---|---|
| `src/card-games/phase10/deck.ts` | `createPhase10Deck` |
| `src/card-games/phase10/phases.ts` | `PHASES` |
| `src/card-games/phase10/classify.ts` | `isValidSet`, `isValidRun`, `isValidColorGroup`, `classifyGroup`, `classifyPhaseHand` |
| `src/card-games/phase10/scoring.ts` | `cardPenalty`, `handPenalty` |
| `src/card-games/phase10/state.ts` | Types, `createPhase10Game`, `dealRound`, `fullGroupCards` |
| `src/card-games/phase10/rules.ts` | `applyPhase10Action`, `runPhase10BotTurn` |
| `src/card-games/phase10/bot.ts` | `phase10BotStrategy` |
| `src/components/Phase10Card.tsx`/`.css` | `Phase10Card`, `Phase10CardBack`, `PHASE10_COLORS` |
| `src/screens/Phase10Table.tsx`/`.css` | The live table screen |
| `src/screens/Phase10Room.tsx` | Waiting room |
| `src/screens/Phase10Results.tsx` | Match-end panel |
| `src/screens/Phase10RulesOverlay.tsx` | Rules modal |
| `src/card-engine/cards.ts` | `Suit`/`Rank` widened to `string` (shared with Rummy) |
| `src/net/peer.ts` | Generic `<TState,TAction>` transport (shared with Rummy and dice games, unmodified this charter) |
| `src/App.tsx` | Phase 10 session branch (host/guest/bot wiring) |
| `src/screens/Landing.tsx` | Phase 10 shelf tile |
