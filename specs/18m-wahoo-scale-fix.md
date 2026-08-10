# Spec 18m: one scale to rule the Wahoo board

Live bug (user screenshot): after topology v3 the holes span ±8 units
but WahooTable still uses unit = paneW/16 and viewBox "-8 -8 16 16",
and the SVG cross bars still have the 3-wide-era proportions
(half-width 1.75). Result: edge columns straddle/exit the cream cross,
horizontal arms' track rows sit on the felt, and the top tip
entrance ring clips the pane edge.

Fix in `src/screens/WahooTable.tsx` (+ `WahooTable.css` if needed),
with ONE source of truth:

```ts
const BOARD_SPAN = 19          // total units across the pane (content ±8 + margin)
const ARM_HALF_WIDTH = 2.75    // bars contain columns at ±2 with margin
const ARM_LENGTH = 8.75        // bars reach past tip rows at ±8
```

- `unit = paneW / BOARD_SPAN`.
- The SVG viewBox is BUILT from the constant:
  `viewBox={`${-BOARD_SPAN/2} ${-BOARD_SPAN/2} ${BOARD_SPAN} ${BOARD_SPAN}`}`.
- Cross = two rounded rects: x/y ∓ARM_HALF_WIDTH .. ±ARM_HALF_WIDTH by
  ∓ARM_LENGTH .. ±ARM_LENGTH (two-pass union-outline as before).
- Every hole/marble/ring position keeps multiplying by `unit` — no
  other changes; delete the stale "-7..7"/"-8..8" comments and note the
  single-constant contract instead.

Sanity you must verify yourself before reporting (add a TEMPORARY
console assertion or just compute): with BOARD_SPAN 19, a tip hole at
y=−8 renders at pane fraction 0.5 − 8/19 ≈ 0.079 — safely inside; a
column hole at x=±2 sits within the bar (2 < 2.75).

Verify: npx tsc -b --noEmit; npm test (674); npm run build.
Forbidden: board.ts/module changes; git. Report tallies + deviations.
