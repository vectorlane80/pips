import type { Card } from '../../card-engine/cards.ts'
import { deadwoodValue } from './rank.ts'

export function deadwood(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + deadwoodValue(card.rank), 0)
}
