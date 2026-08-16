export type UnoColor = 'red' | 'yellow' | 'green' | 'blue'
export type UnoCardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4'

export interface UnoCard {
  id: string
  color: UnoColor | 'wild'   // 'wild' for both wild and wild4 cards
  kind: UnoCardKind
  value: number | null       // 0-9 for kind 'number', null otherwise — always present, never omitted
}

// 108 cards, ids `uno-0`..`uno-107` in the spec's exact composition order:
// per color (red, yellow, green, blue): one 0, two of each 1-9, two skip, two reverse,
// two draw2 (25 per color); then four wild, then four wild4. The order is auditable by
// index range, so the ids are sequential and never shuffled here.
export function createUnoDeck(): UnoCard[] {
  const cards: UnoCard[] = []
  let id = 0
  for (const color of ['red', 'yellow', 'green', 'blue'] as UnoColor[]) {
    cards.push({ id: `uno-${id++}`, color, kind: 'number', value: 0 })
    for (let value = 1; value <= 9; value++) {
      // loop value outermost, copy innermost — same-value copies are adjacent
      cards.push({ id: `uno-${id++}`, color, kind: 'number', value })
      cards.push({ id: `uno-${id++}`, color, kind: 'number', value })
    }
    for (let i = 0; i < 2; i++) cards.push({ id: `uno-${id++}`, color, kind: 'skip', value: null })
    for (let i = 0; i < 2; i++) cards.push({ id: `uno-${id++}`, color, kind: 'reverse', value: null })
    for (let i = 0; i < 2; i++) cards.push({ id: `uno-${id++}`, color, kind: 'draw2', value: null })
  }
  for (let i = 0; i < 4; i++) cards.push({ id: `uno-${id++}`, color: 'wild', kind: 'wild', value: null })
  for (let i = 0; i < 4; i++) cards.push({ id: `uno-${id++}`, color: 'wild', kind: 'wild4', value: null })
  return cards
}
