import { describe, expect, it } from 'vitest'
import type { UnoCard } from '../card-games/uno/deck'
import type { UnoLastAction } from '../card-games/uno/state'
import { sortUnoHand, formatLastAction } from './UnoTable'

function card(id: string, color: UnoCard['color'], kind: UnoCard['kind'], value: number | null = null): UnoCard {
  return { id, color, kind, value }
}

describe('sortUnoHand', () => {
  it('returns a new array and leaves the input order untouched', () => {
    const input = [
      card('blue-1', 'blue', 'number', 1),
      card('red-1', 'red', 'number', 1),
    ]
    const sorted = sortUnoHand(input)
    expect(sorted).not.toBe(input)
    expect(sorted.map((c) => c.id)).toEqual(['red-1', 'blue-1'])
    expect(input.map((c) => c.id)).toEqual(['blue-1', 'red-1'])
  })

  it('sorts an empty hand', () => {
    expect(sortUnoHand([])).toEqual([])
  })

  it('groups by the fixed color order red, yellow, green, blue', () => {
    const input = [
      card('blue', 'blue', 'number', 0),
      card('yellow', 'yellow', 'number', 0),
      card('green', 'green', 'number', 0),
      card('red', 'red', 'number', 0),
    ]
    expect(sortUnoHand(input).map((c) => c.color)).toEqual(['red', 'yellow', 'green', 'blue'])
  })

  it('sorts numbers ascending within a color, then action cards skip/reverse/draw2', () => {
    const input = [
      card('r-draw2', 'red', 'draw2'),
      card('r-9', 'red', 'number', 9),
      card('r-0', 'red', 'number', 0),
      card('r-reverse', 'red', 'reverse'),
      card('r-5', 'red', 'number', 5),
      card('r-skip', 'red', 'skip'),
      card('r-1', 'red', 'number', 1),
    ]
    expect(sortUnoHand(input).map((c) => c.id)).toEqual([
      'r-0', 'r-1', 'r-5', 'r-9', 'r-skip', 'r-reverse', 'r-draw2',
    ])
  })

  it('keeps wilds at the very end, wild before wild4', () => {
    const input = [
      card('wild4', 'wild', 'wild4'),
      card('blue-1', 'blue', 'number', 1),
      card('wild', 'wild', 'wild'),
      card('red-2', 'red', 'number', 2),
    ]
    expect(sortUnoHand(input).map((c) => c.id)).toEqual(['red-2', 'blue-1', 'wild', 'wild4'])
  })

  it('is stable for identical cards (same color/kind/value keep their relative order)', () => {
    const input = [
      card('r-5-a', 'red', 'number', 5),
      card('r-5-b', 'red', 'number', 5),
      card('r-5-c', 'red', 'number', 5),
    ]
    expect(sortUnoHand(input).map((c) => c.id)).toEqual(['r-5-a', 'r-5-b', 'r-5-c'])
  })
})

describe('formatLastAction', () => {
  const names = { 'player1': 'Alice', 'player2': 'Bob' }
  const localPlayerId = 'player1'

  it('returns "No plays yet" when lastAction is null', () => {
    expect(formatLastAction(null, localPlayerId, names, false)).toBe('No plays yet')
  })

  it('formats a plain 0 play with sevenZero OFF as ordinary number card text, not rotation', () => {
    const lastAction: UnoLastAction = {
      by: 'player2',
      kind: 'play',
      card: { color: 'red', kind: 'number', value: 0 },
      drewCount: 0,
    }
    const result = formatLastAction(lastAction, localPlayerId, names, false)
    // With sevenZero OFF, a 0 should NOT say "hands rotated" — it's just a normal number card
    expect(result).toBe('Bob played red 0')
    expect(result).not.toContain('rotated')
  })

  it('formats a plain 0 play with sevenZero ON as rotation text', () => {
    const lastAction: UnoLastAction = {
      by: 'player2',
      kind: 'play',
      card: { color: 'red', kind: 'number', value: 0 },
      drewCount: 0,
    }
    const result = formatLastAction(lastAction, localPlayerId, names, true)
    expect(result).toBe('Bob played a 0 — hands rotated')
  })

  it('formats a 7-swap with sevenZero ON and swapTargetPlayerId defined', () => {
    const lastAction: UnoLastAction = {
      by: 'player2',
      kind: 'play',
      card: { color: 'red', kind: 'number', value: 7 },
      drewCount: 0,
      swapTargetPlayerId: 'player1',
    }
    const result = formatLastAction(lastAction, localPlayerId, names, true)
    expect(result).toBe('Bob swapped hands with you')
  })

  it('formats a plain 7 play (without swap) with sevenZero OFF as ordinary number card', () => {
    const lastAction: UnoLastAction = {
      by: 'player2',
      kind: 'play',
      card: { color: 'red', kind: 'number', value: 7 },
      drewCount: 0,
    }
    const result = formatLastAction(lastAction, localPlayerId, names, false)
    // With sevenZero OFF, a 7 is just a normal number card
    expect(result).toBe('Bob played red 7')
  })

  it('formats a plain 7 play (without swapTargetPlayerId) with sevenZero ON as ordinary number card', () => {
    const lastAction: UnoLastAction = {
      by: 'player2',
      kind: 'play',
      card: { color: 'red', kind: 'number', value: 7 },
      drewCount: 0,
    }
    const result = formatLastAction(lastAction, localPlayerId, names, true)
    // Even with sevenZero ON, if there's no swapTargetPlayerId, it's not a completed swap
    expect(result).toBe('Bob played red 7')
  })

  it('formats a draw action', () => {
    const lastAction: UnoLastAction = {
      by: 'player2',
      kind: 'draw',
      card: null,
      drewCount: 3,
    }
    expect(formatLastAction(lastAction, localPlayerId, names, false)).toBe('Bob drew 3 cards')
  })

  it('formats a pass action', () => {
    const lastAction: UnoLastAction = {
      by: 'player2',
      kind: 'pass',
      card: null,
      drewCount: 0,
    }
    expect(formatLastAction(lastAction, localPlayerId, names, false)).toBe('Bob passed')
  })
})
