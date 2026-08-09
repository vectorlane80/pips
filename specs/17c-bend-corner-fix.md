# Spec 17c: fix the snake bend corner geometry

Spec 17b's bend rule ("continue from the same cursor point") was wrong —
it forces a 0.5×0.5 overlap between the last straight tile and the first
bent tile at every bend (your report correctly flagged it). Replace it
with the physical-dominoes corner: the bent run sits flush BESIDE the end
of the straight run.

In `src/board-games/dominoes/layout.ts`, when an arm bends from
`oldDir` to `newDir` at cursor point `p`:

```
cursor = p + oldDir · 0.5 − newDir · 0.5
```

then continue placing tiles along `newDir` exactly as before (the new
run's cross-axis is offset half a unit beyond the old run's end; the
first bent tile's near edge starts flush with the old run's far side).
Worked example: right arm along +x with tiles in y ∈ [−0.5, 0.5], last
tile ending at x = c, bending up (newDir (0,−1)): cursor becomes
(c + 0.5, +0.5); the first bent tile spans x ∈ [c, c+1],
y ∈ [0.5 − len, 0.5] — it shares only the edge x = c with the straight
run. Works for all four pinwheel bends by symmetry.

In `src/board-games/dominoes/layout.test.ts`:
- Update the bend-position assertions (tests 5 and 6) to the new
  cursor math.
- Strengthen test 7 to the FULL guarantee the spec originally wanted: no
  two tile rectangles on the busy board intersect in their interiors —
  including across every bend corner. Remove the comment documenting the
  old overlap.
- Bounds: the bent run's cross-axis overhang (+1 beyond the threshold
  along oldDir) is expected; keep/adjust the extent assertion in test 5
  accordingly.

Touch nothing else. Verify: `npx tsc -b --noEmit`; `npm test` fully
green; `npm run build`. Report commands + tallies + deviations.
