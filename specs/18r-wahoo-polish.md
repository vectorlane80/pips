# Spec 18r: legend above board, die rail right + top-aligned, 3D marbles

User orders. Modify ONLY WahooTable.tsx + WahooTable.css.

1. **Legend above the board.** The player pills (color dot, name, TURN)
   move from below the board to directly ABOVE it, centered — first
   thing you read at game start. Same pill styling.
2. **Die rail to the RIGHT of the board, top-aligned.** Flip the rail
   to the board's right side and align its content to the TOP
   (align-self stretch stays so the column exists, but
   justify-content: flex-start; die at the top, caption, Roll, status
   beneath). Narrow-screen collapse behavior unchanged (rail above
   board when wrapped).
3. **Spherical marbles — visual only.** Give .wh-marble a 3D marble
   look without changing size, seat colors, border, or shadow
   semantics: inline background becomes a radial gradient built from
   the seat color, e.g.
   `radial-gradient(circle at 32% 30%, color-mix(in srgb, C, white 70%) 0%, color-mix(in srgb, C, white 25%) 22%, C 55%, color-mix(in srgb, C, black 25%) 100%)`
   plus a subtle inset sheen via box-shadow ADDITION (keep the existing
   hard drop shadow, add `inset -2px -3px 6px rgba(23,23,58,0.25),
   inset 2px 3px 4px rgba(255,255,255,0.35)`). Rings/targets/holes
   untouched.

Verify: tsc, npm test (674), build. Report tallies + deviations.
