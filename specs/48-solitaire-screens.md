# Spec 48 — Solitaire screens (lobby, table, results, rules)

Builds on spec 47 (landed — `src/card-games/solitaire/`). Presentational
only: every screen takes state + callbacks as props. App wiring is spec 49.
Read `CLAUDE.md` at the repo root first — binding, especially "new games
must pattern-match existing games". The siblings you are matching, read
IN FULL before writing anything: `src/screens/RummyRoom.tsx`,
`src/screens/RummyTable.tsx` + `RummyTable.css`, `src/screens/RummyResults.tsx`,
`src/screens/RummyRulesOverlay.tsx`, `src/components/PlayingCard.tsx` +
`PlayingCard.css`, `src/components/TableHeader.tsx`, `src/components/DealIntro.tsx`
(props + the `others` seat shape), `src/hooks/useSound.ts`. Also read
`src/card-games/solitaire/state.ts` and `shared.ts` for the engine API
you render against (`SolitaireState`, `SolitaireLoc`, `SolitaireMove`,
`applyMove`, `findFoundationMove`, `legalDestinations`).

You own EXACTLY these files:

NEW
- `src/components/CardBackPicker.tsx`
- `src/components/CardBackPicker.css`
- `src/screens/SolitaireRoom.tsx`
- `src/screens/SolitaireTable.tsx`
- `src/screens/SolitaireTable.css`
- `src/screens/SolitaireResults.tsx`
- `src/screens/SolitaireRulesOverlay.tsx`

EDIT (only the changes named below)
- `src/screens/RummyRoom.tsx` — swap its inline picker for `CardBackPicker`
- `src/screens/RummyRoom.css` — DELETE this file (its rules move to
  `CardBackPicker.css`)
- `src/components/PlayingCard.tsx` + `PlayingCard.css` — add the `'pile'`
  CardBack size and the discard-size selected style (below). Nothing else.

Do NOT touch `App.tsx`, `Landing.tsx`, `route.ts`, the engine, or any other
screen. Do NOT run git. No new dependencies.

## Shared look (locked)

- Game color: `#4d7c0f` (olive). Used for `TableHeader gameColor`, the
  rules-overlay title, the results headline, and the lobby's game chip.
  Export it as `SOLITAIRE_COLOR` from `SolitaireTable.tsx`.
- Mode labels: `{ klondike: 'Klondike', freecell: 'FreeCell' }` — export
  `SOLITAIRE_MODE_LABELS: Record<SolitaireMode, string>` from
  `SolitaireRoom.tsx` and import it elsewhere.

## `CardBackPicker` (extracted from RummyRoom, behavior identical)

```tsx
export function CardBackPicker({ cardBack, onSelect, hostName }: {
  cardBack: string
  onSelect?: (id: string) => void   // absent ⇒ read-only (guest) view: preview + name text
  hostName?: string                  // read-only view's "· {hostName} picks" suffix; omit for no suffix
})
```
Renders exactly what RummyRoom renders today for the "Card back" block —
the `<div style={{ marginTop: 26 }}>` wrapper, the label row, the
`<CardBack size="stock" design=…/>` preview, and the `.input` select (or
the name `<span>` when `onSelect` is absent). Move the three CSS rules
from `RummyRoom.css` into `CardBackPicker.css` renamed
`.card-back-picker`, `.card-back-picker .card-back--stock`,
`.card-back-select`; import the css from the component. RummyRoom then
becomes `<CardBackPicker cardBack={cardBack} onSelect={isHost ?
onSelectCardBack : undefined} hostName={hostName} />` and drops its
`CardBack`/`CARD_BACKS`/`./RummyRoom.css` imports if nothing else uses
them. Rummy's lobby must look pixel-identical afterwards.

## `PlayingCard.tsx` / `.css` additions

- `CardBackSize` gains `'pile'`: 50 × 70, border-radius 10px, border
  3px ink, `--cb: 0.37`, no box-shadow (it stacks inside tableau
  columns). Same aria-label as fan ("Face-down card").
  `DealIntroCardBackProps` stays fan|stock — do not touch DealIntro.
- Selected style for the discard size, mirroring the hand rule without
  the lift:
  ```css
  .playing-card--discard.playing-card--selected {
    border-color: var(--yellow);
    box-shadow: 0 4px 0 var(--_selected-shadow);
  }
  ```

## `SolitaireRoom.tsx`

```ts
export interface SolitaireRoomProps {
  localName: string
  cardBack: string
  onSelectCardBack: (id: string) => void
  mode: SolitaireMode
  onSelectMode: (mode: SolitaireMode) => void
  onStart: () => void
  onLeave: () => void
}
```
Mirror `RummyRoom`'s page shell exactly (same outer `div` padding,
`header-row` with `Wordmark small`, Rules + Leave buttons, the two-column
flex layout, the right column's green game chip → olive here reading
"Solitaire", "At the table" heading). Differences, all deliberate:
- The yellow code card becomes a yellow panel with the small label
  "Just you" and the big text "1 player" (same font sizes as the code
  card). No "Copy invite link" button, no "Open seat" rows, no bots.
- Below the panel, in order: `<CardBackPicker cardBack onSelect={onSelectCardBack} />`,
  then a "Game mode" block in the same style as the picker's label
  (`marginTop: 22`, bold 15px label, 10px gap) containing an `.input`
  `<select>` (reuse `card-back-select` class for the chevron styling —
  it's a generic select style) with the two modes, and under it a 14px
  muted one-liner that changes with the mode:
  - Klondike: "Seven columns, draw one at a time from the stock, unlimited passes."
  - FreeCell: "Eight columns, every card face up, four free cells to park cards in."
- Then the `Start game` button (`btn btn-coral btn-lg`, full width like
  Rummy's host buttons, never disabled).
- Right column: one seat row in Rummy's seated-tile style (avatar with
  the name's initial on the olive brand color, name + " (you)", a chip
  reading "1 player" in olive). Footer line: "Solitaire is just you and
  the deck — no code to share."
- Rules button opens `SolitaireRulesOverlay` with the current `mode`.

## `SolitaireTable.tsx` + `.css` (classes prefixed `sol-`)

```ts
export interface SolitaireTableProps {
  localName: string
  state: SolitaireState
  cardBack: string
  dealId: number          // increments on every fresh deal; drives the deal intro
  canUndo: boolean
  onMove: (move: SolitaireMove) => void   // the caller applies it (already known legal — see below)
  onUndo: () => void
  onDealAgain: () => void
  onLeave: () => void
}
```

Page shell: `.sol-table` outer (same max-width/padding as `.rummy-table`),
`<TableHeader gameLabel="Solitaire" gameColor={SOLITAIRE_COLOR}
meta={`1 player · ${SOLITAIRE_MODE_LABELS[state.mode]}`} …/>` wired to
this screen's single `useSound()` instance, then a `.sol-subheader` row:
left — yellow chip "Solitaire · Klondike" (mode label) and a white pill
"moves {state.moves}" (copy `.rummy-score-pill`'s look); right — two
`btn pill-small` buttons: "Undo" (`disabled={!canUndo}`) and "Deal again".
Then the `.sol-table-card` shell (copy `.rummy-table-card`). Inside, in
order:

1. **Deal intro.** `DealIntro` with `others={[]}`,
   `yourHandSize={state.tableau.length}` (one flight per column — the
   intro's "You · n" pile is the columns being dealt),
   `renderCardBack={(p) => <CardBack {...p} design={cardBack} />}`.
   Shown on mount and again whenever `dealId` changes — copy Rummy's
   `introShownForRoundRef` pattern keyed on `dealId`. While it shows,
   nothing else in the shell renders (same as Rummy).

2. **Top row** `.sol-top`: flex, space-between, wrap.
   - Klondike left group: the stock, then the waste. Stock is
     `<CardBack size="stock" design={cardBack} canDraw={stockClickable}
     empty={state.stock.length === 0} onClick=…/>` with caption
     "stock {n}" above (copy `.rummy-stock-caption`). Clicking it
     dispatches `{ type: 'DRAW' }` when `applyMove` says it's legal
     (non-empty stock, OR empty stock with a non-empty waste = recycle);
     `canDraw` is true exactly then. Waste: caption "waste {n}"; shows
     the top waste card as `<PlayingCard size="discard" …/>` (selectable,
     see interaction) or the text "empty" in `.rummy-discard-empty`
     style when the waste is empty.
   - FreeCell left group: four cells, each an empty slot (`.sol-slot`,
     50 × 70, dashed 3px `var(--grey-border)` border, radius 10) or the
     held card as `<PlayingCard size="discard"/>`. Caption "free cells".
   - Right group (both modes): caption "foundations"; four slots in
     SUITS order. Empty slot shows the suit glyph centered (use
     `suitGlyph`/`suitColor` from PlayingCard, 22px, 45% opacity);
     otherwise the top card as `<PlayingCard size="discard"/>`.

3. **Status line** `.sol-status` (copy `.rummy-status` look, right-aligned
   under the top row):
   - no selection: "Select a card, then click where it goes."
   - selection of 1 that `findFoundationMove` can send home: "Click it
     again to send it to its foundation."
   - selection otherwise: "Click a column, foundation{, or free cell} to move {n} card(s)."
   - `state.won`: "You won in {moves} moves!" (the results screen takes
     over; this is just the last frame).

4. **Tableau** `.sol-tableau`: a flex row of `.sol-column`s (gap
   `clamp(6px, 1.2vw, 14px)`, `overflow-x: auto` on the row so narrow
   viewports scroll instead of squashing). Each column is a
   `position: relative` stack 50px wide whose cards are absolutely
   positioned: card `k` (0 = bottom) sits at `top: offset(k)` where
   face-down cards advance 10px each and face-up cards 24px each
   (compute cumulatively so a mixed column stacks correctly); the
   column's height is the last card's top + 70 (min 70). Face-down cards
   render `<CardBack size="pile" design={cardBack}/>`; face-up cards
   `<PlayingCard size="discard" selected=… onClick=…/>`. An empty column
   renders one `.sol-slot` (clickable as a destination).
   - Legal-destination highlight: when a selection exists, every
     destination in `legalDestinations(state, from, count)` gets
     `sol-target` on its slot/column/top card — a 3px `var(--yellow)`
     outline with 2px offset. Cheap and matches Rummy's
     `.rummy-meld-cluster--layoff` "highlighted group" convention.

### Interaction (select-then-confirm, locked)

Local state: `selection: { from: SolitaireLoc; count: number } | null`.
Only the current `state` is ever read; never cache cards.

- Clicking a **face-up tableau card** at column `c`, index `k`:
  - if no selection: select `{ from: tableau c, count: tableau[c].length - k }`.
  - if a selection exists and the clicked card is the column's TOP card
    and it's a different location: try `MOVE` to `tableau c` with the
    selection's count. Legal → `onMove`, clear selection. Illegal →
    select the clicked card instead (as if there were no selection).
  - if a selection exists and the clicked card is NOT the top card:
    select the clicked run instead.
  - clicking the selected run's own bottom card (the `from` card) again:
    if `findFoundationMove` returns a move → `onMove`, clear; else clear.
- Clicking the **waste top card** / a **cell card** / a **foundation top
  card**: same as above with `count: 1` (re-click sends home via
  `findFoundationMove` where it applies; a foundation card re-click just
  clears).
- Clicking an **empty column / empty cell / foundation slot (empty or
  not)** with a selection: try the move there; legal → `onMove`, clear;
  illegal → `play('error')`, keep the selection. Without a selection:
  nothing.
- Face-down cards and the stock never select. Stock click = DRAW (above).
- Any change to `state` (new object) clears a selection whose `from`
  location no longer holds that many cards — implement as an effect that
  revalidates the selection with `applyMove`-free bounds checks
  (tableau: `count ≤ faceUp[index]`; waste/cell/foundation: non-empty),
  clearing it when invalid. Undo and Deal again therefore never leave a
  dangling selection.

### Sounds (this screen's single `useSound()`; TableHeader shares it)

Diff the previous `state` against the new one in an effect (Rummy's
`soundSigRef` pattern):
- `stock.length` decreased → `card-draw`
- `stock.length` increased (recycle) → `shuffle`
- otherwise `moves` increased → `card-play`
- `moves` decreased (undo) → `card-draw`
- illegal destination click → `error` (at click time, see above)
- no sound on win here — `SolitaireResults` plays `game-win`.

### Rules overlay
"Rules" in the header opens `SolitaireRulesOverlay` with `state.mode`.

## `SolitaireResults.tsx`

```ts
export interface SolitaireResultsProps {
  mode: SolitaireMode
  moves: number
  onDealAgain: () => void
  onBackToShelf: () => void
}
```
Mirror `RummyResults`: same page container, `game-win` on mount, a
yellow chip "Solitaire · {mode label}", the big headline "You win!" in
`SOLITAIRE_COLOR`, one row in the ranked-row style (rank "1", olive dot,
name "Solved", right-side big number `{moves}` with the small label
"moves"), then "Deal again" (`btn btn-coral btn-lg`) and "Back to the
shelf" (`btn btn-lg`).

## `SolitaireRulesOverlay.tsx`

`({ mode, onClose })`. Same markup as `RummyRulesOverlay` (backdrop,
panel, header with title + Close). Title "Klondike rules" / "FreeCell
rules" in `SOLITAIRE_COLOR`. Intro line + bullets:

Klondike — intro "Build the four foundations from Ace to King, one suit each."
- "Deal: seven columns, one to seven cards, only the top card face up. The rest is the stock."
- "Tableau: stack cards in descending order, alternating red and black. Move any face-up run as a unit."
- "Only a King (or a run starting with one) can move into an empty column."
- "Stock: click to turn one card onto the waste. When the stock runs out, click it again to flip the waste back over — as many passes as you like."
- "Foundations: Ace first, then 2 through King, one suit per pile. Click a selected card again to send it home. Cards can come back off a foundation if you need them."
- "Undo is unlimited. Deal again starts a fresh shuffle."

FreeCell — intro "Every card is face up from the start — FreeCell is a game of pure planning."
- "Deal: eight columns, all face up. Four free cells on the left hold one card each."
- "Tableau: descending order, alternating colors. Any card or run can move into an empty column."
- "Moving a run at once is a shortcut for moving it card by card through the free cells — so you can move at most (empty cells + 1) × 2^(empty columns) cards, and an empty column you're moving INTO doesn't count."
- "Foundations: Ace first, then 2 through King, one suit per pile. Click a selected card again to send it home."
- "Undo is unlimited. Deal again starts a fresh shuffle."

## Required tests
None new for the screens themselves (the project has no component test
harness for tables). The existing suite must stay green — in particular
nothing in `src/card-games/solitaire/*.test.ts` or Rummy may change.

## Verify before reporting
Run: `npx tsc -b --noEmit` (silent), `npm test` (same count as before
you started, 0 failed — report the exact line), `npm run build` ("✓ built").
Then confirm `src/screens/RummyRoom.css` no longer exists and nothing
imports it (`grep -rn "RummyRoom.css" src` prints nothing).

## Required skills
Apply writing-lean-code and verification-before-completion.

## If stuck
After 3 failed attempts at any part, stop and report honestly what works,
what doesn't, and what you tried.

## Report format
- Files created / edited / deleted
- Verbatim final `npm test` line, tsc output (or "silent"), build's final line
- Every place you deviated from a sibling convention and why
- Anything the spec didn't cover
