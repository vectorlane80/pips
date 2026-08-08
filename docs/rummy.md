# Rummy

Real, playable, two-player Rummy — host-vs-human over PeerJS or host-vs-house-bot
— built on top of the generic card-engine foundation (`docs/card-engine.md`).
This document covers what Rummy adds on top of that foundation: the actual game
rules, the bot strategy, the transport generalization that let Rummy reuse the
existing PeerJS plumbing, the UI, and what's deliberately not built.

Lives under `src/card-games/rummy/` (rules/bot, game-specific — same layer the
card-engine doc calls out as "not `card-engine/`"), `src/components/PlayingCard.tsx`
(shared visual pieces), `src/screens/RummyTable.tsx`/`RummyResults.tsx` (the
screen), and a Rummy-specific branch inside `src/App.tsx` and `src/screens/Landing.tsx`.

## 1. The rules, as implemented

Standard 52-card deck, no jokers, exactly 2 players.

- **Deal**: 10 cards to each player, 1 card flipped face-up to start the discard
  pile, the rest is the stock.
- **A turn**: draw (stock, or reach into the discard pile) → optionally lay down
  any number of valid melds → discard exactly one card. The Discard button stays
  disabled until a draw has happened, so a turn can't be skipped.
- **Melds**: a *set* is 3-4 cards of the same rank, all different suits; a *run*
  is 3+ consecutive same-suit cards. Aces are flexible — a run can use an Ace
  low (`A-2-3`) or high (`Q-K-A`), but never wrap past both ends (`K-A-2` and
  `Q-K-A-2-3` are both invalid). `src/card-games/rummy/melds.ts`'s
  `classifyMeld` is the single source of truth for this (it tries the ace-low
  interpretation first, then ace-high only if that fails and an Ace is
  present), used both by the rules engine (to validate `LAY_DOWN_MELD`) and by
  the screen (to decide whether the "Lay down" button should be enabled).
  `isAceHighRun(cards)` re-derives, from a meld's actual cards, whether an Ace
  within it is being used high — by re-running the same two-pass
  consecutiveness check, not a "contains a King" shortcut (which misvalues the
  one edge case where a run is the full 13-card A-through-K sequence, valid
  entirely under the ace-low interpretation despite containing a King).
- **The discard reach-in** (the signature interaction, per the design handoff):
  a player may reach into the discard pile at any depth, not just take the top
  card. Reaching at index `i` takes `pile[i..top]` — that card and everything
  stacked above it — into the hand. Taking more than the single top card comes
  with an obligation: the reached-for card must be used in a meld laid down
  that same turn, before the player is allowed to discard. This is enforced
  two ways: (1) at draw time, the reach-in is REJECTED outright if no valid
  meld exists in the resulting hand that includes the reached card (`melds.ts`'s
  `hasMeldIncluding`) — this is what prevents a player from ever getting stuck
  with an unusable obligation; (2) once accepted, `RummyPublicState.obligatedCardId`
  tracks the pending obligation, and `DISCARD_CARD` is rejected until a
  `LAY_DOWN_MELD` that turn included that card.
- **Going out**: a player's round ends immediately, as a win, the moment their
  hand reaches zero cards — either by melding their last cards away, or by
  discarding their last card. No separate "declare" action.
- **Stock exhaustion**: if the stock runs out, drawing recycles the discard
  pile (keeps the current top card in place, reshuffles the rest into a fresh
  stock, via the card-engine's existing `recyclePile`). If recycling isn't
  possible either (the discard pile has 0 or 1 cards, so there's nothing to
  reshuffle), the round ends as a block — nobody goes out, no round winner.
- **Scoring**: symmetric, every round a round ends by someone going out — NOT
  a transfer from loser to winner. Each player independently scores the point
  value of what they've melded, minus a deadwood penalty for whatever's left
  in their hand (zero for whoever went out). Face cards and 10s are worth 10,
  other non-Ace cards their own number. Aces are context-dependent: 5 melded
  low (`A-2-3`), 15 melded high (`Q-K-A`) or in a set of aces, and a 15-point
  penalty if left unmelded (previously just 1 — raised specifically because an
  unused Ace is now a much bigger missed opportunity under the flexible-ace
  rule). `meldedCardValue`/`meldValue`/`playerRoundScore` in `scoring.ts`
  implement this; `finishRoundByGoingOut` in `rules.ts` applies both players'
  deltas. Round scores (and running match totals) can legitimately go
  negative — a player who melds nothing and holds a full hand of deadwood
  loses points that round. First to 100 wins the match and the app shows
  `RummyResults`; if both players cross 100 in the same round, the higher
  score wins, and an exact tie goes to whoever went out. A blocked round
  (stock and discard both exhausted) awards no points and simply deals a new
  round — deliberately unchanged by the scoring rewrite. 100 as the target is
  an explicit judgment call from `CHARTER.md`'s ambiguity resolutions — the
  design handoff intentionally left multi-round scoring undesigned; the
  symmetric-scoring model itself (superseding the original transfer-only
  resolution) was a later explicit product decision, not a design-doc gap.
- **Between rounds**: `START_NEXT_ROUND` deals a fresh round (10 cards each,
  new starting discard), alternates who goes first, resets melds/obligation,
  and carries scores forward. In the live app this fires automatically
  (host-driven, after a short pause) rather than needing a button click.

### What's explicitly NOT implemented (see `CHARTER.md` Non-goals)

- **Laying off** onto an existing meld (yours or the opponent's) — a player
  can only lay down brand-new melds from their hand. The design handoff itself
  says this "isn't in the design yet."
- Any Rummy variant beyond the above — no jokers, no wild cards, no Gin-style
  knocking, no Contract Rummy sequencing.
- More than 2 players.
- Bot difficulty tiers — one strategy, not easy/medium/hard.
- Host migration / resume on disconnect — if the host (who holds the only
  copy of the stock and both privateStates) drops mid-hand, the hand cannot
  continue. There's no new logic for this; a disconnected guest gets whatever
  the app's existing generic PeerJS disconnect handling already shows, and can
  return to the shelf and start a fresh room. This matches the design
  handoff's own framing — it explicitly says this "needs a design before
  launch," and Pips isn't aiming at a launch that needs it.

## 2. Architecture: how the pieces fit together

### The trust boundary — `state.ts` + `rules.ts`

```
src/card-games/rummy/
  rank.ts       — rankValue (Ace-low, stable ordering), rankValueAceHigh, deadwoodValue
  melds.ts      — classifyMeld (ace-flexible runs), hasMeldIncluding, isAceHighRun
  scoring.ts    — meldedCardValue, meldValue, deadwood, playerRoundScore
  state.ts      — RummyPublicState/RummyPrivateState/RummyAction/RummySession, createRummyGame, dealRound
  rules.ts      — the validator: makeValidator + applyRummyAction/runRummyBotTurn
  bot.ts        — rummyBotStrategy (card-engine/bot.ts seam)
```

`RummyPublicState` (visible to both players) carries: `turn` (card-engine's
generic `TurnState`), `discardPile`, `stockCount`, `melds` (per player, an
array of laid-down meld `Zone`s), `obligatedCardId`, `handCounts` (per player
card count — lets a client show "N cards · hidden" for the opponent WITHOUT
the opponent's actual hand ever crossing the wire; derived fresh from the
resulting hand at every hand-mutating action rather than manually
incremented/decremented, to avoid drift), `scores`/`target`/`roundNumber`/
`roundOver`/`roundWinnerId`/`matchWinnerId`.

`RummyPrivateState` is just `{ hand: Zone }` — the one thing that's genuinely
different per player and never leaves its owner's device, enforced by
`card-engine/sync.ts`'s existing `deriveSnapshot`.

**The stock is not part of either** — it's the one piece of state visible to
NOBODY, which the generic `HostSession<TPublic,TPrivate>` model has no slot
for (only "visible to all" and "visible to exactly one player"). `RummySession`
wraps it: `{ session: HostSession<...>, stock: Zone, rng: () => number }`.
`applyRummyAction`/`runRummyBotTurn` bridge this back into the generic
`applyAction`/`runBotTurn` pipeline via a validator closure — this is the same
pattern the prior card-engine charter established and documented in
`docs/card-engine.md`, with one hardening it's worth restating here: the
closure's candidate stock is only committed when the OUTER call's
`outcome.ok` is `true`, never inside the validator itself, specifically so a
rejected action can never leak a stock mutation through the closure.

`rng` also lives on `RummySession` (not just used once at deal time) — the
SAME seeded generator drives the initial shuffle, every later stock-recycle
reshuffle, and every subsequent round's redeal, so a whole match is
reproducible from one seed.

### The bot — `bot.ts`

`rummyBotStrategy` is a single `BotStrategy` function (the card-engine seam
from the prior charter) — stateless per call, called repeatedly by the host
across a turn (draw, then zero or more melds, then discard), re-deriving
state each time. One reasonable strategy, not tiered:

- **Draw**: take the discard pile's top card if it's immediately meldable
  with the current hand; otherwise draw from stock — except when stock is
  empty, in which case it always takes the top discard card regardless (a
  single-card take is always legal and never creates an obligation, so this
  never leaves the bot stuck).
- **Discard phase, obligation set**: find and lay down a meld including the
  obligated card (guaranteed to exist, since the rules engine only ever sets
  an obligation when one does).
- **Discard phase, no obligation**: if the hand contains any layable meld(s),
  lay one down — using a small memoized lookahead (`bestFirstMeld`) that picks
  whichever meld choice leads to melding the most TOTAL cards this turn, not
  just the single biggest meld available right now (an earlier greedy-only
  version could strand cards a second meld needed and miss a guaranteed
  round win — see the devlog for the exact repro this fixed).
- **Discard phase, no meld available**: discard the least-connected card
  (fewest same-rank/same-suit-within-2-ranks neighbors in hand), tie-broken
  by highest deadwood value.
- **If the round is already over** when the strategy is called (a defensive
  case a caller shouldn't normally hit, but costs nothing to handle), it
  returns `START_NEXT_ROUND` rather than crashing on an empty hand.

## 3. Transport: reusing PeerJS without duplicating it

`src/net/peer.ts`'s `createHost`/`joinHost` were generalized from hardcoded
dice-game `Action`/`RoomState` types to `<TState, TAction>` type parameters —
a pure type-level change, zero runtime behavior difference for the existing
4 dice games (verified by an unchanged test count and a browser regression
check of Farkle). Rummy calls the exact same functions with its own type
arguments: `createHost<RummyView, RummyAction>` /
`joinHost<RummyView, RummyAction>`, where `RummyView = { publicState,
privateState, opponentName }` is the per-recipient snapshot the host derives
and broadcasts (via `card-engine/sync.ts`'s `deriveSnapshot`) — never the raw
`RummySession`, which would leak both players' hands and the stock.

Because Rummy is capped at exactly 2 players, the host only ever has at most
one guest connection, so a single `broadcast(view)` call correctly reaches
"the one other player" — there's no need for anything beyond what `peer.ts`
already offered before generalization.

**Room codes**: Rummy's host-generated codes get an `RM-` prefix (e.g.
`RM-WAVE-45`) distinguishing them from dice-game codes at the shared
"Join with a code" field on `Landing.tsx` — `App.tsx`'s single `onJoin`
handler checks for the prefix and routes to the Rummy guest flow or the
dice-game guest flow accordingly. This was a genuine architecture gap the
design handoff didn't address (joining was only ever specified symmetrically
within one game family) — resolved here rather than escalated, per the
charter's "make the call and document it" instruction.

**Session separation**: per `CHARTER.md`'s ambiguity resolution #7, Rummy's
session is a fully separate, parallel branch inside `App.tsx` — its own
`useState`/`useRef` hooks, own host/guest/bot functions, own render branch.
It does NOT extend the dice games' `Game`/`Action`/`RoomState` union in
`src/types.ts`, and nothing in `src/state/room.ts` (the dice-game reducer)
changed. `Landing.tsx`'s shelf gained one additional hardcoded tile (not a
5th entry in the shared `Game` type/`GAME_LABEL` etc. records — that would
have rippled into `Room.tsx`/`Results.tsx`/`RulesOverlay.tsx`, none of which
this charter touches) wired to its own `onPickRummy` prop.

A closure-staleness pitfall worth documenting since it cost real debugging
time: `createHost(...)`'s callback object (`onJoin`/`onAction`/`onLeave`) is
created exactly once and stored in a ref — it is NEVER recreated on later
renders. Reading component **state** (e.g. `rummyLocalPlayerId`,
`rummyOpponentId`) directly inside those callbacks captures whatever value
existed at the render when `createHost` was called, permanently — later
`setState` calls do not retroactively update an already-captured closure.
The existing dice-game code already worked around this (via `roomRef`,
mutated imperatively); the Rummy wiring needed the same treatment
(`rummyLocalPlayerIdRef`/`rummyOpponentIdRef`, kept in sync with their
state twins at every `setState` call site) for anything read inside those
specific long-lived callbacks. Anything read inside a plain function
declaration or a `useEffect` body — recreated fresh every render — doesn't
need this and should keep reading state directly, to avoid needless ref
sprawl.

## 4. The UI

- **`src/components/PlayingCard.tsx`/`.css`** — `PlayingCard` (size variants
  `hand`/`meld`/`discard`) and `CardBack` (size variants `fan`/`stock`),
  matching the design handoff's exact measurements, radii, borders, shadows,
  and suit coloring (red for hearts/diamonds, ink for spades/clubs). Pure
  presentational, positioned by whichever parent renders them (fan/strip
  overlap margins are the caller's responsibility, not the card's own).
- **`src/screens/RummyTable.tsx`/`.css`** — the three-band table (their side
  / centre / your side) from the design handoff, including the reach-in
  hover-and-lift interaction (hovering discard card `i` rings and lifts `i`
  and everything above it in yellow, with a three-part colored status line
  reading exactly what a click would take), the hand sort toggle
  (suit/rank, using `rank.ts`'s numeric `rankValue` — never a default
  lexicographic string sort, a footgun this codebase has hit and fixed
  once already in `melds.ts`'s own test suite), and the lay-down/discard
  actions gated on `classifyMeld` validity with hint text explaining why a
  button is disabled. All selection/hover/sort state is local UI state;
  everything else arrives via props.
- **`src/screens/RummyResults.tsx`** — the match-end panel (only rendered
  once `matchWinnerId` is set), matching `Results.tsx`'s existing visual
  language rather than inventing a new one, since the design handoff doesn't
  specify this screen at all.
- **`App.tsx`'s Rummy branch** owns: the host waiting-room screen (room code,
  "Add a house player", "Leave" — RUMMY.md doesn't design this either), the
  host/guest/bot session state and PeerJS wiring described above, a
  host-only bot-turn loop (mirrors the existing dice-game bots' `stale(key)`-
  guarded async loop pattern), and a host-only round-transition effect that
  fires `START_NEXT_ROUND` automatically after a short pause once a round
  ends and the match isn't over.

## 5. Verification notes

Every milestone that touches game rules or the PeerJS trust boundary
(`state.ts`/`rules.ts`, the `handCounts` addition, the `App.tsx` session
wiring) went through independent re-verification beyond typecheck/build —
either an adversarial review pass or, for the final wiring milestone, direct
reading of the actual closures plus a real two-browser-tab PeerJS test (host
in one tab, guest in another, confirming live bidirectional sync, not a
mocked prop harness). Purely visual or mechanical milestones (the `PlayingCard`
components, the `peer.ts` generic-type refactor) were verified by browser
rendering checks and typecheck/build/regression-test alone — see
`docs/DEVLOG.md`'s Rummy cycles 1-7 for the specific defects each pass found
and fixed, several of which (a permanent-deadlock bug, two host-crashing
malformed inputs, a livelock, a stale-closure bug that would have silently
broken the entire host-vs-human flow) were real and would have shipped
invisibly without that discipline.

## 6. File map

| File | Owns |
|---|---|
| `src/card-games/rummy/rank.ts` | `rankValue`, `rankValueAceHigh`, `deadwoodValue` |
| `src/card-games/rummy/melds.ts` | `classifyMeld`, `hasMeldIncluding`, `isAceHighRun` |
| `src/card-games/rummy/scoring.ts` | `meldedCardValue`, `meldValue`, `deadwood`, `playerRoundScore` |
| `src/card-games/rummy/state.ts` | Types, `createRummyGame`, `dealRound` |
| `src/card-games/rummy/rules.ts` | `applyRummyAction`, `runRummyBotTurn` |
| `src/card-games/rummy/bot.ts` | `rummyBotStrategy` |
| `src/components/PlayingCard.tsx`/`.css` | `PlayingCard`, `CardBack` |
| `src/screens/RummyTable.tsx`/`.css` | The live table screen |
| `src/screens/RummyResults.tsx` | Match-end panel |
| `src/net/peer.ts` | Generic `<TState,TAction>` transport (shared with dice games) |
| `src/App.tsx` | Rummy session branch (host/guest/bot wiring) |
| `src/screens/Landing.tsx` | Rummy shelf tile |
