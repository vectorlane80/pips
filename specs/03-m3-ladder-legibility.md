# Spec 03 — M3: ladder legibility (contrast, persistent numbers, opponent ring)

Read `CLAUDE.md` first — binding. This is a deliberate, documented deviation
from the original design handoff's hover-only chip spec — see
`CHARTER.md`'s ambiguity resolution 4 for why. Read the `PhaseLadder`
sub-component in `src/screens/Phase10Table.tsx` (search `function
PhaseLadder`) and its CSS in `src/screens/Phase10Table.css` (search
`.p10-ladder`) in full before editing.

## Files you own
```
src/screens/Phase10Table.tsx   (PhaseLadder sub-component only)
src/screens/Phase10Table.css   (the .p10-ladder-* rules only)
```
Do not touch anything else in either file, and do not touch any other
file. Do not run `git commit`.

## Three changes to `PhaseLadder`, all in the same component

### 1. A permanently visible phase number on every chip

Currently each chip (`.p10-ladder-chip`) is a bare 22×22px colored circle
with no content — the phase number only ever appears in the hover caption
below the whole strip. Add the 1-based phase number (`p.phase`) INSIDE
each chip, always visible:

```tsx
<div className={`p10-ladder-chip p10-ladder-chip--${fill}`}>
  {p.phase}
</div>
```
CSS (`.p10-ladder-chip`): add `display: flex; align-items: center;
justify-content: center; font-size: 10px; font-weight: 700;` and a text
color that reads against each fill state — this needs a color PER fill
variant, not one shared color, since the three fills are very different
brightnesses:
```css
.p10-ladder-chip--current { color: #fff; }   /* white text on violet */
.p10-ladder-chip--done { color: var(--muted-text); }  /* on the grey fill */
.p10-ladder-chip--ahead { color: var(--muted-text); }  /* on white */
```
(Add these as extensions to the EXISTING `.p10-ladder-chip--current`/
`--done`/`--ahead` rules already in the file — don't create new class
names, just add the `color` declaration to each.)

Keep the hover caption exactly as it is (`Phase N — {label}`) — it still
carries the full requirement text the numbers alone don't, and the number
now on the chip just means the user doesn't have to hover or count to know
which phase they're looking at.

### 2. A visible ring on the opponent's current-phase chip, not just a dot

Right now the ONLY indication of the opponent's current phase is a tiny
7px dot underneath their chip (in `opponentColor`) — the chip's own fill
color reflects ONLY the local player's progress (`fill` is computed purely
from `localPhaseIdx`), so the opponent's actual position is easy to miss
entirely, especially if the low-contrast dot is hard to see. Add a visible
outline ring around the opponent's current chip, in their color, layered
on top of whatever base fill that chip already has:

```tsx
<div
  className={`p10-ladder-chip p10-ladder-chip--${fill}${i === opponentPhaseIdx ? ' p10-ladder-chip--opponent-here' : ''}`}
  style={i === opponentPhaseIdx ? { boxShadow: `0 0 0 2px ${opponentColor}` } : undefined}
>
```
(Using an inline `boxShadow` for the ring color since `opponentColor` is a
runtime prop value, not a fixed CSS variable — same pattern already used
elsewhere in this file for per-owner coloring, e.g. `GroupCluster`'s
`ownerColor`/`ownerShadow` props. The `p10-ladder-chip--opponent-here`
class name is there for the non-color parts of the ring treatment — add a
CSS rule for it giving the ring a bit of breathing room, e.g. a small
positive `outline-offset`-style visual gap if `box-shadow` alone looks
cramped against the chip's existing `border` — use your judgment on the
exact spacing, the requirement is just "clearly visible ring in the
opponent's color, not cramped against the existing border.")

This means a chip CAN show both: the local player's fill state (violet/
grey/white) AND a ring if it also happens to be the opponent's current
chip (this is expected and correct — both players' progress is real
information, showing both isn't a conflict).

### 3. Bigger, lower-contrast-border dots

The two small dots underneath each chip (`.p10-ladder-dot`, currently 7×7px
with `border: 1px solid var(--ink)`) are hard to tell apart at that size
with a solid dark border eating into the visible color. Change:
```css
.p10-ladder-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid rgba(23, 23, 58, 0.25);
}
```
(`rgba(23, 23, 58, 0.25)` is a soft, low-opacity version of the app's ink
color — a subtle ring rather than a hard black outline, per the user's own
suggestion of "a thinner black line.") Also widen `.p10-ladder-dots`'s
`gap` from `3px` to `4px` and its `min-height` from `7px` to `11px` (10px
dot + 1px for the border) so the row doesn't visually clip the larger
dots.

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm run build
```
(No test suite changes needed — presentational only, no game logic.) Do a
manual visual check yourself: start the dev server, get into a real Phase
10 game (host vs. house bot works fine), and confirm in a screenshot that
every chip shows its number, the opponent's current-phase chip has a
visible colored ring, and the two dots read as clearly distinct colors at
a normal viewing size — not just that the code compiles. Include what you
observed, described concretely, in your report.

Report: files touched, exact command output, your visual observations,
confirm no `git commit` was run.
