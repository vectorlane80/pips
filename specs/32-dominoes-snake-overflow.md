# Spec 32 — Dominoes: fix the snake board's runaway-overflow bug

User report with a screenshot: a real game reached a state where one arm's
run got long enough to bend (per the pinwheel: right→up, up→left,
left→down, down→right), and then kept extending in the new direction
*without ever bending again*, running off past the visible pane. The
board became unplayable — targets/tiles ended up outside the rendered
area with no way to reach them.

## Root cause (confirmed by reading the code + docs)

`layArm` in `src/board-games/dominoes/layout.ts` allows **at most one
bend per arm** (a single `bent` boolean flag), with fixed limits
`H_MAX = 11` / `V_MAX = 4` units. A double-6 set has 28 tiles; in the
worst *legal* case nearly all of them (up to 27, since only one tile is
the center) can end up chained onto a single arm if the other player's
hand only ever matches one open end. Worst case: 27 tiles, as few doubles
among them as combinatorially possible (a double-6 set has only 7 doubles
total, so at least 27−7=20 of those 27 could be non-doubles at 2 units
each) → up to **~54 units** of single-direction run length is a real,
reachable case — nearly 5× the 11-unit limit that triggers only one bend.
Once that one bend is used up, nothing stops the run from extending
forever in the new direction.

`scaleToFit`'s `Math.max(0.7, scale)` floor compounds this: once the
board's true bounding box needs more shrinking than 0.7× to fit the pane,
it just stops shrinking and clips instead of continuing to fit everything
on screen.

## The fix (decision-locked)

You own EXACTLY:
- `src/board-games/dominoes/layout.ts`
- `src/board-games/dominoes/layout.test.ts`
- `docs/dominoes.md` (the "Snake board" section — update it to match)

### 1. Repeat the bend — but as an EXPANDING spiral, not a fixed-radius one

Replace the single `bent` boolean in `layArm` with a `legIndex` counter
(0-based: leg 0 is the initial unbent direction, leg 1 is after the
first bend, leg 2 after the second, etc.). On every tile placement, bend
whenever the cursor's distance from the origin along the CURRENT leg's
axis would exceed THAT LEG'S limit — computed dynamically, not the fixed
`H_MAX`/`V_MAX` constants directly:

```ts
const SPIRAL_STEP = 10 // extra units of headroom each additional bend gets

function legLimit(horizontal: boolean, legIndex: number): number {
  const base = horizontal ? H_MAX : V_MAX
  if (legIndex < 2) return base // legs 0 and 1: identical to today, unchanged
  return base + SPIRAL_STEP * (legIndex - 1) // leg 2+: each bend widens the ring
}
```

Why this shape, precisely:
- **Legs 0 and 1 are byte-for-byte unchanged** from today (`legLimit`
  returns the plain `H_MAX`/`V_MAX` for `legIndex < 2`) — every normal
  game (the overwhelming majority, which never needs a second bend) must
  render pixel-identical to before. Do not touch the existing corner-flush
  offset math for these legs.
- **Leg 2 onward gets progressively more room.** Each additional bend's
  limit is checked as an absolute distance from the origin along that
  axis (same mechanism as today), so making each subsequent leg's limit
  strictly larger than any earlier leg on the SAME axis orientation
  guarantees the path spirals outward and can never re-cross a ring it
  already laid — this is the standard construction for a self-avoiding
  expanding rectangular spiral. Verify this property holds (it does, by
  the monotonically-increasing-limit argument) rather than just trusting
  it; if you find a counterexample while testing, the fix is to increase
  `SPIRAL_STEP`, not to add collision-detection code.
- **Cap total bends at 8** (`legIndex` maxes at 8) as a hard ceiling —
  belt-and-suspenders on top of the set-size argument above, not because
  8 is reachable in practice (worst-case math above needs ~4 bends with
  this formula; 8 is double that for margin). If somehow exceeded, the
  last leg just keeps extending unbounded past its limit rather than
  crashing — matches today's "beyond that the screen's scale clamp
  absorbs the rest" comment, now paired with fix #2 below so that clamp
  actually holds.
- The existing corner-flush offset logic (shift the cursor half a unit
  along the old direction and half back along the new one) applies on
  EVERY bend now, not just the first — generalize it, don't duplicate it.

### 2. Lower the scale floor as defense in depth

`scaleToFit`'s `Math.max(0.7, scale)` — lower the floor to `0.35`. With
fix #1 in place this floor should rarely if ever bind, but it's the
safety net for any board that still ends up larger than expected: shrink
further rather than clip. Keep the rest of the function unchanged.

### 3. Tests (`layout.test.ts`)

- Every existing test must still pass unchanged (legs 0/1 behavior is
  byte-identical) — this is your main correctness signal. Do NOT edit
  existing assertions to make them pass; if one breaks, your leg-0/1
  logic has drifted from the original.
- Update the one test that hardcodes the old floor
  (`scales a huge board down but never below 0.7`) to expect `0.35`
  instead, and add a case confirming it still doesn't go below `0.35`
  for an even huger board.
- Add a new test reproducing the actual reported bug: build a single arm
  with ~24-27 placed tiles, weighted toward non-doubles (mirror the
  worst-case shape from this spec — you can alternate faces to keep the
  matching-chain fiction simple, `layoutBoard`/`layArm` only care about
  `{inner, outer, isDouble}`, not real chain legality). Assert: (a) the
  arm bends more than once (multiple distinct `dir` values appear across
  its tiles), (b) no two tiles in the resulting layout overlap (extend
  the existing "keeps a busy board free of overlaps" test's overlap-
  checking approach to this new board), (c) `layoutBoard`'s returned
  bounds stay within a sane envelope (e.g. maxX−minX and maxY−minY both
  under ~120 units) — proving the spiral actually stayed bounded instead
  of running off, not just that it happened not to crash.

## Docs

Update `docs/dominoes.md`'s "Snake board" paragraph to describe the
repeating expanding-spiral bend (not "one bend per arm") and the new
0.35 scale floor, so the doc matches the code.

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` all green (report new total —
should grow by however many tests you added). Report the exact
`legLimit` values you ended up shipping if you tuned `SPIRAL_STEP`
differently, and verbatim final outputs.
