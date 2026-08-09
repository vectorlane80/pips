# Spec 17b: dominoes snake board layout (pure geometry, no React)

Create exactly two files:
- `src/board-games/dominoes/layout.ts`
- `src/board-games/dominoes/layout.test.ts`

`layout.ts` imports ONLY types from `./state.ts`. No React, no DOM. It is
a pure function from the public board state to unit-space geometry; the
screen (a later spec) multiplies by a pixel scale and centers in the pane.

## Coordinate system

Continuous units: 1 unit = one half-tile square (a tile is 2×1 units).
Origin (0,0) = the center of the opening tile. +x right, +y down.

## Tile footprints

- Opening tile: non-double → horizontal, 2 wide × 1 tall, centered on
  origin. Double (spinner) → CROSSWISE: 1 wide × 2 tall, centered on
  origin.
- Tiles in a run: aligned with the run direction (horizontal run →
  2×1), EXCEPT doubles, which sit crosswise to their run (horizontal
  run → 1 wide × 2 tall) and consume only 1 unit of run length — the
  physical-dominoes convention.

## Arms

Directions: right (+1,0), left (−1,0), up (0,−1), down (0,+1).
Each arm lays its tiles outward from the center tile's edge:

- cursor starts at the center tile's edge on that side (x = ±1 for
  right/left of a non-spinner; x = ±0.5 for right/left of a spinner;
  y = ±1 for up/down of a spinner — up/down arms only exist for
  spinners).
- For each `PlacedTile` in order: `len = isDouble ? 1 : 2` along the
  current direction; tile center = cursor + dir·(len/2); cursor += dir·len.

**Bend rule (the snake):** before placing each tile, if advancing would
push the cursor's distance from origin along the CURRENT direction beyond
the threshold — `H_MAX = 11` units for horizontal travel, `V_MAX = 4` for
vertical — the arm bends 90° and continues from the same cursor point in
the pinwheel direction: right→up, up→left, left→down, down→right. One
bend per arm maximum (beyond that the screen's scale clamp absorbs it —
do not implement a second bend). After the bend, tiles orient to the new
direction (doubles crosswise to it).

## API

```ts
export interface LaidTile {
  x: number; y: number          // center, units
  w: number; h: number          // footprint, units
  horizontal: boolean           // run orientation of THIS tile (doubles: reports the crosswise orientation actually drawn)
  inner: number; outer: number  // pip halves; inner faces back toward the start of the arm
  isDouble: boolean
  // direction the run was travelling when this tile was placed — the screen
  // uses it to decide which half of the tile art shows `inner`
  dir: 'right' | 'left' | 'up' | 'down'
}
export interface EndTarget { arm: DominoArm | 'center'; x: number; y: number; r: number }
export interface BoardLayout {
  tiles: LaidTile[]             // center tile first, then arms in order right,left,up,down
  targets: EndTarget[]          // one per OPEN arm (4 when spinner, 2 otherwise), r = 0.8; when center is null: a single center target at origin
  minX: number; maxX: number; minY: number; maxY: number   // bounds over tile footprints AND targets
}
export function layoutBoard(center: { a: number; b: number } | null, isSpinner: boolean, arms: Record<DominoArm, PlacedTile[]>): BoardLayout
```

- Center tile's LaidTile: inner = a, outer = b, dir 'right' (cosmetic).
- Targets sit 1 unit beyond each arm's final cursor, centered on the
  arm's current axis: target center = cursor + dir·1.
- `scaleToFit(layout, paneW, paneH, unitPx): number` — also export: the
  largest scale ≤ 1 that fits the bounds (padded by 1 unit each side)
  into paneW×paneH at `unitPx` pixels per unit, clamped to ≥ 0.7.

## layout.test.ts — required coverage

1. Non-double lead: center 2×1 at origin; two targets at (±2, 0).
2. Spinner lead (5-5): center 1×2; four targets at (±1.5, 0) and
   (0, ±2).
3. A right arm of three non-doubles: centers at x = 2, 4, 6 (non-spinner
   center), y = 0; cursor/target at (8, 0).
4. Doubles crosswise: right arm [non-double, double, non-double] →
   centers x = 2, 3.5, 5; the double reports 1×2 footprint; total run
   length 5 units; target at (7, 0).
5. Bend: a right arm long enough to cross H_MAX = 11 bends up — tiles
   before the bend advance +x at y = 0, tiles after advance −y at the
   bend x; assert the first bent tile's footprint is vertical and no
   placed tile's x-extent exceeds 11 + 1 (the crosswise overhang).
6. Pinwheel: left arm bends down, up arm bends left, down arm bends
   right (construct each).
7. No overlaps: build a busy board (spinner, all four arms 4–6 tiles
   incl. doubles, at least one bend) and assert no two tile rectangles
   intersect (strict interior intersection; shared edges allowed).
8. Bounds include targets; `scaleToFit` returns 1 for a small board in a
   large pane, < 1 and ≥ 0.7 for a huge board in a small pane.

## Verify

```
npx tsc -b --noEmit
npm test        # 587 existing + this file, all green
npm run build
```

## Forbidden

Touching any existing file; React/DOM imports; randomness; git.

## Report

(1) commands + tallies; (2) the two files + notable geometry decisions;
(3) deviations or "no deviations".
