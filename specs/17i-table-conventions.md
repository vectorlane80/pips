# Spec 17i: dominoes table conventions (user corrections)

Two design corrections to match the established card-table language.
Modify ONLY `src/screens/DominoesTable.tsx` and
`src/screens/DominoesTable.css`.

1. **White tile backs.** `.dm-tile-back` background changes from
   `var(--dm-brand)` to `#fff` (border stays ink). The centred
   `.dm-tile-back__dot` becomes brand `#5b5bd6` so it reads on white.
   Applies everywhere the back renders (deal intro fan/stock + opponent
   hand smalls) — it's one class, keep it that way. Update the
   DominoTileBack comment ("46×88-proportioned rounded-rect back in
   #5b5bd6…") to describe the white back.

2. **Opponent across the table.** Move the opponent row (name +
   "N tiles · hidden" + the row of small tile backs) from below the
   board to the TOP of the play-phase layout, mirroring RummyTable's
   "their side" block (RummyTable.tsx ~565: name in opponentColor, count
   line, fan) — order inside the table card becomes: opponent side →
   status block → board → your hand + boneyard rail. Reuse/rename the
   existing markup (e.g. `.dm-their-side`), style it like
   `.rummy-their-side` (name colored with `opponentColor`, count muted),
   tile backs unchanged in size. Your-hand rail stays at the bottom;
   nothing else moves.

Verify: `npx tsc -b --noEmit`, `npm test` (597), `npm run build`.
Report tallies + deviations.
