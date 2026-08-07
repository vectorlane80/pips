import type { Card } from './cards.ts'

export type ZoneVisibility = 'private' | 'public'

export interface Zone {
  id: string
  ownerId: string | null
  visibility: ZoneVisibility
  cards: Card[]
}

export function createHand(playerId: string): Zone {
  return { id: `hand:${playerId}`, ownerId: playerId, visibility: 'private', cards: [] }
}

export function createDiscardPile(id = 'discard'): Zone {
  return { id, ownerId: null, visibility: 'public', cards: [] }
}

export function createPlayerZone(playerId: string, zoneName: string, visibility: ZoneVisibility): Zone {
  return { id: `${zoneName}:${playerId}`, ownerId: playerId, visibility, cards: [] }
}

export function createPublicZone(zoneName: string, visibility: ZoneVisibility = 'public'): Zone {
  return { id: zoneName, ownerId: null, visibility, cards: [] }
}

export function addCards(zone: Zone, cards: Card[]): Zone {
  return { ...zone, cards: [...zone.cards, ...cards] }
}

export function removeCardsById(zone: Zone, cardIds: string[]): { zone: Zone; removed: Card[] } {
  const uniqueIds = [...new Set(cardIds)]
  const idSet = new Set(uniqueIds)
  const removed: Card[] = []
  const kept: Card[] = []
  for (const card of zone.cards) {
    if (idSet.has(card.id)) {
      removed.push(card)
    } else {
      kept.push(card)
    }
  }
  const removedOrdered = uniqueIds
    .map((id) => removed.find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined)
  return { zone: { ...zone, cards: kept }, removed: removedOrdered }
}

export function moveCards(from: Zone, to: Zone, cardIds: string[]): { from: Zone; to: Zone; moved: Card[] } {
  const { zone: newFrom, removed } = removeCardsById(from, cardIds)
  const newTo = addCards(to, removed)
  return { from: newFrom, to: newTo, moved: removed }
}

export function topCard(zone: Zone): Card | undefined {
  return zone.cards[zone.cards.length - 1]
}

export function cardCount(zone: Zone): number {
  return zone.cards.length
}

export function setZoneVisibility(zone: Zone, visibility: ZoneVisibility): Zone {
  return { ...zone, visibility, cards: [...zone.cards] }
}

export function recyclePile(
  source: Zone,
  dest: Zone,
  options?: { keepTop?: number; shuffle?: (cards: Card[]) => Card[] },
): { source: Zone; dest: Zone } {
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
