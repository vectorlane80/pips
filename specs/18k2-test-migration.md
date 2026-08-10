# Spec 18k2: finish the topology-v3 test migration

Spec 18k's module changes are in; the test files are mid-migration.
Finish updating ONLY `src/board-games/wahoo/board.test.ts`,
`wahoo.test.ts`, `oscar.test.ts` to the v3 constants (import TRACK_LEN /
HOME_ENTRANCE_REL / LANE_START / LANE_END / CORNER_RELS /
SHORTCUT_ENTRIES / SHORTCUT_EXITS and the new trackIndexFor
`(arm*16 + 14 + d) % 64` rather than hardcoding):

- centerBy `entryCornerRel` literals: old 2/15 → 1/17; exits 28/41 →
  33/49; any die-to-enter arithmetic follows (corner rel 1 → die 2 from
  rel 0, etc.).
- Lane rels: 52..55 → 58..61; home entrance 51 → 57; overshoot bounds.
- Hand-built absolute collisions: recompute with the new mapping.
- board.test.ts: corners [15,31,47,63], entries [14,30,46,62],
  entrances [7,23,39,55]; spacing multiset = whatever the coordinates
  actually produce (compute, then assert exactly); 64 unique holes;
  rotation symmetry; bases diagonal; bounds ≤ 8.
Relative-LOGIC tests must pass with literal swaps only — deeper failure
→ STOP and report verbatim. Verify: tsc clean, npm test ALL green,
build. Report tallies + deviations.
