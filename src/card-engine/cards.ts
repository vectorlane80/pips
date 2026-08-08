export type Suit = string
export type Rank = string

export interface Card {
  id: string
  suit: Suit
  rank: Rank
  deckIndex: number
  meta?: Record<string, unknown>
}

export const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']

export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export function cardsEqual(a: Card, b: Card): boolean {
  return a.id === b.id
}

export function findCard(cards: Card[], id: string): Card | undefined {
  return cards.find((c) => c.id === id)
}

export function removeCard(cards: Card[], id: string): { card: Card | undefined; remaining: Card[] } {
  const index = cards.findIndex((c) => c.id === id)
  if (index === -1) {
    return { card: undefined, remaining: [...cards] }
  }
  const remaining = [...cards.slice(0, index), ...cards.slice(index + 1)]
  return { card: cards[index], remaining }
}
