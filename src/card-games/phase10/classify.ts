import type { Card } from '../../card-engine/cards.ts'
import type { PhaseRequirement } from './phases.ts'

export type GroupType = 'set' | 'run' | 'color'

export interface PhaseGroup {
  type: GroupType
  cards: Card[]
}

// True iff at least 2 cards, at least one natural (kind === 'number'), and every
// natural shares the same rank. Wilds impose no constraint (they always fit);
// a group made entirely of wilds is NOT valid.
export function isValidSet(cards: Card[]): boolean {
  const naturals = cards.filter((c) => c.meta?.kind === 'number')
  const wildCount = cards.filter((c) => c.meta?.kind === 'wild').length
  if (naturals.length + wildCount !== cards.length) return false
  if (cards.length < 2) return false
  if (naturals.length === 0) return false
  const firstRank = naturals[0].rank
  return naturals.every((c) => c.rank === firstRank)
}

// True iff a contiguous run of consecutive integers in [1,12] (no wraparound)
// can be formed using every card, with wilds filling any gaps or extending
// either end.
export function isValidRun(cards: Card[]): boolean {
  const naturals = cards.filter((c) => c.meta?.kind === 'number')
  const wildCount = cards.filter((c) => c.meta?.kind === 'wild').length
  if (naturals.length + wildCount !== cards.length) return false

  // A run can't repeat a number.
  const seen = new Set<string>()
  for (const c of naturals) {
    if (seen.has(c.rank)) return false
    seen.add(c.rank)
  }

  // All-wild: any run of that length fits inside 1..12 for Phase 10's max run of 9.
  if (naturals.length === 0) {
    return cards.length >= 1 && cards.length <= 12
  }

  const numbers = naturals.map((c) => Number(c.rank))
  const minNum = Math.min(...numbers)
  const maxNum = Math.max(...numbers)

  const span = maxNum - minNum + 1
  if (span > cards.length) return false

  const gapsToFill = span - naturals.length
  if (gapsToFill > wildCount) return false

  const extraWilds = wildCount - gapsToFill
  const roomBefore = minNum - 1
  const roomAfter = 12 - maxNum
  return extraWilds <= roomBefore + roomAfter
}

// True iff at least 1 card, at least one natural, and every natural shares the
// same suit (color). Wilds fit any color.
export function isValidColorGroup(cards: Card[]): boolean {
  const naturals = cards.filter((c) => c.meta?.kind === 'number')
  const wildCount = cards.filter((c) => c.meta?.kind === 'wild').length
  if (naturals.length + wildCount !== cards.length) return false
  if (cards.length < 1) return false
  if (naturals.length === 0) return false
  const firstSuit = naturals[0].suit
  return naturals.every((c) => c.suit === firstSuit)
}

// Exact-count wrapper: the group must have exactly `exactCount` cards AND pass
// the matching isValid* predicate.
export function classifyGroup(cards: Card[], type: GroupType, exactCount: number): boolean {
  if (cards.length !== exactCount) return false
  switch (type) {
    case 'set':
      return isValidSet(cards)
    case 'run':
      return isValidRun(cards)
    case 'color':
      return isValidColorGroup(cards)
  }
}

export function classifyPhaseHand(
  cards: Card[],
  requirement: PhaseRequirement,
): { valid: boolean; groups?: PhaseGroup[] } {
  const total = requirement.parts.reduce((sum, p) => sum + p.count, 0)
  if (cards.length !== total) {
    return { valid: false }
  }

  if (requirement.parts.length === 1) {
    const part = requirement.parts[0]
    if (classifyGroup(cards, part.type, part.count)) {
      return { valid: true, groups: [{ type: part.type, cards }] }
    }
    return { valid: false }
  }

  // Two parts: try every size-`count` subset of `cards` as group0; group1 is the
  // remaining cards. Hand-relevant sizes are ~8-9 cards, so brute force is fine.
  const part0 = requirement.parts[0]
  const part1 = requirement.parts[1]
  for (const group0 of combinations(cards, part0.count)) {
    const group0Ids = new Set(group0.map((c) => c.id))
    const group1 = cards.filter((c) => !group0Ids.has(c.id))
    if (classifyGroup(group0, part0.type, part0.count) && classifyGroup(group1, part1.type, part1.count)) {
      return {
        valid: true,
        groups: [
          { type: part0.type, cards: group0 },
          { type: part1.type, cards: group1 },
        ],
      }
    }
  }
  return { valid: false }
}

function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  const indices: number[] = []
  function build(start: number): void {
    if (indices.length === size) {
      result.push(indices.map((i) => items[i]))
      return
    }
    const remaining = size - indices.length
    for (let i = start; i <= items.length - remaining; i++) {
      indices.push(i)
      build(i + 1)
      indices.pop()
    }
  }
  build(0)
  return result
}
