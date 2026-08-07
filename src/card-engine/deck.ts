import type { Card } from './cards.ts'
import { RANKS, SUITS } from './cards.ts'

export interface CreateDeckOptions {
  numberOfDecks?: number
  includeJokers?: boolean
}

export function createStandardDeck(options?: CreateDeckOptions): Card[] {
  const numberOfDecks = options?.numberOfDecks != null && options.numberOfDecks >= 1 ? options.numberOfDecks : 1
  const includeJokers = options?.includeJokers ?? false

  const cards: Card[] = []
  let counter = 0

  for (let deckIndex = 0; deckIndex < numberOfDecks; deckIndex++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `c${counter}`, suit, rank, deckIndex })
        counter++
      }
    }
    if (includeJokers) {
      for (let j = 0; j < 2; j++) {
        cards.push({ id: `c${counter}`, suit: 'joker', rank: 'JOKER', deckIndex })
        counter++
      }
    }
  }

  return cards
}

export function shuffleDeck(cards: Card[], randomFn: () => number): Card[] {
  const result = [...cards]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1))
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }
  return result
}

export function dealCards(cards: Card[], count: number): { dealt: Card[]; remaining: Card[] } {
  if (count <= 0) {
    return { dealt: [], remaining: [...cards] }
  }
  const take = Math.min(count, cards.length)
  const dealt = cards.slice(0, take)
  const remaining = cards.slice(take)
  return { dealt, remaining }
}

export function drawCard(cards: Card[]): { card: Card | undefined; remaining: Card[] } {
  const { dealt, remaining } = dealCards(cards, 1)
  return { card: dealt[0], remaining }
}
