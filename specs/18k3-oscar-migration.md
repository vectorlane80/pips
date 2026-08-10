# Spec 18k3: migrate oscar.test.ts to topology v3 (last file)

ONLY `src/board-games/wahoo/oscar.test.ts` remains on old constants
(4 tsc errors at lines ~278/328/348/434 + 8 failing probes). Migrate it
exactly as wahoo.test.ts was: import the v3 constants from the module;
entryCornerRel 2→1 / 15→17, exits →33/49, entry-die arithmetic
(corner rel 1 → die 2 from rel 0), lanes 58..61, entrance 57,
absolute positions recomputed via trackIndexFor (arm*16+14+d)%64.
Probe INTENTS must survive (wrap-seam bump, six-chain leak, lane
privacy, forged moves) — only numbers change. Deeper failure → STOP
and report. Verify: tsc clean, npm test ALL green, build. Report.
