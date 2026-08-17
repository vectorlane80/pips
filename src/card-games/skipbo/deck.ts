import type { Card } from '../../card-engine/cards.ts'

export function createSkipBoDeck(): Card[] {
  const cards: Card[] = []
  let id = 0

  // 12 ranks × 12 copies = 144 number cards
  for (let rank = 1; rank <= 12; rank++) {
    for (let copy = 0; copy < 12; copy++) {
      cards.push({
        id: `sb-${id++}`,
        suit: 'number',
        rank: String(rank),
        deckIndex: 0,
        meta: { kind: 'number' },
      })
    }
  }

  // 18 Skip-Bo wild cards
  for (let i = 0; i < 18; i++) {
    cards.push({
      id: `sb-${id++}`,
      suit: 'special',
      rank: 'WILD',
      deckIndex: 0,
      meta: { kind: 'wild' },
    })
  }

  return cards
}
