# Spec 18q2: finish the 18q test migration

The module now uses entries q*16+9 / trackIndexFor +9 / entrance rel 62
/ lanes 63..66 / corners {6,22,38,54} / shortcut {6,22}->{38,54}.
Finish updating ONLY board.test.ts, wahoo.test.ts, oscar.test.ts:
entries [9,25,41,57], entrances [7,23,39,55] (now rel 62), corner
indices unchanged absolute (15/31/47/63) but rel {6,22,38,54};
centerBy literals 1/17 -> 6/22, exits 33/49 -> 38/54; entry-die
arithmetic (own corner rel 6 -> die 7 impossible, so from rel 5 a 2
enters, etc. — recompute each targeted case); lane rels 58..61 ->
63..66; entrance rel 57 -> 62; absolute collisions recomputed with +9.
Import the exported constants where a test reads naturally. Relative-
LOGIC tests pass with literal swaps only; deeper failure -> STOP and
report. Verify: tsc, npm test ALL green, build. Report.
