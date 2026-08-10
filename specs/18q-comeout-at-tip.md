# Spec 18q: come-out at the tip corner nearest the base (user's arrows)

The user's annotated screenshot defines the come-out holes precisely:
each seat enters the track at ITS OWN ARM'S TIP CORNER on the side
facing its base — quadrant index 9 (tipR in quadrant 0 travel order:
(2,-8) for the top arm; rotations give (8,2) right arm, (-2,8) bottom,
(-8,-2) left). Travel stays clockwise; the home entrance stays the tip
middle (index 7); the come-out is two holes past it in travel order,
so the circuit runs 0..62 then the lane.

Modify: `board.ts`, `state.ts`, `rules.ts` (constants only),
`board.test.ts`, `wahoo.test.ts`, `oscar.test.ts` (literals only),
nothing else — the screen reads everything from the board object and
the exported constants.

New values (replace the current exported set everywhere):
- `entries[q] = q*16 + 9`; `trackIndexFor(arm, d) = (arm*16 + 9 + d) % 64`
- `entrances[q] = q*16 + 7` (unchanged absolute; now rel 62)
- `OWNER_TRACK_LEN = 63` (owner path rel 0..62), `HOME_ENTRANCE_REL = 62`
- `LANE_START = 63`, `LANE_END = 66`
- `CORNER_RELS = [6, 22, 38, 54]` (own corner rel 6)
- `SHORTCUT_ENTRIES = [6, 22]`, `SHORTCUT_EXITS = { 6: 38, 22: 54 }`
Types like the centerBy literal union follow. Test updates are literal
swaps + recomputed absolute collisions; relative-LOGIC tests must pass
otherwise unmodified — deeper failure → STOP and report verbatim.

Verify: npx tsc -b --noEmit; npm test; npm run build. Report.
