# Spec 18l: give Wahoo the house dice

The die currently sits as a small static square in the corner. The
legacy dice games own a beautiful language: the `Die` component at
`.die` size (clamp 58–94px, hard shadow, rotation jitter) and
`useDiceAnimation` (7-frame random-face flicker on each new roll,
then settle). Wahoo adopts it. Modify ONLY
`src/screens/WahooTable.tsx` and `WahooTable.css`.

- Render the SAME `<Die>` component at full `.die` styling (do not
  duplicate the CSS — the classes are global in components.css).
- Flicker on every roll: `useDiceAnimation` keys on a values-join, so
  equal consecutive rolls wouldn't re-animate — replicate its exact
  flicker locally instead (7 frames × 60ms of random faces, then the
  real value), triggered per NEW roll event (lastEvent identity where
  kind === 'roll', same ref-guard as the sound effect). During the
  flicker the die is live-bright; after settling, muted when it is not
  the local player's move window.
- Give each settle a small random rotation (±5°, the legacy jitter
  feel) via the Die `rotation` prop.
- Layout: the die + Roll button + caption become a centered action
  cluster above the board (die prominent beside the button, roller
  caption beneath the die), not a corner afterthought. Keep the status
  lines where they are.
- The Die is presentational here — no onClick.

Verify: tsc, npm test (674), build. Report tallies + deviations.
