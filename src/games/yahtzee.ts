import type { BotDifficulty, Die, YCategory } from '../types'
import { rollDie } from './farkle'

export const Y_CATEGORIES: YCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance',
]

export const Y_LABEL: Record<YCategory, string> = {
  ones: 'Ones', twos: 'Twos', threes: 'Threes', fours: 'Fours', fives: 'Fives', sixes: 'Sixes',
  threeKind: 'Three of a kind', fourKind: 'Four of a kind', fullHouse: 'Full house',
  smallStraight: 'Small straight', largeStraight: 'Large straight', yahtzee: 'Yahtzee', chance: 'Chance',
}

export const Y_SUBLABEL: Record<YCategory, string> = {
  ones: 'Sum of 1s', twos: 'Sum of 2s', threes: 'Sum of 3s', fours: 'Sum of 4s', fives: 'Sum of 5s', sixes: 'Sum of 6s',
  threeKind: 'Sum of all five', fourKind: 'Sum of all five', fullHouse: 'Flat 25',
  smallStraight: 'Flat 30', largeStraight: 'Flat 40', yahtzee: 'Flat 50', chance: 'Sum of all five',
}

function countByFace(vals: number[]): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const v of vals) counts[v] = (counts[v] || 0) + 1
  return counts
}

const UPPER_FACE: Partial<Record<YCategory, number>> = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 }

export function scoreCategory(vals: number[], cat: YCategory): number {
  const sum = vals.reduce((a, b) => a + b, 0)
  const counts = countByFace(vals)
  const groups = Object.values(counts)
  if (cat in UPPER_FACE) {
    const face = UPPER_FACE[cat]!
    return (counts[face] || 0) * face
  }
  switch (cat) {
    case 'threeKind':
      return groups.some((c) => c >= 3) ? sum : 0
    case 'fourKind':
      return groups.some((c) => c >= 4) ? sum : 0
    case 'fullHouse':
      return groups.length === 2 && groups.includes(3) && groups.includes(2) ? 25 : 0
    case 'smallStraight': {
      const set = new Set(vals)
      const runs = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]]
      return runs.some((run) => run.every((n) => set.has(n))) ? 30 : 0
    }
    case 'largeStraight': {
      const set = new Set(vals)
      const runs = [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]]
      return runs.some((run) => run.every((n) => set.has(n))) ? 40 : 0
    }
    case 'yahtzee':
      return groups.some((c) => c === 5) ? 50 : 0
    case 'chance':
      return sum
    default:
      return 0
  }
}

export function upperTotal(card: Partial<Record<YCategory, number>>): number {
  return (['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'] as YCategory[])
    .reduce((sum, c) => sum + (card[c] ?? 0), 0)
}

export function grandTotal(card: Partial<Record<YCategory, number>>): number {
  const base = Y_CATEGORIES.reduce((sum, c) => sum + (card[c] ?? 0), 0)
  return base + (upperTotal(card) >= 63 ? 35 : 0)
}

export function rollDice(count: number, startId = 0) {
  return Array.from({ length: count }, (_, i) => rollDie(startId + i))
}

const BURN_ORDER: YCategory[] = [
  'ones', 'yahtzee', 'largeStraight', 'smallStraight', 'fullHouse', 'fourKind',
  'twos', 'threes', 'fours', 'fives', 'sixes', 'threeKind', 'chance',
]

export function decideYahtzeeHold(
  dice: Die[],
  card: Partial<Record<YCategory, number>> = {},
  difficulty: BotDifficulty = 'medium',
): Set<number> {
  const vals = dice.map((d) => d.val)
  const counts = countByFace(vals)
  const entries = Object.entries(counts).map(([face, count]) => ({ face: Number(face), count }))
  const distinct = entries.length

  // Four distinct faces on five dice: one reroll away from a straight.
  if (distinct === 4) {
    const bothStraightsFilled = card.smallStraight !== undefined && card.largeStraight !== undefined
    if (difficulty !== 'hard' || !bothStraightsFilled) {
      const hold = new Set<number>()
      const seen = new Set<number>()
      dice.forEach((d) => {
        if (!seen.has(d.val)) {
          hold.add(d.id)
          seen.add(d.val)
        }
      })
      return hold
    }
  }

  // Two pairs (or a pair + triple) on the board: hold both, chase the full house.
  if (difficulty !== 'easy') {
    const pairGroups = entries.filter((e) => e.count >= 2).sort((a, b) => b.count - a.count || b.face - a.face)
    if (pairGroups.length >= 2) {
      const facesToHold = new Set(pairGroups.slice(0, 2).map((g) => g.face))
      const hold = new Set<number>()
      dice.forEach((d) => {
        if (facesToHold.has(d.val)) hold.add(d.id)
      })
      return hold
    }
  }

  // Otherwise hold whichever face shows up most (ties favor the higher face) — chases
  // three/four/five-of-a-kind naturally.
  let modeFace = vals[0]
  let modeCount = 0
  for (const e of entries) {
    if (e.count > modeCount || (e.count === modeCount && e.face > modeFace)) {
      modeFace = e.face
      modeCount = e.count
    }
  }
  const hold = new Set<number>()
  dice.forEach((d) => {
    if (d.val === modeFace) hold.add(d.id)
  })
  return hold
}

// Categories that are hard to fill later on — hard mode locks these in over dumping into a
// bigger-looking but easy-to-reach upper box.
const HARD_TO_FILL: YCategory[] = ['yahtzee', 'largeStraight', 'smallStraight', 'fullHouse']

export function decideYahtzeeCategory(
  vals: number[],
  card: Partial<Record<YCategory, number>>,
  difficulty: BotDifficulty = 'medium',
): YCategory {
  const open = Y_CATEGORIES.filter((c) => !(c in card))
  let best: YCategory | null = null
  let bestWeight = -1
  for (const c of open) {
    const s = scoreCategory(vals, c)
    const weight = difficulty === 'hard' && s > 0 && HARD_TO_FILL.includes(c) ? s + 20 : s
    if (weight > bestWeight) {
      bestWeight = weight
      best = c
    }
  }
  if (best && bestWeight > 0) return best
  for (const c of BURN_ORDER) {
    if (open.includes(c)) return c
  }
  return open[0]
}
