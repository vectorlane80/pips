# Spec 17d: Dominoes screens (M3 part 1 — new files + sound registry)

Build the Dominoes UI. Study first (read only): `src/screens/RummyRoom.tsx`,
`RummyTable.tsx` (header idiom, ScoreHeader use, sound state-diff,
DealIntro gating), `RummyResults.tsx`, `RummyRulesOverlay.tsx`,
`src/components/DealIntro.tsx` (its props — reuse it, do not modify it),
`src/components/ScoreHeader.tsx`, `src/hooks/useSound.ts`, and the whole
`src/board-games/dominoes/` module incl. `layout.ts`. Brand `#5b5bd6`,
ink `#17173a`.

Create:
- `src/screens/DominoesRoom.tsx`
- `src/screens/DominoesRulesOverlay.tsx`
- `src/screens/DominoesResults.tsx`
- `src/screens/DominoesTable.tsx`
- `src/screens/DominoesTable.css`

Modify ONLY: `src/hooks/useSound.ts` — register four sounds exactly per
the existing pattern: `'domino-shuffle'` → `dominoes-shuffling.mp3`,
`'domino-draw'` → `domino-draw.mp3`, `'domino-play'` → `domino-play.mp3`,
`'knock'` → `knock.mp3` (files already exist in src/assets/sounds/).

Screens are not yet imported by App (next spec) but must typecheck.

## DominoesRoom.tsx

Copy RummyRoom verbatim-with-substitutions: header "Dominoes table",
DominoesRulesOverlay, same props `{ code, localName, notice?,
onAddHouseBot, onLeave }`. No variant picker.

## DominoesRulesOverlay.tsx

RummyRulesOverlay structure, title "All Fives — how to play". Bullets
(verbatim — these encode the user-ordered COMMON rules):
- "Double-six set, seven tiles each. The starter may lead any tile — leading a double makes it a spinner with all four sides open."
- "Each tile must match the open end it extends. Doubles sit crosswise."
- "Score whenever your play makes the open ends total a multiple of five — a double counts both its halves, and an untouched spinner counts once."
- "No play? Draw from the boneyard until you can play — a playable draw must be played. Knock (pass) only when the boneyard is empty."
- "Two knocks in a row block the round: the lighter hand banks both hands' pips, rounded down to fives. Going out banks your opponent's pips the same way."
- "First to 150 wins the match."

## DominoesResults.tsx

Mirror RummyResults: render only when
`publicState.stage === 'over' && publicState.matchWinnerId`; `game-win`
once on mount; headline "You take the match!" /
"<opponentName> takes the match."; rows show `scores[id]` with label
"points"; local `var(--green-text)`, opponent `#5b5bd6`; rematch
host-only; same props shape as RummyResults (localPlayerId, localName,
opponentName, publicState, isHost, notice?, onRematch, onBackToShelf).

## DominoesTable.tsx + DominoesTable.css

```ts
export interface DominoesTableProps {
  code: string
  localPlayerId: string
  localName: string
  opponentName: string
  opponentColor: string
  connection: 'connected' | 'disconnected'
  notice?: string | null
  publicState: DominoesPublicState
  hand: DominoTile[]              // your private hand (zone.cards)
  onPlayTile: (tileId: string, arm: DominoArm | 'center') => void
  onDraw: () => void
  onPass: () => void
  onOpenRules: () => void
  onLeave: () => void
}
```

Header: Wordmark small (onLeave) + ScoreHeader
(`youScore={publicState.scores[localPlayerId] ?? 0}`, hint
`` `to ${publicState.target}` ``, opponent from props) + Rules /
SoundToggle / Leave, rules overlay as local state (RummyTable idiom).

### Deal intro (per round, dominoes-visual — user requirement)

Reuse `DealIntro` exactly as RummyTable does (once per distinct
`roundNumber` via a ref), but `renderCardBack` draws a DOMINO TILE BACK,
not a card back: a rounded-rect 46×88-proportioned back in `#5b5bd6` with
a `#17173a` 3px border and a centered small pips-logo dot — implement as
a tiny inline component in DominoesTable. Play `'domino-shuffle'` when
the intro starts (once per round, ref-gated).

### Board

A fixed pane (`.dm-board`, height 440px desktop, ~46vh clamp on small
screens, `overflow: hidden`, rounded, bg `#dcdcf0`). Compute
`layoutBoard(center, isSpinner, arms)` + `scaleToFit(layout, paneW, paneH, 40)`
(measure the pane with a ref + resize listener; unit = 40px × scale).
Render `layout.tiles` as absolutely-positioned divs centered in the pane:
white tiles, 3px `#17173a` border, radius 6, hard shadow; two pip halves
as 3×3 dot grids using this mask (index 0–8, row-major):

```
0:[] 1:[4] 2:[0,8] 3:[0,4,8] 4:[0,2,6,8] 5:[0,2,4,6,8] 6:[0,2,3,5,6,8]
```

Half order by `dir`: the `inner` half faces back along the run —
dir 'right' → inner on the left half; 'left' → inner right; 'up' (travel
−y) → inner bottom; 'down' → inner top. Doubles (crosswise) split along
their long axis, half order cosmetic.

Render `layout.targets` as dashed circles (`r` units): visible + pulsing
(`.dm-target--live`) when a selected hand tile can legally go there
(`legalArms` from state.ts); clicking calls
`onPlayTile(selectedId, target.arm)`. The 'center' target shows when the
board is empty and it is your lead — clicking plays the selected tile to
'center'. Non-live targets render faint (opacity .25), disabled.

### Status (two lines above the board)

Event line from `publicState.lastAction` (null → round opening):
- lead/play: "<You/Name> played a|b." plus " Bank +N!" when `scored > 0`
  (use the tile's pips with a middot or pipe).
- draw: "<You/Name> drew from the boneyard."
- pass: "<You/Name> knocked."
Round opening (no lastAction): "Your lead — play any tile to open the
board." / "<Name> opens the board…".
Prompt line from the turn (stage 'play' only): your turn →
(no legal play ? (boneyard > 0 ? "No match — draw from the boneyard." :
"No match, boneyard's empty — knock.") : "Your move.") ; else
"<Name> is thinking…". Stage 'roundEnd': from `roundResult` —
out: "<You/Name> went out — +N."; blocked: scorer ? "Blocked — <You/Name>
bank(s) +N." : "Blocked — nobody scores."; append "Next round coming up…"
when matchWinnerId is null.

### Hand + boneyard rail (below the board)

- Your hand: tile buttons (RummyTable-card-row style, 88×46, pip halves
  side by side, divider): enabled when stage 'play', your turn, and the
  tile has ≥1 legal arm (or it's your lead — all enabled); selected →
  border `#5b5bd6`, lifted; click toggles selection (leading with an
  empty board: clicking a tile plays it to center immediately, matching
  the prototype).
- Opponent row: `handCounts[opponentId]` tile backs (small).
- Boneyard chip: "Boneyard · N" + a **Draw** button (enabled: your turn,
  stage 'play', no legal play, N > 0 → `onDraw`) and a **Knock** button
  (enabled: your turn, stage 'play', no legal play, N === 0 → `onPass`).

### Sounds (state-diff)

Ref the last processed `revision`. On each new revision, by
`lastAction.kind`: lead/play → `play('domino-play')`; draw →
`play('domino-draw')`; pass → `play('knock')`. Additionally when stage
transitions play→roundEnd with a non-null scorer → `play('round-win')`.
Both players hear everything (no wasMyTurn gate).

### CSS

`DominoesTable.css`, `dm-` prefixed, tokens.css variables, hard-shadow
language, boards/hand responsive (hand wraps; pane full-width).

## Verify

```
npx tsc -b --noEmit
npm test        # 597 green, no new tests required in this spec
npm run build
```

## Forbidden

Modifying anything except the five new files + useSound.ts. Touching
App.tsx, Landing, the dominoes module, DealIntro, engine. Class
components. git.

## Report

(1) commands + tallies; (2) files created; (3) deviations or "no
deviations".
