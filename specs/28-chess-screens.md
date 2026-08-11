# Spec 28 — Chess screens: board, room with difficulty picker, results

You own EXACTLY these files:

- `src/screens/ChessRoom.tsx` (new)
- `src/screens/ChessTable.tsx` (new)
- `src/screens/ChessTable.css` (new)
- `src/screens/ChessResults.tsx` (new)
- `src/screens/ChessRulesOverlay.tsx` (new)
- `src/hooks/useSound.ts` (edit: registry additions ONLY)

Do NOT touch App.tsx, Landing.tsx, route.ts. Screens import from
`src/board-games/chess/`, `chess.js` (for move generation to compute legal
destinations client-side — read-only, never mutate authoritative state),
`src/engine/`, `src/hooks/`, `src/components/`. Before writing each file,
READ the named sibling and mirror its structure exactly:
- `src/screens/BattleshipRoom.tsx` — variant-picker room pattern (this is
  your template for the difficulty picker: same shape, "House rules" list
  → "Difficulty").
- `src/screens/CheckersTable.tsx` + `.css` — 8×8 grid board, chunky token
  pieces, selection/destination rings (your template for the board;
  chess needs 6 piece types instead of one, see below).
- `src/screens/CheckersResults.tsx` — your template for ChessResults, but
  the outcome shape is different (see below — no numeric score).
- `src/screens/CheckersRulesOverlay.tsx` — modal shell template.

Brand color: `#0891b2`.

## useSound.ts

Confirm `checker-jump`/`king-me`/`error`/`piece-drop`/`game-win` already
exist in the registry (they do — no new entries needed for chess). If any
name differs from what's assumed here, use the registry's REAL name and
note the deviation. Make no other changes to this file.

## ChessRoom.tsx

Mirror `BattleshipRoom.tsx`'s shape exactly: code card, copy-link, "Playing"
chip, then a **"Difficulty"** section replacing "House rules" — three
options rendered the same way as Battleship's variant list (reuse the
`.bs-variant-list`/`.bs-variant-option` CSS classes from BattleshipTable.css
directly — do not fork new CSS for this, since ChessTable.css shouldn't
duplicate them and this file doesn't own BattleshipTable.css):
- Easy — "Forgiving and a little random."
- Normal — "Thinks two moves ahead."
- Hard — "A real engine. (Coming soon — plays Normal for now.)" — **disabled**
  (grayed, not selectable) since M3 (Stockfish) hasn't landed; selecting it
  is a future capability, not a current one.
"Play the house" button starts a 2-seat game (host + bot) like Battleship's
"Play the house" — Chess is always exactly 2 seats, no open-seat waiting
beyond the one guest slot (mirror Battleship's "At the table" column with
one seat + one open-seat card). Title "Chess table". Props:
```ts
{ code: string; localName: string; notice?: string | null;
  difficulty: ChessDifficulty; onSetDifficulty: (d: ChessDifficulty) => void;
  onAddHouseBot: () => void; onLeave: () => void }
```

## ChessTable.tsx + ChessTable.css

Props (export the interface):
```ts
export interface ChessTableProps {
  code: string
  localPlayerId: string
  names: Record<string, string>
  colors: Record<string, string>
  connection: 'connected' | 'disconnected'
  notice?: string | null
  publicState: ChessPublicState
  onMove: (from: string, to: string, promotion?: 'q'|'r'|'b'|'n') => void
  onResign: () => void
  onOfferDraw: () => void
  onAcceptDraw: () => void
  onDeclineDraw: () => void
  onOpenRules: () => void
  onLeave: () => void
}
```
(Sound toggle + rules-overlay-as-local-state follows the Checkers/MT
pattern if that's what the sibling does — check CheckersTable.tsx's own
handling of `onOpenRules` and copy it.)

### Board

8×8 grid like Checkers: `repeat(8, 1fr)`, `max-width: 640px` (bigger than
Checkers per the handoff — "no side-by-side second board to share room
with"), `aspect-ratio: 1`, centered, 4px ink border, rounded, overflow
hidden. Reconstruct `new Chess(publicState.fen)` in the component (a plain
read: call `.board()` to render pieces, `.moves({square, verbose:true})`
for legal destinations of a selected square — never call `.move()` on the
client; ALL moves go through `onMove` → host validates). Squares: light
`#f4ecdd`... actually pick clearly distinct light/dark for chess (not the
checkers-brown scheme, since chess needs 64 usable squares, not 32) — use
`#f0f0f5` light / `#8f8fb0` dark-ish slate matching the site's grey-purple
palette, OR simplest: light `var(--surface)` / dark `var(--grey-fill)` —
whichever the CSS custom properties support (grep components.css for
what's available before inventing new hex).

Pieces: circular ink-outlined tokens in the **owning player's seat color**
(from `colors`), sized ~74% of the cell like Checkers, with a WHITE glyph
centered on top — per the handoff, never bare unicode chess glyphs
directly on the square (low contrast). Standard unicode glyphs
♙♘♗♖♕♔ (white codepoints, since the token fill already carries the
color) work as the glyph layer. King square rendering doesn't need a
crown — the glyph IS the king.

Interaction: tap your own piece (only on your turn, stage 'play') to
select it → ink selection ring (same 82%-circle-ring pattern as Checkers);
legal destinations (via `chess.moves({square, verbose:true})` filtered to
that piece) get a ring in `#0891b2`; tap a destination to move. If the move
is a promotion (chess.js's move list marks the candidate with a
`promotion` field present, or: pawn reaching rank 1/8), do NOT call
onMove immediately — show a promotion choice bar (queen/rook/bishop/knight,
each a small token button in the mover's color, replacing the hint line
below the board) and call `onMove(from, to, choice)` only once picked.

### Status + controls

Status line: "Check!" prefix when `publicState.lastMove?.check` is true
and stage is 'play' (e.g. "Check! Your move." / "Check! {name}'s move.");
otherwise "Your move." / "{name} is thinking…"; on stage 'over' derive
from `publicState.outcome` — checkmate: "You win by checkmate!" /
"{name} wins by checkmate."; resign: "You win — {name} resigned." /
"You resigned."; stalemate: "Draw by stalemate."; draw/agreement: "Draw by
agreement."; draw/threefold: "Draw by repetition."; draw/fifty-move:
"Draw — fifty-move rule."; draw/insufficient-material: "Draw — insufficient
material."

On your turn during 'play': Resign and Offer Draw buttons (small, below
the board, matching Checkers' button sizing). When
`publicState.drawOfferBy` is set and is NOT you: show "{name} offers a
draw." with Accept/Decline buttons in place of Resign/Offer-Draw. When it
IS you: "Draw offer sent." (no buttons, just wait).

### Sounds
Diff `publicState.lastMove` identity (same ref-guard pattern as
Checkers/MT) — on change: if the move was a capture (chess.js's move
object on the SAN — actually derive capture from whether `san` contains
'x', since publicState only stores `san`/`check`, not the full verbose
move) → play `checker-jump`, else `piece-drop`. Promotion: san containing
'=' → also play `king-me`. Stage transition to 'over' → `game-win`
(Results will also play it on mount — that's fine, matches every other
game's double-fire-tolerant pattern... actually check: does Checkers'
Table ALSO play game-win on its own stage transition, or only Results?
Grep CheckersTable.tsx's sound effect and match whatever it actually does
— don't invent a double-fire if the sibling doesn't have one).

## ChessResults.tsx

Mirror `CheckersResults.tsx`'s shell but the outcome shape is different —
**no numeric score, ever** (single game, not best-of-N; per the handoff,
"there's no accumulating score, so the top player cards show blank during
play and Won/Lost/½ once the game ends"). Props:
```ts
{ localPlayerId: string; localName: string; opponentName: string;
  publicState: ChessPublicState; isHost: boolean; notice?: string|null;
  onRematch: () => void; onBackToShelf: () => void }
```
Only renders when `stage === 'over'`. Headline derived from
`publicState.outcome`:
- checkmate/resign: "You win!" / "{name} wins." (headline color = winner's
  seat color)
- stalemate/draw/*: "It's a draw." (neutral ink color, no winner tinting)
Lede: checkmate → "{winner} won by checkmate."; resign → "{loser}
resigned."; stalemate → "Stalemate — nobody had a legal move."; agreement
→ "Both players agreed to a draw."; threefold → "Draw by repetition.";
fifty-move → "Draw by the fifty-move rule."; insufficient-material →
"Draw — neither side had enough material to mate."
Two rows (one per player), each showing name + **"Won" / "Lost" / "½–½"**
in place of a numeric score (no sort-by-score needed with 2 fixed rows —
winner row first, or both neutral on a draw). "Again" (host) + "Back to
the shelf", same as Checkers.

## ChessRulesOverlay.tsx

Mirror the modal shell. Title "How Chess works". Intro: "Full standard
rules — every piece moves the normal way, including castling, en passant,
and pawn promotion. Check, checkmate, stalemate, and draws all apply.
Resign or offer a draw any time it's your move." Rows: Checkmate — "the
side to move has no legal way out of check"; Stalemate — "the side to
move has no legal move and isn't in check (a draw)"; Draw — "by agreement,
repetition, the fifty-move rule, or insufficient material". No best-of
line (single game per match).

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` (820) green. Screens aren't wired
to the App yet — they must typecheck standalone. Report every deviation
you made from this sketch (CSS variable names, sibling behavior you
matched instead of guessed, etc.) and why, plus verbatim final outputs.
