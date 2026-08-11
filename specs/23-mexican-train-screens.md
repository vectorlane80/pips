# Spec 23 — Mexican Train screens: full train treatment + sound registry

You own EXACTLY these files:

- `src/screens/MexicanTrainRoom.tsx` (new)
- `src/screens/MexicanTrainTable.tsx` (new)
- `src/screens/MexicanTrainTable.css` (new)
- `src/screens/MexicanTrainResults.tsx` (new)
- `src/screens/MexicanTrainRulesOverlay.tsx` (new)
- `src/hooks/useSound.ts` (edit: registry addition ONLY)

Do NOT touch App.tsx, Landing.tsx, route.ts, or anything else. Read
`src/screens/Wahoo{Room,Table,Results,RulesOverlay}.tsx` + `WahooTable.css`
first (the multi-seat siblings) and `DominoesTable.tsx` (tile styling
reference); mirror their structure and conventions. Brand: `#c2410c`.

## useSound.ts

Add ONE sound in the existing pattern: `train-horn` → `train-horn.mp3`
(file exists). Nothing else changes.

## MexicanTrainRoom.tsx

Mirror `WahooRoom.tsx` but with MAX_SEATS = 4 and **Start gated on exactly 4
seated** (humans + bots; "Add house bot" fills, disabled at 4). Title
"Mexican Train table". Sub-hint when under 4: "Mexican Train seats exactly
four — bots fill the empty chairs."

## MexicanTrainTable.tsx — props contract (wiring comes later; export it)

```ts
export interface MexicanTrainTableProps {
  code: string
  localPlayerId: string
  names: Record<string, string>
  colors: Record<string, string>        // playerId -> seat ink
  connection: 'connected' | 'disconnected'
  notice?: string | null
  publicState: MTPublicState
  hand: MTTile[]                        // your private hand
  onPlayTile: (tileId: string, lane: MTLaneKey) => void
  onDraw: () => void
  onLeave: () => void
}
```

(As with Checkers: sound toggle + rules overlay are local, following the
sibling pattern.)

## Layout (top to bottom inside the main card)

Header chip: `Mexican Train · {code}` plus a second faint chip
`Round {round+1} of 13 · double-{engine}`.

Right rail (Wahoo-style ~200px column, wraps above on <900px): four player
cards — name, running score, sub "pips (lower wins)" (or "your move"/"their
move" for the current player), active card filled with the player's seat
color; under them the status line.

Board column: the **depot** then the five lanes then your hand.

### The train treatment (all CSS + inline SVG, no image assets)

This is the point of the screen — the prototype was bare labeled rows.

1. **Depot (station)**: centered strip above the lanes: a small building —
   CSS rectangle (`#f4ecdd`, 3px ink border, hard shadow) with a trapezoid
   roof (clip-path) and the label "Station" — holding the engine double as
   a domino-style tile showing `{engine}|{engine}` in numerals. Below it a
   short vertical track stub (two rails) visually feeding the lanes.

2. **Locomotive** — ONE inline SVG component `<Loco color={...} star? />`,
   ~64×40 viewBox, chunky site style: cowcatcher wedge, boiler with rounded
   nose, steam dome/chimney, cab with a window, two wheels (ink-ringed
   circles), every shape `stroke #17173a` `stroke-width 3`, body filled with
   the `color` prop, `filter: drop-shadow(0 3px 0 rgba(23,23,58,0.25))`.
   Faces RIGHT (pulling the train rightward away from the depot side).
   Player lanes tint it with that seat's ink; the Mexican train's loco is
   `#c2410c` with a white 5-point star (SVG polygon) on the cab.

3. **Signal** — beside each player loco, a signal post: 2px ink mast with a
   12px disc — `var(--coral)`-red when the train is closed, `var(--green)`
   when `open` (transition 0.2s). The Mexican train's signal is always
   green. Tooltip via `title`: "open"/"closed".

4. **Track bed** — each lane's tile row sits on rails: the row container
   gets `position: relative; padding: 10px 12px 14px;` and a `::before`
   (inset 0, `border-radius` inherit) painted with
   `repeating-linear-gradient(90deg, transparent 0 12px, rgba(23,23,58,0.12) 12px 16px)`
   (ties) plus two horizontal rails as
   `linear-gradient(rgba(23,23,58,0.28), rgba(23,23,58,0.28))` layers sized
   `100% 3px` at `background-position` ~30% and ~70% height,
   `background-repeat: no-repeat` for the rail layers. Lane background
   `#f4f4fb`, radius 10px.

5. **Tile cars** — placed tiles render like the Dominoes/prototype numeral
   tiles (white, 2.5–3px ink border, two halves `inner|outer` divided by an
   ink bar, ~52×32) each wrapped in a `.mt-car` that adds two wheel dots
   (8px ink circles, absolutely positioned hanging just below the tile) and,
   on every car after the first IN THE SAME ROW, a coupler: a 6×3px ink bar
   reaching back toward the previous car (`::before` on the car, positioned
   in the flex gap). Rows `display:flex; flex-wrap:wrap;` — long trains
   snake onto new rows exactly like the flex wrap already does.

6. **Ghost car (drop target)** — when a tile is selected in your hand, every
   legal lane appends a pulsing ghost car: a tile-sized dashed outline
   (`2px dashed #c2410c`, `background: rgba(194,65,12,0.08)`, same radius,
   subtle `animation: mt-pulse 1.2s infinite` opacity throb) as a button →
   `onPlayTile(selectedId, lane)`. No dashed circles.

Lane order & labels: your train first ("Your train"), then the other three
seats in seat order (`{name}’s train`), then "Mexican train". Label row for
each lane: loco + signal + label text (13px/700 faint ink), then the track.

### Hand + controls

Your 13 tiles as numeral tiles (~64×36, 3px border): selected → filled
`rgba(194,65,12,0.18)` + `#c2410c` border/shadow; playable-unselected →
white with ink border; unplayable → faded (opacity .5, grey border,
disabled). Below: `Boneyard: {boneyardCount} · your hand: {hand.length}`
and a "Draw a tile" button — enabled exactly when it's your turn, stage
'play', no tile in your hand has a legal lane, and boneyardCount > 0.

### Status + hint (yours under the board; general status in the rail)

Use the module state directly:
- your turn, tile selected: hint "Tap a glowing train to place it."
- your turn, none selected: hint "Pick a tile from your hand."
- rail status: "Your move." / `${name} is thinking…`; after your dead draw
  the module opens your train — status text comes from lastAction (see
  sounds) so keep it simple: derive from stage/turn/doublePending:
  doublePending && your turn → "Double! Play again."; doublePending &&
  not your turn → `${name} played a double — they play again.`
- roundEnd: `${name} went out — round over.` / "You went out — round
  over." / "Nobody can play — round blocked." (from roundResult)
- over: `${winner} takes it with the fewest pips!`

### Sounds (lastAction/stage diff pattern — copy the Checkers/Battleship
ref-guard)

- `domino-play` on kind 'play'
- `domino-draw` on kind 'draw'
- `train-horn` whenever `lastAction.opened !== null` (any train marked
  open) AND when a roundResult with kind 'blocked' lands
- `domino-shuffle` on every round start (round index change or initial
  mount in stage 'play')
- `round-win` entering 'roundEnd'; `game-win` entering 'over'

## MexicanTrainResults.tsx

Mirror `WahooResults.tsx` shell BUT sorted ASCENDING by score (lowest pips
wins — the only game like this). Headline "You take it!" / `${name} takes
it!`; lede `${winner} finished with the fewest pips after all thirteen
rounds.`; per-player rows show total pips, detail "total pips", sub
"13 rounds". Rematch (host) + Back to shelf.

## MexicanTrainRulesOverlay.tsx

Sibling modal shell. Title "How Mexican Train works". Intro: "Double-12
set, four players, thirteen tiles each. Each round starts from a double
'engine' — everyone builds their own train off it, and anyone can play on
the shared Mexican train. Lowest total pips after all thirteen rounds
wins." Rows: Round end — "unplayed pips added to your total"; Going out —
"adds 0 for that round"; Match — "lowest total after 13 rounds wins".
Rule lines: "You may always play on your own train or the Mexican train." /
"Another player’s train is only playable when its signal turns green
(marked open)." / "Can’t play? Draw one tile; if it’s still no help, your
train opens and your turn passes." / "Playing a double earns you an extra
play right away." / "The engine drops by one double each round, 12 down
to 0."

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` green (771 currently). Screens are
not yet reachable from the App — they must typecheck standalone. Report
files, verbatim final outputs, deviations. Honesty over completeness: if
you run out of budget, say exactly what is unfinished.
