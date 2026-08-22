// Card-back designs, from "Design Handoff/Card Back Designs.dc.html". Each id maps to a
// `card-back--d-<id>` rule block in PlayingCard.css; 'classic' is the base CardBack look.
// The chosen id travels over the wire in game state, so it's a plain string.

export interface CardBackDef {
  id: string
  name: string
}

export const DEFAULT_CARD_BACK = 'classic'

export const CARD_BACKS: CardBackDef[] = [
  { id: 'classic', name: 'Classic' },
  { id: 'dice-five', name: 'Dice Five' },
  { id: 'pip-diamond', name: 'Pip Diamond' },
  { id: 'diamond-lattice', name: 'Diamond Lattice' },
  { id: 'center-dot', name: 'Center Dot' },
  { id: 'scallop-dash', name: 'Scallop Dash' },
  { id: 'chevron-stripe', name: 'Chevron Stripe' },
  { id: 'orbit-rings', name: 'Orbit Rings' },
  { id: 'two-tone', name: 'Two-Tone Split' },
  { id: 'starburst', name: 'Starburst Badge' },
  { id: 'windowpane', name: 'Windowpane' },
  { id: 'suit-medallion', name: 'Suit Medallion' },
  { id: 'pinstripe', name: 'Pinstripe' },
  { id: 'checker-weave', name: 'Checker Weave' },
  { id: 'arch-rows', name: 'Arch Rows' },
]
