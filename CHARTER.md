# Charter: Solitaire (2026-08-21)

**Mode:** directed — pre-approved at invocation ("consider charter approved …
Don't ask me any questions, just go"). No designer handoff; follow current
codebase conventions.
**Started:** 2026-08-21

## Target user
A Pips player alone at the table who wants a quick, polished single-player
card game that looks and feels like the rest of the shelf (same cards, same
card backs, same lobby → table → rules flow).

## Core use case
Pick "Solitaire" on the shelf, land in a lobby that clearly says it's
1-player, choose a card back and a game mode (Klondike or FreeCell), press
Start, and play a full deal to a win (or give up and redeal) with the
select-then-confirm click interaction Pips card games already use.

## Non-goals
- No multiplayer, no PeerJS session, no house bots (1-player by definition).
- No other variants (Spider, Pyramid, …) — Klondike and FreeCell only.
- No timers, scores, leaderboards, or persistence of a game in progress.
- No drag-and-drop: clicks only, matching the sibling games' interaction model.
- No new runtime dependencies.

## Conventions this charter is bound by (project CLAUDE.md)
Closest siblings by shape: **Rummy** (standard 52-card deck via
`PlayingCard`/`CardBack`, `RummyRoom` lobby with the card-back picker,
`RummyTable` table layout, `RummyRulesOverlay`) and the shared
`TableHeader`/`DealIntro`/sound registry. Every interaction, animation, and
sound those siblings have is the default here unless a stated reason exists.
Stated deviations: no invite code / copy link / seat list in the lobby
(there is nobody to invite — the lobby shows "1 player" instead); the
`DealIntro` runs with `others: []` since there are no opponents.

## Milestones
- M0: pure rules engine for both modes under `src/card-games/solitaire/`
  (deal, move validation, auto-flip, stock/waste recycle, FreeCell supermove
  limit, win detection) + tests. (spec 47)
- M1: screens — `SolitaireRoom` (1-player note, card-back dropdown, mode
  dropdown, Start), `SolitaireTable` (+css, both layouts), rules overlay,
  win banner with "Deal again" / back to shelf. (spec 48)
- M2: App wiring — shelf tile "Solitaire", `/pips/solitaire` route, state
  plumbing, deal intro, sounds, undo. (spec 49)
- M3: polish found by live play / review: auto-move to foundation on
  re-click, legal-target highlighting, stuck-deal hint. (spec 50, if needed)

## Definition of done
Both modes playable end to end from the shelf, pattern-matched to Rummy's
lobby/table/rules conventions with the card back selectable (and remembered
via the existing `pips-card-back` cookie), tests/tsc/build green, an Oscar
review of each code slice with every finding dispositioned, and a live
visual check of both tables.

## Run budget
Directed default: 25 cycles or the milestone list, whichever comes first.

## Stop criteria
- Stop when the definition of done is met.
- Any single roadmap item unresolved after 3 cycles forces a re-scope.

## Ambiguity resolutions
1. **Klondike draw rule** — draw one card at a time, unlimited passes
   through the stock (the friendliest common variant; no draw-3 option).
2. **FreeCell move limit** — the standard supermove cap
   `(empty cells + 1) × 2^(empty columns)`, with an empty destination
   column not counting as an empty column.
3. **Foundations** — fixed suit order (clubs, diamonds, hearts, spades)
   so the layout is stable; cards may be moved back off a foundation.
4. **Undo** — unlimited, UI-level (history of states), since it's free
   and expected in every solitaire app.
5. **Lobby** — mirrors `RummyRoom`'s layout minus code/seats; the
   card-back picker is the same dropdown+preview and reads/writes the same
   cookie so the choice carries between Rummy and Solitaire.
6. **Merge/push** — project CLAUDE.md forbids merging/pushing without the
   word "push"; this run commits on branch `solitaire` and requests the
   push in REQUESTS.md rather than pushing itself.
