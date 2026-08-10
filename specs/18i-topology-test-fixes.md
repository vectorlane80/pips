# Spec 18i: finish the topology test updates (3 stale spots)

The module is correct; three tests still carry pre-topology literals.
Fix ONLY these, in the named files:

1. `board.test.ts` (~line 93): the come-out is TWO units before the
   corner (a hole sits between them) — the test title already says so.
   Change the second assertion to `sqDist(...) === 4` (squared) or
   distance 2 — match the file's convention.
2. `oscar.test.ts` wrap-boundary collision test: recompute the two
   seats' relative positions with the NEW mapping
   `abs = (arm*13 + 10 + rel) % 52` so their absolute holes coincide at
   the 51→0 wrap exactly as the test intends (attacker lands on the
   victim's hole; victim expected bumped to -1).
3. `wahoo.test.ts` "exit bumps an opponent on the target corner": place
   the victim on the CURRENT exit-corner hole — exits are now rel 28
   (from entry corner rel 2) and rel 41 (from rel 15); convert to the
   victim seat's relative coordinate via the new mapping.

Do not touch board.ts/state.ts/rules.ts/bot.ts. If a fixed test still
fails, STOP and report verbatim. Verify: tsc, npm test all green,
build. Report tallies + deviations.
