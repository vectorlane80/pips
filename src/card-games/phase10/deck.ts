import type { Card } from '../../card-engine/cards.ts'

const COLORS = ['red', 'blue', 'green', 'yellow']

export function createPhase10Deck(): Card[] {
  const cards: Card[] = []
  let id = 0

  // 4 colors × 12 numbers × 2 copies = 96 number cards
  for (const color of COLORS) {
    for (let number = 1; number <= 12; number++) {
      for (let copy = 0; copy < 2; copy++) {
        cards.push({
          id: `p10-${id++}`,
          suit: color,
          rank: String(number),
          deckIndex: 0,
          meta: { kind: 'number' },
        })
      }
    }
  }

  // 4 Skip cards
  for (let i = 0; i < 4; i++) {
    cards.push({
      id: `p10-${id++}`,
      suit: 'special',
      rank: 'SKIP',
      deckIndex: 0,
      meta: { kind: 'skip' },
    })
  }

  // 8 Wild cards
  for (let i = 0; i < 8; i++) {
    cards.push({
      id: `p10-${id++}`,
      suit: 'special',
      rank: 'WILD',
      deckIndex: 0,
      meta: { kind: 'wild' },
    })
  }

  return cards
}
