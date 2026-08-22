# Spec 47 — Solitaire rules engine (Klondike + FreeCell)

New single-player card game. This spec is the pure rules layer only — no
React, no screens, no App wiring (those are specs 48/49). Read
`CLAUDE.md` at the repo root first — binding. Read
`src/card-engine/cards.ts`, `src/card-engine/deck.ts`, and
`src/engine/rng.ts` before writing anything; you use exactly those three
modules and nothing else from the engine.

You own EXACTLY these NEW files (create them; nothing else exists yet):

- `src/card-games/solitaire/state.ts`
- `src/card-games/solitaire/shared.ts`
- `src/card-games/solitaire/klondike.ts`
- `src/card-games/solitaire/freecell.ts`
- `src/card-games/solitaire/klondike.test.ts`
- `src/card-games/solitaire/freecell.test.ts`

Do NOT touch any other file. Do NOT run git. No new dependencies.
Everything must be plain functions over plain serializable data — no
classes, no Maps/Sets inside state, `JSON.parse(JSON.stringify(state))`
must deep-equal `state`.

## `state.ts` — types + deal (locked)

```ts
import type { Card } from '../../card-engine/cards.ts'

export type SolitaireMode = 'klondike' | 'freecell'

export interface SolitaireState {
  mode: SolitaireMode
  seed: number
  tableau: Card[][]        // klondike: 7 columns; freecell: 8. index 0 = bottom, last = top
  faceUp: number[]         // per column: how many cards at the TOP (end) of the column are face up.
                           // freecell: always equals tableau[i].length. klondike: ≥1 whenever the
                           // column is non-empty (the rules never leave a face-down top card).
  foundations: Card[][]    // exactly 4, in SUITS order: [clubs, diamonds, hearts, spades]. index 0 = A
  stock: Card[]            // klondike only (freecell: []). last = top
  waste: Card[]            // klondike only (freecell: []). last = top
  cells: (Card | null)[]   // freecell only: exactly 4. klondike: []
  moves: number            // successful DRAW + MOVE count
  won: boolean             // every foundation holds 13
}

export type SolitaireLoc =
  | { kind: 'tableau'; index: number }
  | { kind: 'foundation'; index: number }
  | { kind: 'waste' }
  | { kind: 'cell'; index: number }

export type SolitaireMove =
  | { type: 'DRAW' }                                                  // klondike only
  | { type: 'MOVE'; from: SolitaireLoc; to: SolitaireLoc; count: number }

export type MoveOutcome =
  | { ok: true; state: SolitaireState }
  | { ok: false; reason: string }

export function createSolitaireGame(mode: SolitaireMode, seed: number): SolitaireState
```

Deal (both use `createStandardDeck()` then `shuffleDeck(deck, createRng(seed))`;
"take from the top" below means `shuffled.shift()` order — i.e. index 0 of
the shuffled array is dealt first):

- **Klondike**: 7 columns. For column `i` in 0..6, deal `i + 1` cards in
  order (column 0 gets 1 card, column 6 gets 7). `faceUp[i] = 1`. The
  remaining 24 cards become `stock` in the order dealt, so the LAST
  element (top) is the last card of the shuffled deck. `waste = []`,
  `cells = []`.
- **FreeCell**: 8 columns, round-robin: shuffled card `k` goes to column
  `k % 8` (columns 0–3 end with 7 cards, 4–7 with 6). `faceUp[i] =
  tableau[i].length`. `stock = []`, `waste = []`, `cells = [null, null,
  null, null]`.
- Both: `foundations = [[], [], [], []]`, `moves = 0`, `won = false`.

Same seed ⇒ identical deal (test this).

## `shared.ts` — helpers + the mode-independent move core (locked)

```ts
export function rankIndex(card: Card): number        // RANKS.indexOf(card.rank): A=0 … K=12
export function isRed(card: Card): boolean           // hearts | diamonds
export function foundationIndex(card: Card): number  // SUITS.indexOf(card.suit)
export function isTableauSequence(cards: Card[]): boolean
  // each card (after the first) is exactly one rank LOWER than the one before it and the
  // opposite color. A single card is a sequence. Empty is NOT.
export function canStackOnTableau(moving: Card, onto: Card): boolean
  // moving is one rank lower than onto and opposite color
export function canPlaceOnFoundation(card: Card, foundation: Card[], index: number): boolean
  // foundationIndex(card) === index, and rankIndex(card) === foundation.length
export function topOf(cards: Card[]): Card | undefined
export function applyMove(state: SolitaireState, move: SolitaireMove): MoveOutcome
export function findFoundationMove(state: SolitaireState, from: SolitaireLoc): SolitaireMove | null
  // the single-card MOVE from `from` to its matching foundation if that is legal right now, else null.
  // (UI "click the selected card again to send it home".)
export function legalDestinations(state: SolitaireState, from: SolitaireLoc, count: number): SolitaireLoc[]
  // every `to` for which applyMove(state, {type:'MOVE', from, to, count}).ok — tableau columns,
  // foundations, and (freecell only) empty cells. Order: tableau by index, foundations by index, cells by index.
```

`applyMove` is one function for both modes; the per-mode differences are
small and listed below. It never mutates its input — build a new state
with copied arrays. On any rejection return `{ ok: false, reason }` with a
short human-readable reason (exact strings are not tested; `ok` is).

### DRAW
- `mode !== 'klondike'` → reject.
- `stock.length > 0`: pop the top of `stock`, push it onto `waste`.
- else if `waste.length > 0`: recycle — `stock = [...waste].reverse()`,
  `waste = []` (so the card that was at the bottom of the waste is now
  the top of the stock; unlimited passes).
- else reject ("nothing to draw").
- `moves += 1` on success.

### MOVE — source validation (`from`, `count`)
- `count` must be an integer ≥ 1.
- `waste`: klondike only; `count` must be 1; waste non-empty; the card is
  the top of waste.
- `cell`: freecell only; `index` in 0..3; `count` 1; the cell is non-null.
- `foundation`: `index` 0..3; `count` 1; non-empty; the card is its top.
- `tableau`: `index` in range; column non-empty; `count ≤ faceUp[index]`;
  the moved cards are the top `count` of the column and must satisfy
  `isTableauSequence`.
- `from` and `to` identical (same kind and index) → reject.

### MOVE — destination validation (`to`)
- `waste` → always reject (nothing moves onto the waste).
- `cell`: freecell only; `index` 0..3; `count` must be 1; the cell must be
  null.
- `foundation`: `count` must be 1; `canPlaceOnFoundation(card, foundations[index], index)`.
- `tableau` (empty column): klondike — the BOTTOM card of the moved run
  (the first of the `count` cards) must be a King; freecell — any run.
- `tableau` (non-empty): `canStackOnTableau(bottomOfRun, topOfColumn)`.
- **FreeCell supermove cap** (freecell only, any tableau destination):
  `count ≤ (emptyCells + 1) * 2 ** emptyColumns`, where `emptyCells` is
  the number of null cells and `emptyColumns` is the number of empty
  tableau columns NOT counting the destination column itself (when the
  destination is empty, it is excluded) and not counting the source
  column (it cannot be empty since it has cards). Klondike has no cap.

### MOVE — effects
- Remove the cards from the source; append them (same order) to the
  destination (`cells[index] = card` for a cell).
- Klondike source tableau auto-flip: after removal, if the source column
  still has cards and `faceUp[src]` would be 0 (i.e. `count ===
  faceUp[src]` before the move), set `faceUp[src] = 1`; otherwise
  `faceUp[src] -= count`. If the column is now empty, `faceUp[src] = 0`.
- Destination tableau: `faceUp[dst] += count`. FreeCell: `faceUp` always
  equals the column length after every move (keep that invariant).
- `moves += 1`; `won = foundations.every(f => f.length === 13)`.

## `klondike.ts` / `freecell.ts`
Thin mode modules so spec 48/49 have an obvious import per mode:

```ts
// klondike.ts
export const KLONDIKE_COLUMNS = 7
export function dealKlondike(seed: number): SolitaireState
// freecell.ts
export const FREECELL_COLUMNS = 8
export const FREECELL_CELLS = 4
export function dealFreeCell(seed: number): SolitaireState
export function maxMovableCards(state: SolitaireState, toEmptyColumn: boolean): number  // the supermove cap
```

`createSolitaireGame` in `state.ts` dispatches to these two. Put the deal
logic in the mode files, the types + dispatcher in `state.ts`, and all
validation in `shared.ts` (which imports `maxMovableCards` from
`freecell.ts`). Avoid circular imports: `state.ts` imports from
`klondike.ts`/`freecell.ts`; those import types only from `state.ts` (use
`import type`).

## Required tests (vitest, beside the code)

`klondike.test.ts`:
- deal shape: 7 columns with lengths 1..7, `faceUp` all 1, stock 24,
  foundations 4 empties, 52 unique ids across tableau+stock, same seed ⇒
  deep-equal state, different seed ⇒ different tableau.
- DRAW moves the stock top onto the waste; repeated DRAW through an empty
  stock recycles with the documented order (assert the exact id order
  after one full pass: draw all 24, then DRAW once more ⇒ stock has 24
  and waste is empty, and the new stock top is the card that was drawn
  FIRST); DRAW with empty stock and empty waste is rejected.
- tableau → tableau: accepts red-on-black descending; rejects same color,
  rejects wrong rank, rejects moving more than `faceUp`, rejects a
  non-King run onto an empty column, accepts a King run onto an empty
  column.
- auto-flip: moving the only face-up card off a column with face-down
  cards underneath sets `faceUp` to 1; moving the last card leaves
  `faceUp` 0.
- waste → tableau and waste → foundation; foundation → tableau (moving
  back off is legal); tableau → foundation requires the exact next rank
  of the matching suit (assert an Ace goes up, a 2 of another suit is
  rejected, a 3 on an A is rejected).
- `findFoundationMove` returns the move when legal, null otherwise.
- `legalDestinations` for a known constructed position lists exactly the
  expected targets in the documented order.
- win: build a state with 4 foundations holding A..Q of each suit and a
  tableau holding the four Kings face up; moving the last King sets
  `won`; before that `won` is false.
- `moves` increments on success only; a rejected move returns the same
  `moves`.
- JSON round-trip: `JSON.parse(JSON.stringify(dealt))` deep-equals `dealt`.
- rejects `DRAW`-irrelevant things: `{kind:'cell'}` source/dest in
  klondike; `to: waste`; `from === to`.

`freecell.test.ts`:
- deal shape: 8 columns, lengths 7,7,7,7,6,6,6,6, `faceUp` equals
  lengths, stock/waste empty, 4 null cells, 52 unique ids, same-seed
  determinism.
- DRAW rejected in freecell.
- cell moves: tableau → empty cell accepted, → occupied cell rejected,
  count 2 → cell rejected; cell → tableau accepted when stackable; cell
  → foundation accepted for an Ace.
- any single card onto an empty column is accepted (not just Kings).
- supermove cap: with 0 empty cells and 0 empty columns, a 2-card run
  onto a non-empty column is rejected; with 1 empty cell it is accepted;
  with 1 empty cell and 1 OTHER empty column a 4-card run is accepted
  and a 5-card run rejected; moving a 3-card run onto an empty column
  with 1 empty cell and no other empty columns is rejected (cap 2 — the
  destination doesn't count), a 2-card run accepted. Also assert
  `maxMovableCards` directly for those positions.
- `faceUp[i] === tableau[i].length` for every column after a sequence of
  moves.
- win detection via the same build-up-to-Kings construction.

For constructed positions, write a small local helper in each test file
that builds a `SolitaireState` from short card specs (e.g. `'K♠'`,
`'10♥'`) — ids must be the real `createStandardDeck()` ids for those
cards (look them up from the deck by suit+rank) so nothing in the engine
has to special-case test ids.

## Verify before reporting
Run: `npx tsc -b --noEmit` (must print nothing), `npm test` (all green —
report the exact "Tests N passed" line; baseline before your work is
1087), `npm run build` (must end in "✓ built").

## Required skills
Apply writing-lean-code (no abstractions, defensive code, or cleanup
beyond this spec) and verification-before-completion (run the
verification commands and report their real output).

## If stuck
After 3 failed attempts at any part, stop and report honestly what works,
what doesn't, and what you tried. A truthful partial report is a success;
a false "all green" is the worst possible outcome.

## Report format
- Files created (list)
- `npm test` verbatim final "Tests …" line, tsc output (or "silent"),
  build's final line
- Anything you noticed that the spec didn't cover
