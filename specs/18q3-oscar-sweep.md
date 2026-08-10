# Spec 18q3: last file — oscar.test.ts to the +9 anchoring

Only oscar.test.ts still fails (6 tests). Recompute its hand-built
positions with trackIndexFor(arm,d)=(arm*16+9+d)%64: the wrap-seam
cases (landing hole abs 14 is now trackIndexFor(0, 5); pick pairs
that coincide absolutely across the 63->0 wrap under the NEW mapping),
centerBy 6/22 with exits 38/54, lanes 63..66, entrance 62. Probe
INTENTS unchanged; numbers only. Deeper failure -> STOP + report.
Verify: tsc, npm test ALL green, build. Report.
