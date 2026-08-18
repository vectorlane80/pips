import { describe, expect, it } from 'vitest'
import type { UnoCard } from '../card-games/uno/deck'
import { sortUnoHand } from './UnoTable'

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
