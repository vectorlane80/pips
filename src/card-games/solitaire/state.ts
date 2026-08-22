import type { Card } from '../../card-engine/cards.ts'
import { dealKlondike } from './klondike.ts'
import { dealFreeCell } from './freecell.ts'

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

export function createSolitaireGame(mode: SolitaireMode, seed: number): SolitaireState {
  if (mode === 'klondike') {
    return dealKlondike(seed)
  } else {
    return dealFreeCell(seed)
  }
}
