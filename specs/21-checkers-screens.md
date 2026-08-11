# Spec 21 — Checkers screens + sound registry

You own EXACTLY these files:

- `src/screens/CheckersRoom.tsx` (new)
- `src/screens/CheckersTable.tsx` (new)
- `src/screens/CheckersTable.css` (new)
- `src/screens/CheckersResults.tsx` (new)
- `src/screens/CheckersRulesOverlay.tsx` (new)
- `src/hooks/useSound.ts` (edit: registry additions ONLY)

Do NOT touch App.tsx, Landing.tsx, route.ts, or anything else. Screens may
import from `src/board-games/checkers/`, `src/engine/`, `src/hooks/`,
`src/components/`. Before writing each file, READ the Battleship sibling
(`src/screens/Battleship*.tsx`, `BattleshipTable.css`) and mirror its
structure, prop plumbing, header/chip layout, and CSS conventions exactly —
Checkers is the same kind of 2-player engine game. Brand color: `#b45309`.

## useSound.ts

Add three sounds, exactly in the existing pattern (import, `SoundName` union,
`SOUND_FILES`): `checker-move` → `checker-moving.mp3`, `checker-jump` →
`checker-jumping-over.mp3`, `king-me` → `king-me.mp3`. The files already
exist in `src/assets/sounds/`. Change nothing else in the file.

## CheckersRoom.tsx

Mirror `BattleshipRoom.tsx` (which itself follows the shared room pattern):
code display + copy-invite, 2 seats, "Add house bot" when a seat is open,
Start gated on 2 seated players, Rules/Leave. Title "Checkers table".

## CheckersTable.tsx + CheckersTable.css

Props contract (App wiring comes in a later spec — export it):

```ts
export interface CheckersTableProps {
  code: string
  localPlayerId: string
  names: Record<string, string>          // playerId -> display name
  colors: Record<string, string>         // playerId -> seat ink color
  connection: 'connected' | 'disconnected'
  notice?: string | null
  publicState: CheckersPublicState
  soundEnabled: boolean
  onToggleSound: (on: boolean) => void
  onMove: (from: number, to: number) => void
  onOpenRules: () => void
  onLeave: () => void
}
```

(If the Battleship table handles sound/notice/header differently — e.g. sound
toggle lives in a shared header component — copy THAT pattern instead and
drop the sound props; matching the sibling wins over this sketch.)

Layout, matching the prototype design:

- Header chip `Checkers · {code}` (brand `#b45309` accent like Battleship
  does with its brand).
- Two scoreboard cards above the board (one per player): name, games-won
  count, sub-line "games won"; the current player's card fills with their
  seat color (white text), the other stays surface-colored. Match the
  Battleship/Wahoo pill/card styling.
- Board: CSS grid `repeat(8, 1fr)`, `max-width: 460px`, `aspect-ratio: 1`,
  centered, `border: 4px solid var(--ink)`, `border-radius: 14px`,
  `overflow: hidden`. Dark squares `#8a6045`, light `#f4ecdd`.
- Pieces: circles at 74% of the cell, `background` = that player's seat
  color (from `colors`), `border: 3px solid var(--ink)`,
  `box-shadow: 0 2px 0 rgba(0,0,0,0.3), inset 0 2px 0 rgba(255,255,255,0.25)`.
  Kings additionally show a white `♛` glyph centered on the piece
  (font-size ~15px, pointer-events none).
- Selection: tapping your own piece selects it → ink-colored 3px ring
  overlay (circle at 82% of the cell). Legal destinations (computed with
  `capturesFrom`/`movesFrom` from the module — captures always; simple moves
  only when `chainCell === null`) show a `#b45309` ring; tapping one calls
  `onMove(from, to)`. When `publicState.chainCell` is set and it's your
  piece, selection is locked to that square (clicks elsewhere don't change
  it). Cursor pointer only on selectable pieces / destinations.
- Status line under the board:
  - your turn: "Your move." (first turn of game 1:
    "Your move — captures are optional, but a jump must keep jumping while
    it can.")
  - chained: "You must continue jumping." / `${name} must continue jumping.`
  - opponent: `${name} is thinking…`
  - gameEnd: "You win this game." / `${name} wins this game.`
  - over: "You win the match!" / `${name} wins the match!`
- Hint line (small, faint, centered): "Tap a piece, then tap a highlighted
  square." on your turn; "Keep jumping with the highlighted piece." while
  chained; empty otherwise.
- Sounds, driven by `publicState.lastMove` changes (guard against replaying
  on re-render the same way Battleship/Wahoo guard theirs — read one and
  copy it): `checker-jump` when `captured !== null`, else `checker-move`;
  additionally `king-me` when `crowned`. On stage transitions: `round-win`
  when entering 'gameEnd', `game-win` when entering 'over'.

## CheckersResults.tsx

Mirror `BattleshipResults.tsx`. Winner headline "You take it!" /
`${name} takes it!`; lede `${winnerName} took the match {a}–{b}.`;
detail line "games won"; sub "best of five". Rematch + Back to shelf
buttons wired to props.

## CheckersRulesOverlay.tsx

Mirror `BattleshipRulesOverlay.tsx`'s modal shell. Title "How Checkers
works". Intro: "Standard 8×8 checkers, two players, twelve pieces each.
Move diagonally on the dark squares; jump an adjacent enemy piece to
capture it. Reach the far row to crown a piece king. First to win 3 games
takes the match." Rows: Capture — "jump an adjacent enemy piece"; King —
"reach the opposite back row"; Win — "opponent has no pieces or no legal
move". Rule lines: "Captures are optional — but once you jump, that piece
must keep jumping while it can." / "Kings move and capture one square in
any diagonal direction." / "The starter alternates between games."

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` all green (731 currently). The
screens are not yet reachable from the App — that's expected; they must
still typecheck standalone. Report files created, verbatim final command
output, any deviation you made and why. If blocked or red, say so plainly.
