# Spec 18: Wahoo board generator (M1 — pure geometry, no React)

Create exactly two files:
- `src/board-games/wahoo/board.ts`
- `src/board-games/wahoo/board.test.ts`

`board.ts` imports nothing (pure math over plain data). Coordinates are
unit-spaced, +x right, +y DOWN (screen convention), origin at board
center. The board is generated from ONE quadrant rotated ×4 — never
hand-type all four arms.

## Quadrant 0 (TOP arm), travel order (clockwise on screen)

Track, 13 holes, exactly these coordinates in this order:

1. Left edge ascending: (-1,-2), (-1,-3), (-1,-4), (-1,-5), (-1,-6)
2. Tip, left to right: (-1,-7), (0,-7), (1,-7)
3. Right edge descending: (1,-6), (1,-5), (1,-4), (1,-3)
4. Corner (the 13th hole): (2,-2)

Home lane (4 holes, innermost first): (0,-2), (0,-3), (0,-4), (0,-5)
Base cluster (2×2): (-4,-4), (-5,-4), (-4,-5), (-5,-5)

## Rotation

Quadrant q (0=top, 1=right, 2=bottom, 3=left) = quadrant 0 rotated by
q × 90° clockwise: `(x, y) → (-y, x)` applied q times, to track, home,
and base coordinates alike. The full track is quadrant 0's 13 holes,
then quadrant 1's, 2's, 3's — 52 holes whose travel order is continuous
(quadrant 0's corner (2,-2) is followed by quadrant 1's first hole
(2,-1), distance 1).

Center hole: (0,0), shared.

## API

```ts
export interface Hole { x: number; y: number }
export interface WahooBoard {
  track: Hole[]                            // 52, travel order
  corners: [number, number, number, number] // absolute track indices of each quadrant's corner (12, 25, 38, 51)
  entries: [number, number, number, number] // each arm's entry hole index (0, 13, 26, 39)
  homes: Hole[][]                          // [arm][0..3], index 0 = the innermost lane hole (distance 52)
  bases: Hole[][]                          // [arm][0..3]
  center: Hole                             // (0,0)
}
export function createBoard(): WahooBoard
// absolute track index for a seat's arm + relative distance 0..51
export function trackIndexFor(arm: number, distance: number): number   // (arm * 13 + distance) % 52
```

`createBoard()` is deterministic and cheap — no caching needed.

## board.test.ts — required assertions

1. 52 track holes, all coordinate-unique; no track hole collides with
   any home, base, or the center; homes/bases unique too.
2. Travel-order spacing: exactly 48 steps of length 1 and 4 steps of
   length √2 around the full 52-cycle (the four corner in-steps are the
   only diagonals); the wrap step (index 51 → 0) has length 1.
3. Four-fold symmetry: rotating every hole of quadrant 0 (track slice
   0..12, homes[0], bases[0]) by 90° clockwise yields exactly quadrant
   1's holes, and so on around — assert per-hole equality, not just
   set equality.
4. Corners sit at (2,-2), (2,2), (-2,2), (-2,-2) with indices 12, 25,
   38, 51; diagonal pairs are 26 apart on the track
   ((corners[q] + 26) % 52 === corners[(q + 2) % 4]).
5. Entries at indices 0, 13, 26, 39; each entry hole is exactly 1 unit
   from the preceding corner in travel order.
6. `trackIndexFor`: arm 0 distance 0 → 0; arm 2 distance 51 → (26 + 51)
   % 52 = 25; spot-check all four arms at distances 0, 12, 25, 51.
7. Seat-relative corner distances: for every arm, the four corners sit
   at relative distances {12, 25, 38, 51} via trackIndexFor inversion.
8. Bounds: every hole within |x| ≤ 7, |y| ≤ 7.

## Verify

```
npx tsc -b --noEmit
npm test        # 597 existing + this file
npm run build
```

## Forbidden

Touching any existing file; React/DOM; randomness; game rules (that is
spec 18b); git.

## Report

(1) commands + tallies; (2) the two files; (3) deviations or "no
deviations".
