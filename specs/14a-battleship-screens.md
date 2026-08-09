# Spec 14a: Battleship screens (M2 part 1 — new files + sound registry)

Implement the Battleship UI screens for Pips. All decisions are made below.
Study these files first (read only): `src/screens/RummyRoom.tsx`,
`src/screens/RummyTable.tsx` (prop shape, header row, overlay idiom, sound
state-diff effect), `src/screens/RummyResults.tsx`,
`src/screens/RummyRulesOverlay.tsx`, `src/components/ScoreHeader.tsx`,
`src/hooks/useSound.ts`, and the game module in
`src/board-games/battleship/` (import its types + helpers; do NOT modify it).
Brand color: `#1a6fae`. Ink dark: `#17173a`.

Create:
- `src/screens/BattleshipRoom.tsx`
- `src/screens/BattleshipRulesOverlay.tsx`
- `src/screens/BattleshipResults.tsx`
- `src/screens/BattleshipTable.tsx`
- `src/screens/BattleshipTable.css`

Modify ONLY: `src/hooks/useSound.ts`.

These screens are not yet imported by App.tsx (that's spec 14b) — they must
still typecheck standalone (`npx tsc -b --noEmit` covers all of src/).

## useSound.ts

Three placeholder mp3s already exist in `src/assets/sounds/`:
`ship-hit.mp3`, `ship-miss.mp3`, `ship-sunk.mp3`. Add them exactly the way
every other sound is registered: import, `SoundName` union member, and
`SOUND_FILES` entry, names `'ship-hit' | 'ship-miss' | 'ship-sunk'`.
Change nothing else in the file.

## Assets

Ship art + marker sheet are already at `src/assets/battleship/`:
`ship-<id>-h.png` / `ship-<id>-v.png` for the five ship ids, plus
`markers.png` (a horizontal 4-frame sheet: blank / hit / miss / sunk).
Import them as ES modules in BattleshipTable.tsx (Vite serves them, same
pattern as the mp3 imports in useSound.ts). Markers are rendered as a
cell-sized `<span>` with `background-image: markers.png`,
`background-size: 400% 100%`, `background-position-x` = frame × (100/3)%,
frames: blank 0, hit 1, miss 2, sunk 3 — exactly the prototype's trick, one
image URL, never a per-cell `<img>`.

## BattleshipRoom.tsx

Copy RummyRoom's structure verbatim with these changes: header label
"Battleship table", overlay = BattleshipRulesOverlay, share text mentions
Battleship. Same props: `{ code, localName, notice?, onAddHouseBot, onLeave }`.

## BattleshipRulesOverlay.tsx

Copy RummyRulesOverlay's structure (backdrop click closes, panel
stopPropagation, single `onClose` prop). Title "Battleship — how to play".
Bullets (verbatim):
- "Place your five ships on your grid: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2). Rotate with the button or spacebar."
- "Take turns firing one shot at the enemy waters. Hit or miss, the turn passes."
- "A ship goes down when every one of its squares is hit — sinking it scores you a point and reveals its shape."
- "Your fleet panel shows your true damage; the enemy's only lights up as you sink their ships."
- "Sink all five enemy ships to win the match."

## BattleshipResults.tsx

Mirror RummyResults exactly (returns null unless over, `game-win` sound once
on mount, rematch host-only button, back-to-shelf), with:

```ts
export interface BattleshipResultsProps {
  localPlayerId: string
  localName: string
  opponentName: string
  publicState: BattleshipPublicState
  isHost: boolean
  notice?: string | null
  onRematch: () => void
  onBackToShelf: () => void
}
```

Render when `publicState.stage === 'over' && publicState.winnerId !== null`.
Headline: winner is you → "You sank the whole enemy fleet!", else
"<opponentName> sank your whole fleet!". Score rows: each player's
`scores[id]` with the label "ships sunk". Local row color
`var(--green-text)`, opponent `#1a6fae`.

## BattleshipTable.tsx + BattleshipTable.css

```ts
export interface BattleshipTableProps {
  code: string
  localPlayerId: string
  localName: string
  opponentName: string
  opponentColor: string
  connection: 'connected' | 'disconnected'
  notice?: string | null
  publicState: BattleshipPublicState
  board: (ShipId | null)[]     // your own board (privateState) — all null until your PLACE_FLEET is accepted
  onPlaceFleet: (board: (ShipId | null)[]) => void
  onFire: (cell: number) => void
  onOpenRules: () => void
  onLeave: () => void
}
```

Header row: same idiom as RummyTable — `Wordmark small onClick={onLeave}`,
`ScoreHeader` in the middle
(`youScore={publicState.scores[localPlayerId] ?? 0}`, `youColor="var(--green-text)"`,
`opponentScore`, `opponentColor`, `hint="ships sunk"`), then Rules /
SoundToggle / Leave cluster. Own the rules overlay locally
(`rulesOpen` state, `void onOpenRules` like RummyTable does).

### Phase selection

- `publicState.stage === 'placing' && !publicState.placedReady[localPlayerId]`
  → placement mode (draft board, local state).
- `placing && placedReady[localPlayerId]` → your real `board` prop, waiting
  banner "Waiting for <opponentName> to place their fleet…", enemy grid
  stays dimmed.
- `'battle'` / `'over'` → battle mode.

### Boards (both modes)

Two 10×10 grids side by side (stack on narrow screens via CSS
`flex-wrap`), titled "Your fleet" and "Enemy waters", each wrapped with A–J
column letters above and 1–10 row numbers left — plain labels outside the
grid, never grid cells. Cells: CSS grid, `gap: 0`, 1px border per cell,
square cells sized `clamp()`-responsive in the CSS file. Base cell
`background #eafaff; border-color #c9c9e0`.

Cell rendering (port of the prototype view logic):
- Your fleet cell: mark = `publicState.hits[localPlayerId][i]`. If `'hit'`:
  sunk-here (that cell's ship fully sunk — compute with `isShipSunk(displayBoard, hits, shipId)`)
  → bg `#17173a`, sunk marker frame; else bg `#ff5d73`, hit frame; border
  `#17173a`. If `'miss'`: bg `#fff`, miss frame.
- Enemy waters cell: mark = `publicState.hits[opponentId][i]`; sunk-here iff
  the cell is listed in some `publicState.sunk[opponentId][*].cells`; same
  colors/frames.
- Enemy grid gets `opacity: .45` and disabled cells during placement.
- Battle: enemy cells clickable iff it's your turn
  (`currentPlayer(publicState.turn) === localPlayerId`), stage 'battle', and
  the cell is unfired → `onFire(i)`.

### Ship artwork overlays

Absolutely-positioned `<img>`s inside each grid's relative wrapper, exactly
the prototype geometry: for a ship whose cells span from (minR, minC),
horizontal iff all cells share a row: `left: minC*10%`, `top: minR*10%`,
`width: horizontal ? len*10% : 10%`, `height: horizontal ? 10% : len*10%`,
`pointer-events: none`, h-image for horizontal, v-image otherwise.
- Your fleet: draw all your ships (from the display board — draft while
  placing, `board` prop otherwise); a ship drops to `opacity: .32` when sunk.
- Enemy waters: draw ONLY ships present in `publicState.sunk[opponentId]`
  (build a partial board from each reveal's `cells` + `shipId`), always at
  `.32` — revealed means sunk.

### Fleet status pill rows

Under each board, five pills (ship names). Yours: alive → bg `#1a6fae` fg
white; damaged (`isShipDamaged`) → bg `#ffd23f` fg `#17173a`; sunk → bg
`#17173a` fg white; border `#17173a`. Enemy: unknown (not sunk) → bg white,
fg `#c2c2d8`, border `#e4e4f0`; sunk → bg `#17173a` fg white.

### Placement mode panel

Local state: `draft: (ShipId | null)[]` (starts 100×null), `placedIds:
ShipId[]`, `selIdx: number` (index into SHIPS, −1 none), `orient: 'h'|'v'`,
`hoverCell: number` (−1 none).

- Status line above the boards: selected ship →
  "Placing: <Name> (<len>) — click your grid to drop it"; all five placed →
  "Fleet placed — start the battle when ready."; else
  "Pick a ship below to place it."
- Hover preview on your grid: cells of
  `shipCellsAt(hoverCell, len, orient)`; legal (`fits(draft, cells)`) → bg
  `#bcdcf2`, border `#17173a`; illegal (null cells or not fits) → bg
  `#ffd7dc`, border `#ff5d73`. Click a legal anchor → fill draft, append
  placedIds, auto-select next unplaced ship (−1 if none), clear hover, play
  `'piece-drop'`.
- Tray below the boards: a row per ship — name, `len` square chips, subtext
  "<len> squares" / "Placed". Unplaced rows clickable to select (selected:
  border `#1a6fae`, bg `#e3eef7`); placed rows greyed (bg `#f4f4fb`, fg
  `#9a9ab8`), not clickable.
- Buttons: **Rotate** (label "Horizontal ↔" / "Vertical ↕") — also bound to
  spacebar via a `window` keydown effect active only in placement mode
  (`e.code === 'Space'`, `preventDefault()`, ignore when
  `e.target` is an input/textarea); **Randomize remaining** — `draft =
  randomFleet(Math.random, draft, placedIds)`, all five placed, selIdx −1,
  play `'piece-drop'`; disabled when 5 placed; **Start battle** — enabled
  only at 5 placed → `onPlaceFleet(draft)`. Primary-button styling per the
  existing `.btn` classes.

### Battle mode panel

- Turn chip + status, same pattern as other tables: title "Your move" /
  "<opponentName>'s move"; chip color `#1a6fae` when placing, else your
  green / opponent color.
- Status text from `publicState.lastShot` (viewer-dependent, derive
  locally). Let `shooterIsMe = lastShot.by === localPlayerId`, and name =
  opponentName:
  - sunk + all five of the target's ships sunk (`stage === 'over'`):
    shooterIsMe → "You sank the whole enemy fleet!" else
    "<name> sank your whole fleet!"
  - sunk: shooterIsMe → "You sank their <ShipName>!" else
    "<name> sank your <ShipName>!"
  - hit: shooterIsMe → "Direct hit!" else "<name> hit your fleet."
  - miss: shooterIsMe → "Miss." else "<name> missed."
  - no lastShot yet: "Your move — fire at the enemy waters." /
    "<name> fires first."
- Hint line: your turn → "Click enemy waters to fire."; else
  "<opponentName> is aiming…"; empty when over.

### Sounds (battle)

State-diff pattern like RummyTable: a ref holding the last processed shot
signature `${turn.turnNumber}:${lastShot.by}:${lastShot.cell}` (null-safe).
In an effect, when a NEW lastShot appears: result 'hit' → `play('ship-hit')`,
'miss' → `play('ship-miss')`, 'sunk' → `play('ship-sunk')`. Both players
hear shots (no wasMyTurn gate — a hit on you matters as much as your hit).

### CSS

`BattleshipTable.css`, imported by the table. Class names prefixed `bs-`.
Match the repo look (tokens.css variables, `.btn` reuse, hard shadows
`0 2px 0` style). Responsive: boards side by side ≥ 900px, stacked below.

## Verification

```
npx tsc -b --noEmit
npm test        # 514 tests, all green (no new tests in this spec)
npm run build
```

## Forbidden

Modifying anything except the five new files + useSound.ts. Touching
App.tsx, Landing.tsx, the game module, engine, or any existing screen.
Adding dependencies. `git` commands. React class components (function
components + hooks only, matching every existing screen).

## Report

(1) commands + verbatim tallies; (2) files created/modified; (3) deviations
or "no deviations".
