import type { Card } from './cards.ts'

export type ZoneVisibility = 'private' | 'public'

export interface Zone<T extends { id: string } = Card> {
  id: string
  ownerId: string | null
  visibility: ZoneVisibility
  cards: T[]
}

export function createHand<T extends { id: string } = Card>(playerId: string): Zone<T> {
  return { id: `hand:${playerId}`, ownerId: playerId, visibility: 'private', cards: [] }
}

export function createDiscardPile<T extends { id: string } = Card>(id = 'discard'): Zone<T> {
  return { id, ownerId: null, visibility: 'public', cards: [] }
}

export function createPlayerZone<T extends { id: string } = Card>(
  playerId: string,
  zoneName: string,
  visibility: ZoneVisibility,
): Zone<T> {
  return { id: `${zoneName}:${playerId}`, ownerId: playerId, visibility, cards: [] }
}

export function createPublicZone<T extends { id: string } = Card>(
  zoneName: string,
  visibility: ZoneVisibility = 'public',
): Zone<T> {
  return { id: zoneName, ownerId: null, visibility, cards: [] }
}

export function addCards<T extends { id: string } = Card>(zone: Zone<T>, cards: T[]): Zone<T> {
  return { ...zone, cards: [...zone.cards, ...cards] }
}

export function removeCardsById<T extends { id: string } = Card>(
  zone: Zone<T>,
  cardIds: string[],
): { zone: Zone<T>; removed: T[] } {
  const uniqueIds = [...new Set(cardIds)]
  const idSet = new Set(uniqueIds)
  const removed: T[] = []
  const kept: T[] = []
  for (const card of zone.cards) {
    if (idSet.has(card.id)) {
      removed.push(card)
    } else {
      kept.push(card)
    }
  }
  const removedOrdered = uniqueIds
    .map((id) => removed.find((c) => c.id === id))
    .filter((c): c is T => c !== undefined)
  return { zone: { ...zone, cards: kept }, removed: removedOrdered }
}

export function moveCards<T extends { id: string } = Card>(
  from: Zone<T>,
  to: Zone<T>,
  cardIds: string[],
): { from: Zone<T>; to: Zone<T>; moved: T[] } {
  const { zone: newFrom, removed } = removeCardsById(from, cardIds)
  const newTo = addCards(to, removed)
  return { from: newFrom, to: newTo, moved: removed }
}

export function topCard<T extends { id: string } = Card>(zone: Zone<T>): T | undefined {
  return zone.cards[zone.cards.length - 1]
}

export function cardCount<T extends { id: string } = Card>(zone: Zone<T>): number {
  return zone.cards.length
}

export function setZoneVisibility<T extends { id: string } = Card>(
  zone: Zone<T>,
  visibility: ZoneVisibility,
): Zone<T> {
  return { ...zone, visibility, cards: [...zone.cards] }
}

export function recyclePile<T extends { id: string } = Card>(
  source: Zone<T>,
  dest: Zone<T>,
  options?: { keepTop?: number; shuffle?: (cards: T[]) => T[] },
): { source: Zone<T>; dest: Zone<T> } {
  const keepTop = options?.keepTop ?? 0
  const effectiveKeep = keepTop <= 0 ? 0 : keepTop
  if (effectiveKeep >= source.cards.length) {
    return { source, dest }
  }
  const splitIndex = source.cards.length - effectiveKeep
  const toKeep = source.cards.slice(splitIndex)
  const toMove = source.cards.slice(0, splitIndex)
  const movedCards = options?.shuffle ? options.shuffle(toMove) : toMove
  return {
    source: { ...source, cards: toKeep },
    dest: addCards(dest, movedCards),
  }
}
