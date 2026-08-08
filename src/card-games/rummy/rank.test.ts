import { describe, it, expect } from 'vitest'
import { rankValue, deadwoodValue } from './rank.ts'

describe('rankValue', () => {
  it('returns 1 for Ace', () => {
    expect(rankValue('A')).toBe(1)
  })

  it('returns 2 for 2', () => {
    expect(rankValue('2')).toBe(2)
  })

  it('returns 3 for 3', () => {
    expect(rankValue('3')).toBe(3)
  })

  it('returns 4 for 4', () => {
    expect(rankValue('4')).toBe(4)
  })

  it('returns 5 for 5', () => {
    expect(rankValue('5')).toBe(5)
  })

  it('returns 6 for 6', () => {
    expect(rankValue('6')).toBe(6)
  })

  it('returns 7 for 7', () => {
    expect(rankValue('7')).toBe(7)
  })

  it('returns 8 for 8', () => {
    expect(rankValue('8')).toBe(8)
  })

  it('returns 9 for 9', () => {
    expect(rankValue('9')).toBe(9)
  })

  it('returns 10 for 10', () => {
    expect(rankValue('10')).toBe(10)
  })

  it('returns 11 for Jack', () => {
    expect(rankValue('J')).toBe(11)
  })

  it('returns 12 for Queen', () => {
    expect(rankValue('Q')).toBe(12)
  })

  it('returns 13 for King', () => {
    expect(rankValue('K')).toBe(13)
  })
})

describe('deadwoodValue', () => {
  it('returns 15 for an unmelded Ace (context-dependent penalty, not raw rank value)', () => {
    expect(deadwoodValue('A')).toBe(15)
  })

  it('returns raw value for 2 through 9', () => {
    expect(deadwoodValue('2')).toBe(2)
    expect(deadwoodValue('3')).toBe(3)
    expect(deadwoodValue('4')).toBe(4)
    expect(deadwoodValue('5')).toBe(5)
    expect(deadwoodValue('6')).toBe(6)
    expect(deadwoodValue('7')).toBe(7)
    expect(deadwoodValue('8')).toBe(8)
    expect(deadwoodValue('9')).toBe(9)
  })

  it('returns 10 for 10', () => {
    expect(deadwoodValue('10')).toBe(10)
  })

  it('returns 10 for Jack', () => {
    expect(deadwoodValue('J')).toBe(10)
  })

  it('returns 10 for Queen', () => {
    expect(deadwoodValue('Q')).toBe(10)
  })

  it('returns 10 for King', () => {
    expect(deadwoodValue('K')).toBe(10)
  })
})
