# Spec 11 — Tic Tac Toe: hand-drawn X/O marks + per-mark sounds

## Task
Render Tic Tac Toe's X and O as hand-drawn SVG strokes (per the design
handoff) instead of text glyphs, with a small per-cell rotation jitter, and
play a mark-specific sound (`drawn-x` / `drawn-circle`) in place of the old
`mark-place` sound, which is retired.

## Working directory
/Users/charlie/Desktop/Projects/pips

## Files you own
- `src/screens/TttTable.tsx` (modify)
- `src/hooks/useSound.ts` (modify)
- Delete `src/assets/sounds/mark-place.mp3` (it becomes unreferenced)

Everything else is read-only. `src/assets/sounds/drawn-x.mp3` and
`src/assets/sounds/drawn-circle.mp3` already exist (placed by the lead).
NOTE: another task may be editing unrelated files in this tree — do not
touch, revert, or "clean up" anything outside your three files.

## Design decisions (already made — implement exactly, do not redesign)

### `src/hooks/useSound.ts`
- Remove the `markPlace` import, the `'mark-place'` union member, and its
  `SOUND_FILES` entry (nothing references it after this change).
- Add, in its place (same positions): imports `drawnX` from
  `'../assets/sounds/drawn-x.mp3'` and `drawnCircle` from
  `'../assets/sounds/drawn-circle.mp3'`; union members `'drawn-x' | 'drawn-circle'`;
  map entries `'drawn-x': drawnX,` and `'drawn-circle': drawnCircle,`.

### `src/screens/TttTable.tsx`

**Marks.** Seat 0 = X, seat 1 = O (that is `TTT_MARKS` order). Replace the
text-glyph rendering of X and O with inline SVGs; seats 2/3 (`△`, `□` —
unreachable at 2 players but still in `TTT_MARKS`) keep the existing text
rendering.

Add at module scope (top of file, after imports):

```tsx
// Small fixed per-cell rotation so the hand-drawn marks don't line up too neatly.
const CELL_ROT = [-4, 3, -2, 4, -3, 2, -4, 3, -2]
```

Inside the cell button, replace `{cell !== null ? TTT_MARKS[cell] : ''}`
with: nothing when `cell === null`; when `cell === 0` the X SVG; when
`cell === 1` the O SVG; otherwise `TTT_MARKS[cell]` as today.

Both SVGs (exact markup, from the design prototype):

```tsx
<svg viewBox="0 0 100 100" style={{ width: '56%', height: '56%', transform: `rotate(${CELL_ROT[i]}deg)`, display: 'block' }}>
  {/* X: */}
  <path d="M22 20 C33 36,45 50,58 64 C66 73,73 79,81 85" fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round" />
  <path d="M80 17 C68 33,55 49,43 62 C35 70,27 78,19 84" fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round" />
</svg>

<svg viewBox="0 0 100 100" style={{ width: '56%', height: '56%', transform: `rotate(${CELL_ROT[i]}deg)`, display: 'block' }}>
  {/* O: */}
  <path d="M54 14 C76 17,89 34,85 55 C82 76,64 90,45 86 C27 82,13 66,17 47 C21 30,35 15,52 16 C55 16,50 13,44 19" fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round" />
</svg>
```

The SVGs inherit their stroke color from the button's `color` (they use
`currentColor`), so the existing win/owner color logic keeps working
untouched. For the SVG to center, add `display: 'flex'`,
`alignItems: 'center'`, `justifyContent: 'center'` to the cell button's
style object. Keep every other style property exactly as it is.

**Sound.** In the existing sound effect, replace `play('mark-place')` with
the mark-specific sound for the local player's own mark:

```tsx
const mySeatIdx = room.seats.findIndex((s) => s.id === localSeatId)
```
(compute once in the component body, above the effect) and in the effect:
`play(mySeatIdx === 1 ? 'drawn-circle' : 'drawn-x')`. The guard conditions,
signature ref, `round-win` branch, and dependency array stay unchanged —
the sound still fires only for the local player's own placements, and the
mark a local player places is fixed by their seat, so no per-move mark
detection is needed. (`mySeatIdx` does not need to join the dependency
array: seats can't reorder mid-game.)

## Do NOT
- Touch `src/games/ttt.ts` (`TTT_MARKS` stays as-is), any other screen,
  `Connect4Table.tsx`, any state/reducer file, or any battleship-related
  file another task may be working on.
- Run git, commit, or push.
- Add abstractions (no extracted `Mark` component beyond the inline JSX
  above unless the file already reads that way), no new CSS classes.
- Do not modify or delete any existing test.

## Required tests
None new — pure presentation + a sound-name swap; the project has no DOM
test rig. The suite must stay at 480 passing (the `useSound` tests don't
enumerate sound names; if anything fails, report honestly).

## Verify before reporting
1. `npx tsc -b --noEmit` — clean, exit 0.
2. `npm test` — 480 passed.
3. `npm run build` — exit 0 (also proves the deleted mp3 isn't referenced).

## If stuck
After 3 failed attempts at any part, stop and report honestly what works,
what doesn't, and what you tried.

## Report format
- Files changed (list, including the deletion)
- The three verification commands' verbatim final lines
- Anything you noticed that the spec didn't cover
