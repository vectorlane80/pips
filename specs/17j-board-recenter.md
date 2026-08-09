# Spec 17j: center board CONTENT bounds, not the origin (clip fix)

Live bug (user screenshot): DominoesTable renders every tile/target at
`calc(50% + coord*unit)` — the layout origin (opening tile) is pinned to
the pane center. Once an arm bends, content bounds go asymmetric (long
up-arm tail, short down arm), so the far side clips past the pane edge
while empty space pools on the near side. scaleToFit already sizes by
true bounds width/height, which is only correct if the CONTENT MIDPOINT
sits at the pane center.

Fix in `src/screens/DominoesTable.tsx` only:

Compute once per render from the existing layout:
```ts
const cx = (layout.minX + layout.maxX) / 2
const cy = (layout.minY + layout.maxY) / 2
```
and render every board tile AND every target at
`calc(50% + (x - cx) * unit)` / `calc(50% + (y - cy) * unit)` instead of
the raw coords (adjust wherever the calc strings are built — tiles and
targets both). Nothing else changes; the board simply re-centers itself
as it grows, exactly like the prototype's auto-recenter but without
scrolling.

Verify: `npx tsc -b --noEmit`, `npm test` (597), `npm run build`.
Report tallies + deviations.
