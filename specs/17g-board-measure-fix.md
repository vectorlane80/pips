# Spec 17g: dominoes board never renders after the deal intro

Bug (live-repro'd): in `src/screens/DominoesTable.tsx`, the pane-measure
effect (the `useEffect` at ~line 235 with `[]` deps that sets `paneSize`
from `boardRef`) runs while the deal intro is still showing — the board
subtree is the `showIntro ? <DealIntro/> : <board>` FALSE branch, so
`boardRef.current` is null, the effect bails, no ResizeObserver is ever
attached, `paneSize` stays 0, `boardReady` stays false, and the board
renders empty forever.

Fix in that file only: change the effect's dependency array from `[]` to
`[showIntro]` so it re-runs when the intro finishes and the board mounts
(the `if (!el) return` guard already handles the intro-showing case, and
the cleanup already disconnects the observer).

Verify: `npx tsc -b --noEmit`, `npm test` (597), `npm run build`.
Report tallies + deviations.
