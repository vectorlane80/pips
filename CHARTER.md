# Charter: Dominoes (All Fives)

**Mode:** directed
**Started:** 2026-08-09
**Pre-approved:** yes — design handoff `Design Handoff/DOMINOES.md` +
prototype in `Pips.dc.html` (~1959–2150 logic), with the user's kickoff
answers: (1) draw rule = the COMMON rule (draw until playable), captured
in gameplay AND the rules overlay; (2) deal intro must be visually
dominoes (tile-backs, not card backs) and use the new domino sounds;
(3) snake board layout approved, clarity is the bar. Routing: deepseek:flash
implements, sonnet reviews, no Codex. Brand `#5b5bd6`.

## Architecture (locked)
- `src/board-games/dominoes/` on the card-engine stack: tiles
  `{ id: 'a-b', a, b }` through the generic `Zone`/deck helpers, boneyard
  as a host-only zone outside `HostSession` (rummy-stock pattern, count
  public), hands private, board fully public. Engine core for
  rng/turn/sync/bot.
- Module files: `state.ts`, `scoring.ts` (end counting), `rules.ts`
  (validator + wrappers), `bot.ts`, `layout.ts` (pure snake geometry,
  view-only, no React), tests beside each.
- Screens: DominoesRoom/Table(+css)/Results/RulesOverlay; App wiring per
  the rummy/battleship pattern, join prefix `DM-`; round transitions via
  ROUND_PAUSE; DealIntro reused with a domino tile-back renderer.

## Rules (locked)
- Double-six set (28), seven dealt each, remainder = boneyard. All Fives
  to 150. Starter alternates each round; the starter may lead ANY tile;
  an opening DOUBLE becomes a four-way spinner, all four sides open
  immediately (designer's explicit choice, kept).
- Placement: a tile must match the open end it extends. Doubles later in
  the game extend lines normally (drawn perpendicular — view concern).
- **Draw rule (user-ordered common rule):** no legal play → draw one tile
  at a time until the drawn tile is playable or the boneyard is empty;
  a playable drawn tile must be played; pass ONLY when stuck with an
  empty boneyard. Enforced by the validator: PLAY needs legality; DRAW
  needs no-legal-play AND boneyard > 0; PASS needs no-legal-play AND
  boneyard == 0. Two consecutive PASSes block the round. passStreak
  resets on PLAY or DRAW.
- Round end: going out scores opponent's remaining pips rounded DOWN to
  the nearest 5 (handoff); blocked → fewer-pips holder scores both hands'
  pips rounded down, tie scores nobody. Match ends when a round closes
  with a score ≥ 150 (higher total wins; if tied ≥ 150, play on).

## Scoring — standardized end counting (FLAGGED deviation from prototype)
The prototype counts an unplayed spinner arm as the double's single pip
value per arm (a 5-5 lead scores 20) and counts an end double at face
value. Standard All Fives, which every player at a real table expects:
- a 5-5 lead scores 10 (the double counts BOTH halves, once);
- a double at the end of any arm counts both halves (3-3 at an end = 6);
- unstarted side arms of a spinner contribute nothing until a tile is
  played on them; while a main-line side (left/right) is empty, that end
  IS the spinner and counts 2×pip — once if both main ends are empty.
Chosen per the user's "more common rule" instruction pattern; isolated in
`scoring.ts`, trivially revertible if the designer prefers the prototype
math. Score = board total when it is a positive multiple of 5.

## Bot (locked)
Strategy over its snapshot only: if any (tile, arm) is legal → play the
max-immediate-score pair, ties broken doubles-first then higher pip sum
(deterministic, includes drawn tiles); else DRAW if boneyard remains,
else PASS. Lead: highest double, else highest pip sum.

## Snake layout (locked, view-only)
Fixed-height non-scrolling pane; geometry derived per render by
`layout.ts` from the public arm lists — the wire format never knows about
bends. Arms bend 90° at fixed thresholds, pinwheel assignment (right→up,
up→left, left→down, down→right) so each bent tail owns its own corner;
doubles perpendicular to their run; circular dashed drop targets at each
open end from the same layout function. If bounds ever exceed the pane,
scale down (clamped ≥ 0.7) rather than scroll. Clarity bar: tile height
≥ ~36px desktop.

## Sounds
`domino-shuffle` (dominoes-shuffling.mp3) during the intro, `domino-draw`,
`domino-play`, `knock` on a pass. Registered in useSound; files already
in the repo.

## Non-goals
- No Mexican Train / Chickenfoot / specialty anything.
- No >2 players. No difficulty knobs.
- No scrolling board except the ≥0.7-scale escape hatch.

## Milestones
- M1 (spec 17): tiles/state/scoring/rules/bot + tests incl. snapshot
  no-leak (opponent hand + boneyard never serialized) and full
  bot-vs-bot matches.
- M2 (spec 17b): `layout.ts` snake geometry + unit tests (bend points,
  no overlaps, targets, scale clamp).
- M3 (spec 17c): screens + deal intro with tile backs; (spec 17d) App +
  Landing wiring.
- M4: live browser verification (full match vs bot incl. draw-until-
  playable, spinner, scoring moments, round transition, block path if
  reachable), review of the full diff, docs, commit offer.

## Run budget
10 cycles (expect 2–3). Milestone stuck 3 cycles → pivot/pause.
