# Spec 34i — Uno seat cap 6 + seat-tile opponent grid

Redesigns Uno's opponent area from a vertical list of full-width rows into
a wrapping 3-column grid of compact tiles, and reduces the seat cap from
10 to 6. This is an OPPONENT-LAYOUT-ONLY change — the rail (scoreboard/
turn-log/status), centre band (deck/discard/color-picker), your-hand
section, deal intro, sound logic, and bot-hold timing are all UNCHANGED.

You own edits to EXACTLY these files:

- `src/card-games/uno/state.ts` (one constant)
- `src/card-games/uno/uno.test.ts` (fix assertions broken by the constant
  change — read the file, do not guess which lines)
- `src/screens/UnoTable.tsx`
- `src/screens/UnoTable.css`
- `src/App.tsx` (ONE array, `UNO_SEAT_INKS` — trim to 6 entries, nothing
  else in this file changes)
- `src/screens/Landing.tsx` (one string, the Uno shelf tile's `note`)
- `README.md` (one phrase, the Uno seat-range mention)

Do NOT touch `src/screens/UnoRoom.tsx` — its seat-slot rendering already
derives from `UNO_MAX_SEATS` (`Array.from({ length: UNO_MAX_SEATS }, ...)`),
so reducing the constant automatically shrinks its lobby grid to 6 slots
with zero code change there. Read it to CONFIRM this before you start, but
do not edit it unless your read finds it's actually broken (it shouldn't
be — if you think it needs a change, STOP and explain why in your report
instead of editing it).

Do NOT touch Rummy, Phase 10, or any other game's files — this redesign is
Uno-only; Rummy and Phase 10 are a future, separate charter.

## 1. Seat cap: 10 → 6

In `src/card-games/uno/state.ts`: change `export const UNO_MAX_SEATS = 10`
to `= 6`. `UNO_MIN_SEATS` stays at 2, unchanged.

In `src/card-games/uno/uno.test.ts`, read the whole file and fix every
place that assumed up to 10 seats — there are three real hits, do not
pattern-match blindly on the digit "10" (many `uno-10` occurrences are
unrelated card IDs from the deck, leave those alone):
- A test asserting `UNO_MAX_SEATS` equals a literal 10 — update to 6.
- A test titled around dealing to "3, 5 and 10 players" — change the
  10-player case to a valid ≤6 case (e.g. 6 players), update the test
  title to match, and confirm the stock-remainder math in the assertion
  is still correct for whatever player count you land on (108 minus
  `players × UNO_HAND_SIZE` minus 1 starter card — recompute by hand, do
  not assume the existing asserted number still applies to a different
  player count).
- A property-based test cycling a trial index across `2 + (trial % 9)` to
  cover seat counts 2 through 10 — change the modulus so it cycles 2
  through 6 instead (i.e. `2 + (trial % 5)`), preserving whatever the
  surrounding test's actual intent is (every seat count gets covered
  across the trial loop).

## 2. `App.tsx`: `UNO_SEAT_INKS`

Find the `UNO_SEAT_INKS` array (a fixed hex-color palette, currently 10
entries, extending Mexican Train's 8-color palette with 2 more for Uno's
former 10-seat cap). Trim it to exactly the first 6 entries — do not
invent new colors, do not reorder, just drop the last 4. Nothing else in
`App.tsx` changes; if you find another Uno-related "10" reference while
you're in this file (e.g. a comment), you may correct it for accuracy
only if it's a comment/copy fix, not if it implies any other code change
— report anything else you notice but do not fix it under this spec.

## 3. `Landing.tsx` and `README.md`: copy only

`Landing.tsx`'s `SHELF` array has a Uno entry with `note: '2–10 players'`
— change to `'2–6 players'`. `README.md` has a phrase "Uno seats 2–10" (in
the sentence listing every multi-seat game's range) — change to "Uno seats
2–6". No other text in either file changes.

## 4. The opponent tile grid (`UnoTable.tsx` / `UnoTable.css`)

Read the CURRENT `.uno-opp-rail` / `.uno-opp-row` block in both files in
full before writing anything — you are converting this existing vertical-
list markup into a grid, not building opponent rendering from scratch.
Every piece of content and every interaction currently in `.uno-opp-row`
must survive into the new tile, unchanged in behavior:

- Seat-color dot (`.uno-seat-dot`)
- Name (`.uno-opp-name`)
- **Hidden-hand indicator**: currently a small stack of `UnoCardBack`
  elements (`size="small"`, capped visually at 14, per `.uno-opp-stack`)
  PLUS a `{count} cards` text label. Keep BOTH — this is a locked
  requirement (the user explicitly rejected a mockup that reduced this to
  a bare number with no card-back visual: "the uno held cards being a
  number instead of a fan out of cards"). The stack may need to shrink
  (fewer/smaller backs, or a tighter overlap) to fit a narrower tile —
  that's fine and expected — but it must still visually read as a small
  fanned/stacked pile of face-down cards, not disappear.
- Turn highlight: currently a full seat-color background fill + white
  text/dot-border treatment (`.uno-opp-row--turn`, matching the
  scoreboard's `.uno-score-row--turn` treatment per an earlier fix in this
  same charter's history — read both classes, they should already match
  each other). Keep this exact fill treatment on the tile, just applied to
  a smaller tile instead of a full-width row. Keep the "turn" tag badge
  too if it still fits/reads well on the smaller tile (it should — it's
  small already).
- **The Uno-call button**: currently `<UnoCallButton disabled={...}
  onClick={...} ariaLabel={...} />`, rendered on EVERY opponent tile
  unconditionally (grayed out via the `disabled` prop when there's nothing
  to call, subtly shifts to a lighter/active look when enabled — see
  `.uno-call-btn` in the CSS). This is a locked requirement (the user
  explicitly rejected a mockup that only rendered the button on the one
  currently-vulnerable seat: "the uno button not being always visible but
  slightly grayed out"). Keep it always-rendered on every tile exactly as
  today, just fit into the tile's smaller footprint — a corner of the tile
  is a reasonable place for it, use your judgment on exact placement as
  long as it stays always-visible and keeps its quiet grayed-out/active
  distinction (do NOT make it louder or more attention-grabbing than
  today — that was an explicit design decision earlier in this project,
  not an oversight to "fix").

Layout: replace the current `flex-direction: column` list container
(`.uno-opp-rail`) with a `display: flex; flex-wrap: wrap` (or CSS grid,
your choice — flex-wrap is simpler and this codebase already leans on it
elsewhere, but grid is fine if you prefer explicit 3-column control) row
container so opponent tiles wrap into rows of 3, reading as a clean 1-2
row grid at up to 6 opponents (a 5-player game has 4 opponents = one row
of 3 + one row of 1; a 6-player game has 5 opponents = one row of 3 + one
row of 2 — both are fine, expected, non-ragged-looking outcomes, do not
try to force exactly-even rows). At 2-3 players (1-2 opponents) the grid
should not look broken or sparse — cap each tile's width to something
reasonable (don't let 1-2 tiles stretch to fill the whole row-width) and
let the row simply be short; do not special-case low opponent counts with
different markup, the same tile/grid CSS should produce a reasonable
result at both ends by construction.

## Verify before reporting

`npx tsc -b --noEmit` silent. `npm test` green — report the exact new
total (953 baseline, plus/minus whatever the uno.test.ts fixes net out
to; should not be a large change, you're fixing 2-3 existing assertions,
not adding new tests, though a new test is welcome if you think the tile
rendering itself warrants one — use your judgment). `npm run build`
clean. Report every judgment call explicitly, especially: how you sized/
arranged the card-back stack and call-button within the smaller tile
footprint, and flex-wrap vs. grid for the container and why. You have NO
way to visually confirm this looks right (no vision) — say so plainly in
your report rather than claiming it "looks good"; the lead will do the
visual verification separately.
