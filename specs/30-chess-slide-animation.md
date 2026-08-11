# Spec 30 — Chess: pieces slide across the board on each move

User feedback: pieces currently teleport between squares, making bot moves
hard to follow. Want a slide, not too fast/slow, not interruptive — sound
stays as-is, this is visual only.

You own edits to EXACTLY:

- `src/board-games/chess/state.ts`
- `src/board-games/chess/rules.ts`
- `src/board-games/chess/chess.test.ts`
- `src/screens/ChessTable.tsx`
- `src/screens/ChessTable.css`

## 1. Module: record from/to on every move (state.ts + rules.ts)

`LastChessMove` currently has `{ by, san, check }`. Add `from: string` and
`to: string` — the algebraic squares of the move, exactly as chess.js's
`move()` result returns them (`result.from`, `result.to`). This is the
same string type already used in `ChessAction`'s MOVE variant — no new
type needed, plain strings, wire-safe.

In `rules.ts`, when constructing `lastMove` after a successful MOVE,
populate `from: action.from, to: action.to` (or `result.from`/`result.to`
— they're identical; use whichever reads cleaner in context).

**Update chess.test.ts**: every existing `lastMove` equality assertion
needs `from`/`to` added to match the actual move played. Find every
`.toEqual({ by: ..., san: ..., check: ... })` on a `lastMove` (there are
8 in the current file — plain move e4/e5, castling kingside/queenside,
en passant capture, promotion, checkmate, and one more mid-game move) and
add the correct `from`/`to` for each based on the move that was actually
made in that test. Do not weaken any assertion — add the fields, verify
each is the actual square pair for that specific move.

## 2. Screen: FLIP-style slide (ChessTable.tsx + ChessTable.css)

Approach: give the piece rendered at the move's destination square a
wrapper element sized to exactly one board cell, offset it (via CSS
transform, in cell-relative percentage units) to visually start at the
origin square, then animate that offset to zero — landing it at its real
position. This requires the wrapper to be exactly cell-sized (not the
74%-sized piece token) so percentage-based transforms equal whole cells.

Concretely:

1. Add a helper (top of file or inline): given a square string like
   `"e4"`, return `{ row, col }` using the same convention already used
   for rendering (`row = 8 - rank`, `col = file index a=0..h=7`).

2. Wrap the existing piece rendering (`{cell && (isSelectable ? <button
   className="ch-piece">... : <span className="ch-piece">...)}`) in a new
   `<span className="ch-piece-slot">` that is `position: absolute; inset:
   0` (new CSS rule — same size as the `.ch-cell` it's inside, since
   `.ch-cell` is `position: relative`). The existing `.ch-piece` rule's
   own `position: absolute; left:50%; top:50%; transform: translate(-50%,
   -50%)` is UNCHANGED and still centers the token within this new
   wrapper exactly as it did directly inside `.ch-cell` before — no visual
   change when not sliding.

3. For the cell currently being rendered at row/col, compute whether it
   is the destination of the just-landed move: `publicState.lastMove &&
   publicState.lastMove.to === square` (the `square` variable already
   computed per-cell in the existing render loop). If so, compute the
   origin's row/col from `lastMove.from` and the offset:
   `dx = originCol - col`, `dy = originRow - row` (both signed integers,
   the number of cells to shift).

4. Give the wrapper a `key` that changes exactly when a NEW move lands on
   this square — reuse the existing `moveSig` value already computed in
   this component for the sound-effect guard (`${turnNumber}:${by}:${san}`).
   `key={isLandingSquare ? \`${square}:${moveSig}\` : square}` — this
   forces React to mount a fresh DOM node (triggering the CSS animation)
   only on the exact square/move combination, leaving every other square's
   piece untouched across renders (no spurious remounts, no replay on
   unrelated re-renders like selecting a piece).

5. When it's the landing square, pass `dx`/`dy` as CSS custom properties
   via inline style (`{ ['--dx']: dx, ['--dy']: dy }` — cast as needed for
   TS, matching the existing `['--tile-border' as string]` pattern used
   elsewhere in this codebase) and add class `ch-piece-slot--sliding`.

6. CSS (`ChessTable.css`):
```css
.ch-piece-slot {
  position: absolute;
  inset: 0;
}
.ch-piece-slot--sliding {
  animation: ch-slide-in 320ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes ch-slide-in {
  from { transform: translate(calc(var(--dx) * 100%), calc(var(--dy) * 100%)); }
  to { transform: translate(0, 0); }
}
```
   320ms — not too fast, not too slow, not a bounce/overshoot (this is
   chess, not the Wahoo marbles — a clean, precise slide fits better than
   a playful bounce). No JS timers needed; the CSS animation is self-
   contained and the fresh-mount-via-key guarantees it always plays
   exactly once per move, never replays on unrelated re-renders (clicking
   to select a piece, promotion bar interactions, etc. don't change
   `moveSig` so the key is stable and no remount/replay happens).

7. Apply this on EVERY move (both players), matching the existing sound
   trigger's "no wasMyTurn gate — both players hear/see everything"
   convention — consistent and simpler than restricting to bot moves only.

## Known, accepted limitation (do not attempt to fix)

Castling's rook is not tracked by `lastMove` (only the king's from/to is
recorded, per chess.js's move object) — the rook will still teleport to
its post-castling square while the king slides. This is a minor, accepted
gap; do not add rook-tracking logic for it.

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` green (821 + no change to count
unless you added assertions, which you did within the SAME 8 existing
tests — count should stay 821, just those 8 assertions gain fields).
Report the diff, confirm all 8 lastMove test sites were updated with
correct from/to pairs (list them), and verbatim final outputs.
