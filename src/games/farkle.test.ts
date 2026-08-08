import { describe, it, expect } from 'vitest'
import { tookFinalTurn } from './farkle'

describe('tookFinalTurn — guards', () => {
  it('finalRound = false → false for every seat regardless of other params', () => {
    expect(tookFinalTurn(0, 1, 3, 2, false)).toBe(false)
    expect(tookFinalTurn(1, 1, 3, 2, false)).toBe(false)
    expect(tookFinalTurn(2, 1, 3, 2, false)).toBe(false)
  })

  it('triggerSeatIndex = -1 → false even with finalRound = true', () => {
    expect(tookFinalTurn(0, -1, 3, 2, true)).toBe(false)
    expect(tookFinalTurn(1, -1, 3, 2, true)).toBe(false)
  })
})

describe('tookFinalTurn — 3 seats, trigger at seat 1', () => {
  // Seat 1 banked to start the final round; play proceeds 2 → 0 → game ends.

  it('turnIdx = 2 (seat 2 now up): only the trigger is done', () => {
    expect(tookFinalTurn(1, 1, 3, 2, true)).toBe(true) // trigger — their bank started the round
    expect(tookFinalTurn(2, 1, 3, 2, true)).toBe(false) // their turn, not finished yet
    expect(tookFinalTurn(0, 1, 3, 2, true)).toBe(false) // not reached yet
  })

  it('turnIdx = 0 (seat 2 finished, seat 0 up): trigger and seat 2 done', () => {
    expect(tookFinalTurn(1, 1, 3, 0, true)).toBe(true) // trigger
    expect(tookFinalTurn(2, 1, 3, 0, true)).toBe(true) // turn passed seat 2 since the trigger's bank
    expect(tookFinalTurn(0, 1, 3, 0, true)).toBe(false) // their turn, not finished yet
  })
})

describe('tookFinalTurn — 4 seats, trigger at seat 2', () => {
  // Final order after trigger: 3, 0, 1.

  it('turnIdx = 3: only the trigger is done', () => {
    expect(tookFinalTurn(2, 2, 4, 3, true)).toBe(true) // trigger
    expect(tookFinalTurn(3, 2, 4, 3, true)).toBe(false) // their turn, not finished yet
    expect(tookFinalTurn(0, 2, 4, 3, true)).toBe(false) // not reached yet
    expect(tookFinalTurn(1, 2, 4, 3, true)).toBe(false) // not reached yet
  })

  it('turnIdx = 0: seat 3 done, seats 0 and 1 not', () => {
    expect(tookFinalTurn(2, 2, 4, 0, true)).toBe(true) // trigger
    expect(tookFinalTurn(3, 2, 4, 0, true)).toBe(true) // turn passed seat 3
    expect(tookFinalTurn(0, 2, 4, 0, true)).toBe(false) // their turn, not finished yet
    expect(tookFinalTurn(1, 2, 4, 0, true)).toBe(false) // not reached yet
  })

  it('turnIdx = 1: seats 3 and 0 done, seat 1 up', () => {
    expect(tookFinalTurn(2, 2, 4, 1, true)).toBe(true) // trigger
    expect(tookFinalTurn(3, 2, 4, 1, true)).toBe(true) // turn passed seat 3
    expect(tookFinalTurn(0, 2, 4, 1, true)).toBe(true) // turn passed seat 0
    expect(tookFinalTurn(1, 2, 4, 1, true)).toBe(false) // their turn, not finished yet
  })
})

describe('tookFinalTurn — trigger at seat 0, 3 seats', () => {
  it('turnIdx = 2 (wraparound): seats 0 and 1 done, seat 2 up', () => {
    expect(tookFinalTurn(0, 0, 3, 2, true)).toBe(true) // trigger
    expect(tookFinalTurn(1, 0, 3, 2, true)).toBe(true) // turn passed seat 1 (wrapped around)
    expect(tookFinalTurn(2, 0, 3, 2, true)).toBe(false) // their turn, not finished yet
  })
})
