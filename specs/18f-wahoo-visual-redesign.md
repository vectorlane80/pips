# Spec 18f: Wahoo board visual redesign (lead visual review findings)

Fix the board's readability: the track was nearly invisible, the cross
only existed as negative space, corner diamonds floated detached, the
die never showed a value, and unseated arms looked like seated ones.
Modify ONLY `src/screens/WahooTable.tsx` and
`src/screens/WahooTable.css`. Symmetry is sacred; exact geometry is
negotiable per the user.

## 1. Draw the cross as a solid board

Inside `.wh-board` (keep the outer pane as the "felt", background
`#d7d2ea`), add an inline SVG layer UNDER the holes (absolute, full
size, `viewBox` in unit space `-8.5 -8.5 17 17`, pointer-events none)
that draws a solid cream cross with welded corner plates:

- Shapes (unit coords): horizontal bar rect x −7.75..7.75, y −1.75..1.75;
  vertical bar rect x −1.75..1.75, y −7.75..7.75; four squares 1.7×1.7
  centered at (±2, ±2) each rotated 45° about its center (the corner
  plates, containing the corner holes).
- Union-with-single-outline trick: render ALL six shapes twice in one
  SVG — first pass with `fill="#fbfaf6"` and `stroke="#17173a"`
  `stroke-width="0.18"` (unit space), second pass identical but
  fill-only, no stroke. The second pass covers interior strokes, leaving
  one clean outer outline. Slight rounding `rx="0.3"` on the rects and
  plates.
- The center hole, track holes, lanes sit ON the cream cross; bases sit
  on the felt.

## 2. Hole hierarchy (sizes in units; the JSX already positions by unit)

- Track holes: diameter 0.62, fill `#fff`, border 2px
  `rgba(23,23,58,0.3)` — drilled holes on wood, clearly visible.
- Entry holes (each seated arm's track index `entries[arm]`): add a
  2px ring in the arm color (box-shadow ring).
- Corner holes: same as track plus a 2px `#9333ea`-tint ring; DELETE
  the old floating `.wh-corner` diamond divs entirely (the SVG plates
  replace them).
- Home-lane holes: fill the arm color at 45% (solid tint, not pale),
  border in the arm color; unseated/muted arms: grey fill
  `var(--grey-fill)` + grey border, NO color.
- Base holes: on the felt — fill `#fbfaf6`, 3px ring in the arm color;
  unseated arms: grey ring.
- Center: diameter 1.5, as now (brand ring), sits at the cross center.
- Marbles: diameter 0.85 (bigger), keep colors/shadows; targets scale
  with their holes.

## 3. Persistent die

In WahooTable, add `lastRoll` state `{ die: number; by: string } | null`;
in the existing lastEvent effect, when `ev.kind === 'roll'` also
`setLastRoll({ die: ev.die, by: ev.by })`. Render
`<Die value={publicState.die ?? lastRoll?.die ?? 0} muted={publicState.die === null} />`
so the last roll stays visible (muted) between turns, live during the
roller's move window. Under the die, a tiny caption: roller's name
(You/<name>) when lastRoll is set. Blank die only before the first roll
of the game.

## 4. Unseated-arm detection

An arm is unseated when it is not in `Object.values(publicState.seatArms)`
(covers 2P's two empty arms and 3P's mutedArm). Apply the grey styling
of §2 to its lane, base, and entry holes.

## Verify

```
npx tsc -b --noEmit
npm test        # 664 green
npm run build
```

## Forbidden

Any other file; board.ts/geometry/state changes; sound changes; git.

## Report

(1) commands + tallies; (2) what changed; (3) deviations or "no
deviations".
