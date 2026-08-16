# Charter: Rummy + Phase 10 N-player expansion (2026-08-16)

Both games go from hardcoded 2-player to real N-player, using the exact
same architectural pattern already proven for Mexican Train, Wahoo, and
Uno (turn-engine/state generalized to `playerIds: string[]` + `Record`
throughout, `HostHandle.sendTo` for private hands, bot-per-empty-seat,
seat-tile opponent grid matching Uno's now-shipped pattern). **User pre-
approved this charter verbatim at invocation** ("go ahead and set the
number of players... just use the same basic patterns... get this going
with /autonomous-dev-loop while I'm gone") — no separate sign-off wait,
per the loop's own pre-approval rule.

## Seat caps — decided from real deck math, not guessed

- **Rummy: 2–4.** `createStandardDeck()` is a single 52-card deck, current
  hand size 10. At 5 players, `5×10+1=51` leaves only 1 card in the stock
  — a degenerate, essentially-unplayable stock. At 6 it doesn't fit at
  all (`6×10+1=61 > 52`). The user's own fallback ("we may want to limit
  Rummy to 4 just for ease") is confirmed correct by this math — 4 leaves
  11 cards in stock, a real playable margin. NOT introducing a second
  deck to reach a higher cap — out of scope, adds real complexity (deck-
  index-aware duplicate-card handling throughout melds/layoffs) the user
  didn't ask for.
- **Phase 10: 2–6.** `createPhase10Deck()` is 108 cards (96 number + 4
  skip + 8 wild — confirmed by reading the file), hand size 10. At 6
  players, `6×10+1=61`, leaving 47 in stock — comfortable. 6 also matches
  real Phase 10's own official player cap (the user's own claim,
  consistent with the deck-size math independently). This is the same
  cap Uno just shipped with, for an unrelated reason (grid/pacing) — a
  coincidence in the number, not a fact this charter should derive from
  Uno.

## Shared pattern (mirrors Uno's original charter + the seat-tile
redesign charter, applied to both games identically)

For EACH game, in this order:

1. **Engine N-player generalization** (`src/card-games/<game>/state.ts`,
   `rules.ts`, `bot.ts`): `playerIds: [string, string]` → `string[]`
   (min 2, max per the cap above) everywhere; every 2-hardcoded field
   (`melds: {[playerIds[0]]:..., [playerIds[1]]:...}`,
   `handCounts`, `scores`, etc.) becomes a loop over `playerIds`,
   `Record<string, T>` throughout — same transformation Wahoo/MT/Uno
   already did from their own 2-player-only starting points (there is
   no 2-player-only precedent left to copy FROM at this layer; copy the
   N-player SHAPE those games ended up with, not a literal diff). Turn
   order, scoring, round-end, deal — all already game-agnostic over
   player count at the `src/engine/turn-engine.ts` layer; this milestone
   is about the game-specific state/rules files only.
2. **Screens**: convert the single hardcoded `opponentId`/`opponentName`/
   `opponentColor`/`opponentHandCount` block into the N-player seat-tile
   grid pattern Uno just shipped (`.uno-opp-tile`-equivalent: wrapping
   flex grid, 3 tiles per row, `--turn` fill treatment, capped tile
   width). Content per tile is NOT the same as Uno's (a hidden count) —
   Rummy/Phase10 opponents lay melds/phases face-up, so each tile shows
   the real thing: every card of every meld/phase group they've actually
   laid, not just a count (per the "Rummy and Phase10 Full Tables.dc.html"
   mockup's own working reference implementation at 6 players — its tile
   approach, where "each panel's height is content-driven (not fixed)...
   nothing is capped, cropped, or hidden behind a tap," is the pattern to
   follow, already validated by the user's own review of that mockup).
   Your own hand/melds/phase section is UNCHANGED — this milestone only
   touches the opponent area, exactly like the Uno seat-tile charter did.
3. **Wiring** (`src/App.tsx`): mirror Uno's `unoBroadcast`/lobby-vs-game
   view/bot-per-seat/`sendTo`-per-guest pattern exactly (Uno's own
   charter, and its wiring spec 34g in particular, is the closest and
   most recent precedent — read it before writing this milestone's spec,
   don't re-derive from Mexican Train/Wahoo's older, slightly different
   shape). Room code prefixes (`RM-`, `P10-`) stay as-is — only the seat
   count and lobby/bot-fill logic change. Landing shelf notes and
   README's player-count sentence get updated to match the new caps.

## Sequencing

Rummy first (smaller cap, simpler deck), then Phase 10 (same pattern,
proven once already). Each game gets its own engine → screens → wiring
milestone sequence, each independently landed/verified/reviewed/
committed before the next starts — same discipline as every prior
charter this project has run, not a big-bang combined change.

## Non-goals

A second deck for Rummy at higher counts. Any change to Uno (already
shipped, out of scope). Any change to melds/phases/scoring RULES
themselves — this is a player-count and layout expansion only, the game
rules are unchanged, just now evaluated over N players instead of 2.
Mobile-specific layout work (same scope boundary the Uno charter used).

## Definition of done (per game)

Engine tests pass at every seat count 2 through the cap (mirror Uno's
own property-test pattern — cycle every seat count across trials, not
just spot-check 2 and the max). Live N-player match (host + enough bots
to hit the cap) through a full round: melds/phases laid by multiple
opponents simultaneously visible correctly in the tile grid, round-end
scoring correct, a full match to the target score. tsc/tests/build
green throughout. Oscar (or deepseek acting as reviewer, per routing
below) review with no unresolved blockers. **Mandatory visual check by
the lead** in an actual browser, same standard as the Uno seat-tile
charter — deepseek/Haiku cannot verify this, and "tests pass" alone is
not sufficient.

## Budget / routing

Large charter, comparable in scope to two fresh game modules — expect
many cycles (directed-mode default: up to 25, renew if genuinely still
in flight and productive). **Implementer: deepseek (deepseek-shell),
falling back to a Haiku-model Agent sub-agent if deepseek becomes
unavailable mid-run** (same spec, same delegation contract, just a
different execution surface — note the fallback explicitly in the
devlog if it's ever used, don't silently swap). **Reviewer: deepseek
running the Oscar persona for lower-risk slices (engine mechanical
generalization, copy-only changes), the lead (this session, Sonnet)
directly for higher-risk slices (wiring, the meld/phase tile-content
design, anything touching scoring correctness)** — same proportional-
depth judgment this project has used throughout, not a fixed rule.
Session running unattended for an extended period (~8 hours) — proceed
through cycles without stopping to ask; commit + push each landed,
verified, reviewed, visually-checked milestone rather than batching,
so the user finds real incremental progress on return, not one giant
unreviewed diff. A scheduled wakeup is armed as a backup safety net
only (per the loop's own template — task-free, just "resume per
ROADMAP.md") in case a usage limit or other interruption kills the
session mid-run; normal operation should not need it to fire.
