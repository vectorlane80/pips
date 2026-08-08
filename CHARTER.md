# Charter: Deal-intro animation (Rummy + Phase 10)

**Mode:** directed
**Started:** 2026-08-08
**Pre-approved:** yes — user asked for `/autonomous-dev-loop` with
`/model-routing` explicitly, after jointly deciding (in chat, before this
charter) that the feature belongs in the UI layer, not `card-engine/`.

**Delegation:** per `/model-routing`. Live-probed at charter start —
Codex still reports usage-limit exhaustion (same "try again at 6:51 PM"
quota window as every prior charter today). Per the fallback rule, this
run uses `deepseek-v4-flash` for implementation and `claude --model
sonnet --effort medium` for review, no escalation.

**Worktree:** `.claude/worktrees/phase10-deal-intro`, branch
`worktree-phase10-deal-intro`. No push/merge to `main` without explicit
user confirmation — though this session's established pattern has been to
ship each verified charter promptly, so land and ship once independently
verified, same as every prior charter this session.

## Design source

`Design Handoff/DEAL-INTRO.md` and `Design Handoff/Deal Intro Concepts.dc.html`
(interactive prototype — read in full, including the actual JS timing
constants, before writing any spec). This is described in the handoff as
"a concept exploration, not yet wired into the main prototype."

## The architecture decision (made in chat, restated here for the record)

The animation does **not** belong in `src/card-engine/`. The engine is
deliberately React-free, has no concept of time/animation, and per
`CLAUDE.md` must not import from `screens/`/`components/`. Nothing about
the animation depends on engine internals — the design doc's own open
question #1 confirms this is meant to be "cosmetic-only": the real deal
already completes instantly and host-authoritatively (`dealRound` in each
game's `state.ts`), and the animation is a pure client-side replay driven
entirely by data already delivered to the client (own dealt hand,
`handCounts` for the opponent, seat count). It goes in `src/components/`
as a new shared, reusable component, called from each card game's table
screen.

## Target user
A player starting a new hand of Rummy or Phase 10 (host-vs-human or
host-vs-bot), who currently just sees an already-dealt table appear with
no sense of a hand beginning.

## Core use case
When a fresh hand deals — the very first hand of a match, and every
subsequent round after `START_NEXT_ROUND` — both players see: an empty
table with just the stock, a riffle-shuffle beat (with the existing
`shuffle.mp3`, already wired via `useSound`), then cards flying one at a
time from the stock to each seat alternately, capped at 10 total flights
regardless of real hand size, then a snap to the fully-settled real table.

## Non-goals (explicit scope cuts, matching what the design doc itself
flags as open/deferred, and what the current app actually supports)

- **More than 2 seats.** Both Rummy and Phase 10 are hard-capped to 2
  players by their own charters. The design doc explores 4-seat
  generalization as a concept, but neither actual game needs it — building
  N-seat layout math now would be an abstraction with zero real caller,
  against `CLAUDE.md`'s "no abstractions beyond what the current spec
  needs." The component's internals are written for exactly 2 seats
  (you + opponent); revisit if a >2-player card game is ever built.
- **Reconnect/interrupt handling** (design doc's open question #2). Neither
  game supports resuming an in-progress hand after a disconnect at all
  (an existing, separately-documented limitation from the Rummy and
  Phase 10 charters) — there is no "player rejoins mid-deal" case to
  handle. The only two real cases are: a table mounting for a genuinely
  fresh hand (animate), or reconnecting to a session before ever seeing an
  earlier round (which, since reconnection isn't supported, doesn't
  happen either). Every table mount in this app corresponds to a fresh
  hand.
- **Gating on the real deal.** Per the design doc's own stated assumption,
  this is cosmetic-only — it never blocks or waits on any host-authoritative
  state; if the real deal somehow hadn't finished by the time the animation
  wants to show real counts, the animation would just show what it has
  (never a real scenario in practice, since dealing is synchronous).
- **New sound assets.** `shuffle.mp3` already exists and is already wired
  through `useSound`/`SoundName` (currently used for Rummy's stock-recycle
  sound, being a reasonable enough shared meaning — "cards being
  shuffled"). No new sound file, no new `SoundName` entry needed.
- **Automated DOM/visual tests.** The project has no `jsdom`/testing-library
  installed, and `CLAUDE.md` forbids new runtime dependencies without a
  spec approving them — none does here. The animation's actual rendered
  behavior is verified live in a real browser (this session's established
  practice), not via vitest. The one piece of genuinely pure, non-DOM logic
  (which seat gets which flight, in what order, capped at 10) is extracted
  into a plain function and unit-tested normally.

## Milestones
- M1: `src/components/DealIntro.tsx` — the shared component itself, plus
  a pure `computeDealFlights` helper (unit-tested). Self-contained: renders
  its own simple stock/opponent-pile/your-pile mini-layout (not aligned to
  either game's real, more complex final layout — the design prototype
  itself demos it as a self-contained sequence, not overlaid on the real
  table), runs the shuffle beat, the capped alternating deal, calls
  `onComplete` when done.
- M2: wire into `RummyTable.tsx` — detect a fresh round (a ref tracking the
  last-animated `roundNumber`), render `DealIntro` in place of the normal
  `.rummy-table-card` contents while active, using Rummy's real `CardBack`
  component and colors. Browser-verified.
- M3: wire into `Phase10Table.tsx` — same, using `Phase10CardBack` and
  Phase 10's colors. Browser-verified.

## Definition of done
- A fresh Rummy hand and a fresh Phase 10 hand (host-vs-bot, both playable
  today) both show the full empty → shuffle → deal → settled sequence on
  first mount, and again on every subsequent round after a round ends and
  a new one deals — live-verified in a real browser, not just code-read.
- `npx tsc -b --noEmit`, `npm test`, `npm run build` clean throughout.
- No new runtime dependencies, no new sound assets, no `card-engine/`
  changes.

## Run budget
3 milestones, expect 2-3 cycles.

## Stop criteria
- Stop when all three milestones are live-verified and shipped.
- Any milestone unresolved after 3 cycles forces a pivot/pause decision.

## Ambiguity resolutions

1. **Exact flight distribution when capped at 10** — alternate strictly
   opponent/you/opponent/you… (matching the design doc's stated 2-player
   order) until 10 total flights are used; since both games always deal
   exactly 10 cards to each of 2 seats, this lands as exactly 5 flights per
   seat, using the cap precisely rather than needing to under/over-shoot.
   `computeDealFlights` is written generically (takes each seat's real
   count, alternates, stops at the cap) so it stays correct if a hand size
   ever changes, not hardcoded to "5 and 5."
2. **Where the intro renders relative to the page chrome** — replaces only
   the inner `.rummy-table-card`/`.p10-table-card` contents; the header,
   code chip, and page shell stay visible and stable throughout, so the
   transition into and out of the intro doesn't jolt the whole page.
3. **Skip-ahead / can a player dismiss the intro early** — not built. The
   design doc doesn't ask for it, the sequence is short (well under 2
   seconds total per the spec's own timing numbers), and adding a skip
   control would be scope the design never requested.
