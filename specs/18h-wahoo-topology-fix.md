# Spec 18h (v2): Wahoo board topology — reference-board-correct

Ground truth from the user's reference board (clockwise travel): each
seat's HOME ENTRANCE sits on its own arm's inbound edge; the COME-OUT
hole is just after it, still on the own arm, just above the seat's
corner; then the corner; then the next arm. A seat comes out, travels
the full circuit, and turns in at the entrance it started just past.
Green based bottom-right: comes out on the right arm's lower edge above
the SE corner, homes up the RIGHT arm's centerline.

Modify ONLY: `src/board-games/wahoo/board.ts`, `board.test.ts`,
`state.ts` (trackIndexFor), `rules.ts` (corner-constant set ONLY),
`bot.ts` is untouched, `wahoo.test.ts`, `src/screens/WahooTable.tsx` +
`WahooTable.css` (SVG shape + reading entries/bases from the board).

## Track: symmetric 5+3+5 quadrants (plain plus, no corner plates)

Quadrant 0 (TOP arm), travel order (clockwise, +y down):
left edge (-1,-2),(-1,-3),(-1,-4),(-1,-5),(-1,-6); tip
(-1,-7),(0,-7),(1,-7); right edge (1,-6),(1,-5),(1,-4),(1,-3),(1,-2).
13 holes, last = (1,-2) = this quadrant's CORNER. Quadrant q = rotate
q×90° CW ((x,y)→(-y,x)). Transition corner→next-first is the √2 step.
Corners: q0 (1,-2) idx 12; q1 (2,1) idx 25; q2 (-1,2) idx 38;
q3 (-2,-1) idx 51.

## Ownership anchors (per arm q, all derived by rotation from q1)

Using the RIGHT arm (q=1) as the worked example (its inbound edge is
y=1, x descending 6→2):
- HOME ENTRANCE (branch) hole: (5,1) — quadrant index 9, abs q*13+9.
- COME-OUT (entry): (4,1) — quadrant index 10, abs `entries[q] = q*13 + 10`.
- Own corner (2,1) two steps ahead of come-out.
- LANE `homes[q]`: (5,0),(4,0),(3,0),(2,0) — relative 52 first (outer,
  adjacent to the entrance hole) to 55 deepest (nearest center).
- BASE `bases[q]`: SE cluster (4,4),(5,4),(4,5),(5,5) — the diagonal
  region the come-out edge faces.
Rotate all four anchors for q0/q2/q3 (q0: entrance (1,-5), come-out
(1,-4), lane (0,-5)..(0,-2), base NE (4,-4),(5,-4),(4,-5),(5,-5); etc.).

`trackIndexFor(arm, distance)` in state.ts → `(arm*13 + 10 + distance) % 52`.

Resulting seat-relative positions (assert in tests): home entrance at
rel 51 (UNCHANGED — lane-entry logic in rules.ts is untouched); corners
at rel {2, 15, 28, 41}.

## rules.ts — corner constants ONLY

The shortcut valid-entry corners change from {12, 25} to **{2, 15}** and
their diagonal exits from {38, 51} to **{28, 41}** (entry rel 2 → exit
rel 28, entry 15 → exit 41). Update the constants and the centerBy
entryCornerRel type/values accordingly. NOTHING else in rules.ts
changes: home branch stays rel 51, lane 52..55, six chains, bumps —
all identical.

## Screen

SVG cross = the two rounded rects only (remove corner plates/chamfers);
all 52 holes sit inside the plus. Corner holes keep the brand-tint
ring; entrance holes: add a subtle ring in the arm color DISTINCT from
the come-out ring (entrance = thin double ring or dashed; come-out =
the existing solid color ring) so both landmarks read; bases/entries
must be read from the board object, not hardcoded.

## Tests

- board.test.ts: new coords/indices (corners 12/25/38/51 abs; entries
  q*13+10; entrance holes q*13+9 adjacent to homes[q][0]; spacing
  48×1 + 4×√2; per-quadrant rotation; bases in the correct diagonal
  regions — assert q1's base is the SE cluster specifically; bounds).
- wahoo.test.ts: update absolute-index literals AND the shortcut corner
  rel values (2/15 entries, 28/41 exits) in the targeted center tests;
  the relative-logic tests (six chain, lane fill, bump, win) must pass
  UNMODIFIED — if one fails, STOP and report.
- oscar.test.ts may need the same rel-constant updates ONLY.

## Verify

npx tsc -b --noEmit; npm test; npm run build.

## Forbidden

bot.ts, engine, App wiring, other games; git.

## Report

(1) commands + tallies; (2) changes per file; (3) deviations or "no
deviations".
