# Spec 18o: Wahoo table layout — die rail left, bigger board, no counters

User orders. Modify ONLY `src/screens/WahooTable.tsx` and
`WahooTable.css`.

1. **Remove the home/base counters.** Legend chips lose the
   "N home · M base" text entirely — each chip is just the color dot,
   the name, and the TURN badge on the current player. Delete the
   dead count computations.
2. **Die rail on the LEFT of the board.** The die, its roller caption,
   the Roll button, and the status lines (event + prompt) become a
   vertical rail to the board's left (rail fixed width ~200px: die on
   top, caption, Roll button full-rail-width, then the status text
   stacked beneath, left-aligned, wrapping). On narrow screens
   (< 900px) the rail collapses back above the board (flex-wrap /
   media query).
3. **Bigger board.** With the top strip gone, the board grows: remove
   the 660px cap — the board takes the card width minus the rail
   (max-width ~900px, still square via aspect-ratio; the unit already
   derives from measured pane width so everything scales). Legend row
   stays beneath the board.

Verify: npx tsc -b --noEmit; npm test (674); npm run build.
Forbidden: module changes; git. Report tallies + deviations.
