# Spec 18k: Wahoo board topology v3 — faithful to the designer's dot diagram

The reference dot diagram is ground truth. Arms are FIVE holes wide; the
track is 64 holes; adjacent arms SHARE their inner corner hole; the home
entrance is the MIDDLE OF YOUR OWN TIP ROW (you turn inward at the tip
turn, lane hanging toward the center); bases are DIAGONAL lines of 4.

Modify: `src/board-games/wahoo/board.ts`, `board.test.ts`, `state.ts`,
`rules.ts` (constants), `wahoo.test.ts`, `oscar.test.ts` (literals),
`src/screens/WahooTable.tsx` + `.css` (SVG cross proportions + reading
everything from the board object). `bot.ts` untouched. Update the
distance-model comment in state.ts and the constants everywhere via ONE
exported set — put these in state.ts (or board.ts) and import them:

```ts
export const TRACK_LEN = 64
export const OWNER_TRACK_LEN = 58   // owner path: rel 0..57 then lane
export const HOME_ENTRANCE_REL = 57 // = the own-arm tip middle
export const LANE_START = 58        // lane rel 58..61 (deepest 61)
export const LANE_END = 61
export const CORNER_RELS = [1, 17, 33, 49]      // own corner is rel 1
export const SHORTCUT_ENTRIES = [1, 17]          // forward-diagonal corners
export const SHORTCUT_EXITS = { 1: 33, 17: 49 }  // +32 diagonals
```

## Geometry (quadrant 0 = TOP arm; +y down; rotate ×4 as before)

Arm columns at x = ±2, lane at x = 0, arm spans x −2..2 (five wide);
central block x,y ∈ −2..2 with the four SHARED corner holes at
(±2, ±2) being track. Quadrant 0's 16 holes in clockwise travel order,
starting AFTER the NW shared corner:

1–5. left column x=−2, y = −3, −4, −5, −6, −7
6. tip-left corner (−2, −8)
7–9. tip middles (−1, −8), (0, −8), (1, −8)   ← (0,−8) is the HOME ENTRANCE for this arm's owner
10. tip-right corner (2, −8)
11–15. right column x=2, y = −7, −6, −5, −4, −3
16. NE shared corner (2, −2)  ← also quadrant 1's starting corner

Track array = quadrant 0 then 1, 2, 3 (rotations). Corners abs indices
15, 31, 47, 63. `entries[q]` (come-out) = the last right-column hole
before the corner = abs q*16 + 14 (e.g. (2,−3) for the top arm — just
above the seat's own corner, per the photo reference).
`entrances[q]` (home entrance) = abs q*16 + 7 (the tip middle).
`trackIndexFor(arm, d) = (arm*16 + 14 + d) % 64`.
Assert-relative: entrance rel 57; corners rel 1/17/33/49.

- `homes[q]`: lane hangs from the entrance INWARD: top arm (0,−7),
  (0,−6), (0,−5), (0,−4) — LANE_START..LANE_END order (58 = (0,−7)
  adjacent below the entrance, 61 deepest = (0,−4)).
- `bases[q]`: DIAGONAL 4, outward from near the seat's own corner
  region: q0 (NE, matching entries on the NE-facing edge): (4,−4),
  (5,−5), (6,−6), (7,−7). Rotate for the others.
- Center hole stays (0,0) (kept per the user's center-shortcut rules;
  this clip-art just has a logo there).

## rules.ts / state.ts

Replace every hardcoded 52/51/55/12/25/38/41/2/15/28 etc. with the
exported constants; the owner's path is 0..57 then lane 58..61 (a marble
never advances onto its own rel 58..63 track holes — the lane entry
consumes the count exactly as today, just at the new boundary).
Absolute-collision math (via trackIndexFor) is unchanged in form.
Center entry: die === distance-to-corner + 1 for corners rel 1 and 17
(from rel 0, the corner at rel 1 means a 2 enters the center);
exits 33 / 49 on a 1 or 6. Six chains, bumps, bust: untouched.

## Screen

The SVG cross gets the new proportions: bars 5 wide (half-width 2.75),
length to ±8.75, viewBox "-9.5 -9.5 19 19" with the unit divisor
comment updated (paneW/19); remove nothing else. Diagonal bases render
from bases[q] automatically (positions only — no styling change).
Entrance ring stays on entrances[q] (double ring), come-out ring on
entries[q]. All landmark positions MUST come from the board object.

## Tests

board.test.ts rewritten to the new truth: 64 unique holes, spacing
(60×1 + 4×√2 — only the corner→next-first steps are diagonal... CHECK:
corner (2,−2) → next quadrant first hole = rot90 of (−2,−3) = (3,−2):
distance 1! With shared corners the path may have NO diagonal steps —
compute the actual step lengths from the coordinates and assert the
exact multiset the geometry produces (all 1s expected; verify tip-corner
turns too: (−2,−7)→(−2,−8) = 1 ✓, (−2,−8)→(−1,−8) = 1 ✓). Rotational
symmetry per quadrant; corners/entries/entrances indices; entrance
adjacent to homes[q][0]; bases diagonal; trackIndexFor spot checks;
bounds |x|,|y| ≤ 8.
wahoo/oscar tests: update rel/abs literals to the new constants (import
them rather than re-hardcoding where a test reads naturally); the
relative-LOGIC tests (six chain, lane no-pass, bump semantics, win)
must pass with only constant/literal swaps — anything deeper fails →
STOP and report.

## Verify

npx tsc -b --noEmit; npm test; npm run build.

## Forbidden

bot.ts, engine, App wiring, other games; git.

## Report

(1) commands + tallies; (2) per-file changes; (3) deviations or "no
deviations".
