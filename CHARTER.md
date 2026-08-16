# Charter: Uno seat-tile table redesign (2026-08-16)

First of a planned three-game rollout (Uno, then Rummy, then Phase 10) of a
shared visual direction: replace the vertical opponent-rail list with a
wrapping 3-column seat-tile grid, and cap seat count at 6 (down from Uno's
current 10) so the grid is always a clean layout (up to 3×2, never a
ragged partial row) with no scrolling at any seat count. Rummy and Phase 10
are explicitly NOT part of this charter — they wait on this one working out
in the user's own judgment before starting.

Design source: two Claude-Design mockup files the user reviewed and gave
explicit, specific feedback on (both read in full before this charter was
written):
- `~/Downloads/Uno Opponent Layout Options.dc.html` — establishes the
  3-column wrapping seat-tile grid (`1b`/`2b`/`4c` directions) as the
  chosen family over the oval "around the table" ring (`1a` — rejected:
  hardest to build, hardest to degrade on mobile, biggest departure from
  every other Pips game) and the plain chip-strip (`1c`/`2c`/`4a` — rejected:
  reads as a roster/tag list, not "a table full of people," and hardest to
  spot whose turn it is at high seat counts).
- `~/Downloads/Rummy and Phase10 Full Tables.dc.html` — the reference
  implementation of the seat-tile grid at 6 players, used ONLY for the tile
  shape/grid mechanics (3-col grid, per-seat card/border/turn-fill
  treatment) — its specific CONTENT choices for Uno's tile (bare hand-count
  number, no visible card-back fan; call-Uno button hidden entirely except
  on the one vulnerable seat; deck+discard placed upper-right) are
  EXPLICITLY REJECTED per the user's direct feedback below and must not be
  carried over.

## User sign-offs (2026-08-16)

- **Seat cap: 6**, not the mockup's open question. Phase 10 needs a real
  card per player at up to 6 for its own deck-size reasons (out of scope
  this charter, noted for later); Rummy's multi-deck question at 6+ is
  also out of scope. For Uno specifically, 6 is purely a layout/pacing
  choice (108-card deck has no dealing-math constraint at 6) — chosen for
  grid consistency across all three games and because higher player
  counts hurt turn-pacing/engagement independent of whether the table can
  render them.
- **Preserve, do not regress, three things the mockup's Uno tile lost**
  (explicit, direct quotes from the user):
  1. "the uno held cards being a number instead of a fan out of cards" —
     each opponent tile must keep the EXISTING small `UnoCardBack`
     card-back-stack visual (currently `.uno-opp-stack`, `size="small"`),
     not regress to a bare text count like the mockup shows.
  2. "the uno button not being always visible but slightly grayed out" —
     keep the EXISTING `UnoCallButton` behavior exactly: always rendered
     on every tile (yours and every opponent's), grayed out when there's
     nothing to call, a subtle shift to full opacity when active. The
     mockup only renders a button on the one vulnerable seat — do not
     adopt that; the whole point of "always visible but quiet" (locked
     design decision from the original Uno charter, spec 34e) is that the
     eye is not drawn to it activating.
  3. "draw and discard have to be in the center somehow, not in the upper
     right" — the CURRENT shipped table already places the stock+discard
     centre band between the opponent area and the hand (not upper-right
     like the mockup) — preserve that placement, do not move it to match
     the mockup's corner position.
- What DOES change: the opponent rail's layout only — from a vertical list
  of full-width rows to a wrapping grid of compact tiles (3 columns,
  reads as up to 2 rows at 6 opponents), each tile keeping every piece of
  information/interaction the current row has (name, seat-color dot, turn
  highlight via the established full-fill treatment, hidden-hand card-back
  stack, count, the always-visible Uno-call button) just laid out to fit a
  smaller tile instead of a full-width row.
- Seat cap reduction is real, not cosmetic: `UNO_MAX_SEATS` goes from 10 to
  6 in the engine (`src/card-games/uno/state.ts`), not just a UI limit —
  update every place that currently assumes up to 10 (tests, the seat-ink
  palette in `App.tsx`, Landing's "2–10 players" copy, README's "2–10"
  copy).

## Milestone (single slice)

1. `UNO_MAX_SEATS = 6` in `src/card-games/uno/state.ts`; fix every test
   assertion/property-test range that assumed up to 10 seats (`uno.test.ts`
   has the real hits — read it, don't guess which lines).
2. `UnoTable.tsx`/`.css`: replace `.uno-opp-rail` (vertical list of
   `.uno-opp-row`) with a wrapping 3-column grid of seat tiles, preserving
   every piece of content/interaction listed above. Everything else on the
   table (rail with scoreboard/log/status, centre deck+discard+color-picker,
   your hand, deal intro, sounds, bot-hold timing, reveal gate) is
   UNCHANGED — this is an opponent-layout-only redesign.
3. `UnoRoom.tsx`, `App.tsx` (`UNO_SEAT_INKS` — trim to exactly 6 entries),
   `Landing.tsx` ("2–10 players" → "2–6 players"), `README.md` ("Uno seats
   2–10" → "Uno seats 2–6"). `UnoRoom.tsx` needs NO code change (its seat
   slots already derive from `UNO_MAX_SEATS`) — just confirm this by
   reading it, don't blindly edit it.

## Non-goals

Rummy, Phase 10 (explicitly next, not this charter — do not touch their
files). Any other table-layout element (rail, centre band, hand, deal
intro). House rules, call-mechanism, bot-pacing behavior — all unchanged.

## Definition of done

tsc/tests/build green. Oscar-equivalent adversarial review (deepseek may
run the review pass per the user's explicit permission this round, to
conserve the lead's own context for a long unattended session — but the
lead still does a final personal read of the diff before declaring done).
A **mandatory visual check by the lead** in an actual browser — deepseek
has no vision and cannot verify this — at minimum: a 6-seat live match
(host + 5 bots) showing the full 3×2 grid with no scrolling, a close-up
check that the card-back fan, always-visible-but-quiet call button, and
centered deck/discard are all genuinely present and look right, and a
check at a lower seat count (2-3) that the grid doesn't look broken/sparse.
This charter is not done until that visual check happens and looks right
— "tests pass" is necessary but explicitly insufficient per the user's own
words ("this MUST look good").

## Budget / routing

Single-slice charter, expect 1-3 cycles (redesign + fix-ups from review/
visual check). deepseek-shell implements; review may run via deepseek per
user permission, lead does final read + the mandatory visual pass. Session
running unattended overnight — proceed through cycles without stopping to
ask; the user's own instruction pre-authorizes running to completion,
including commit + push once the visual check passes, so the work is
captured and deployed by morning. Only stop early if genuinely blocked
(not just "would like input").
