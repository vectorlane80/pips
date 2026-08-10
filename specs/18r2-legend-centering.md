# Spec 18r2: center the legend on the BOARD, not the card

Oscar flag: the legend pill row centers on the full card width
(board + die rail), landing off-center relative to the board beneath
it. Restructure so the legend belongs to the board's column: wrap
board+legend in a flex column (legend above board, both centered on
the board's width) with the die rail as the right sibling — or any
equivalent that makes the legend's center coincide with the board's.
WahooTable.tsx/css only; keep the narrow-screen collapse sane.
Verify: tsc, npm test (674), build. Report.
