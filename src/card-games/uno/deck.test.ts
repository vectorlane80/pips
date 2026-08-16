import { describe, expect, it } from 'vitest'
import { createUnoDeck } from './deck.ts'

const COLORS = ['red', 'yellow', 'green', 'blue'] as const

describe('createUnoDeck', () => {
  it('has exactly 108 cards with unique sequential ids uno-0..uno-107', () => {
    const deck = createUnoDeck()
    expect(deck).toHaveLength(108)
    expect(new Set(deck.map((c) => c.id)).size).toBe(108)
    expect(deck.map((c) => c.id)).toEqual(Array.from({ length: 108 }, (_, i) => `uno-${i}`))
  })

  it('has exactly 25 cards per color, in contiguous red/yellow/green/blue blocks', () => {
    const deck = createUnoDeck()
    for (const color of COLORS) {
      expect(deck.filter((c) => c.color === color)).toHaveLength(25)
    }
    expect(deck.slice(0, 25).every((c) => c.color === 'red')).toBe(true)
    expect(deck.slice(25, 50).every((c) => c.color === 'yellow')).toBe(true)
    expect(deck.slice(50, 75).every((c) => c.color === 'green')).toBe(true)
    expect(deck.slice(75, 100).every((c) => c.color === 'blue')).toBe(true)
  })

  it('has exactly 4 wild and 4 wild4 cards at the tail (uno-100..uno-107)', () => {
    const deck = createUnoDeck()
    expect(deck.filter((c) => c.kind === 'wild')).toHaveLength(4)
    expect(deck.filter((c) => c.kind === 'wild4')).toHaveLength(4)
    expect(deck.slice(100, 104).every((c) => c.kind === 'wild' && c.color === 'wild' && c.value === null)).toBe(true)
    expect(deck.slice(104, 108).every((c) => c.kind === 'wild4' && c.color === 'wild' && c.value === null)).toBe(true)
  })

  it('every value is null except for kind number, where it is 0-9', () => {
    const deck = createUnoDeck()
    for (const card of deck) {
      if (card.kind === 'number') {
        expect(card.value).toBeGreaterThanOrEqual(0)
        expect(card.value).toBeLessThanOrEqual(9)
      } else {
        expect(card.value).toBeNull()
      }
    }
  })

  it('per color: one 0, exactly two of each 1-9, two each of skip/reverse/draw2', () => {
    const deck = createUnoDeck()
    for (const color of COLORS) {
      const colored = deck.filter((c) => c.color === color)
      expect(colored.filter((c) => c.kind === 'number' && c.value === 0)).toHaveLength(1)
      for (let value = 1; value <= 9; value++) {
        expect(colored.filter((c) => c.kind === 'number' && c.value === value)).toHaveLength(2)
      }
      expect(colored.filter((c) => c.kind === 'skip')).toHaveLength(2)
      expect(colored.filter((c) => c.kind === 'reverse')).toHaveLength(2)
      expect(colored.filter((c) => c.kind === 'draw2')).toHaveLength(2)
    }
  })

  it('builds each color block in the exact documented order (0, 1..9×2, skip×2, reverse×2, draw2×2)', () => {
    const deck = createUnoDeck()
    const red = deck.slice(0, 25)
    expect(red[0]).toMatchObject({ kind: 'number', value: 0 })
    for (let value = 1; value <= 9; value++) {
      expect(red[1 + (value - 1) * 2]).toMatchObject({ kind: 'number', value })
      expect(red[2 + (value - 1) * 2]).toMatchObject({ kind: 'number', value })
    }
    expect(red[19]).toMatchObject({ kind: 'skip', value: null })
    expect(red[20]).toMatchObject({ kind: 'skip', value: null })
    expect(red[21]).toMatchObject({ kind: 'reverse', value: null })
    expect(red[22]).toMatchObject({ kind: 'reverse', value: null })
    expect(red[23]).toMatchObject({ kind: 'draw2', value: null })
    expect(red[24]).toMatchObject({ kind: 'draw2', value: null })
  })
})
