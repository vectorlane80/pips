import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addSeat, applyAction, makeRoom } from './room'
import { grandTotal } from '../games/yahtzee'
import type { RoomState, YCategory } from '../types'

function yahtzeeRoom(): RoomState {
  let room = makeRoom('TEST-1', 'yahtzee', 'Host', 'h1')
  room = addSeat(room, 'g1', 'Guest', false)
  // h1 is seats[0], so turnIdx 0 already points at them; just flip the screen
  return { ...room, screen: 'yahtzee' as const }
}

function dice(vals: number[]) {
  return vals.map((val, id) => ({ id, val, sel: false, rot: 0 }))
}

function setYahtzee(
  room: RoomState,
  vals: number[],
  card: Partial<Record<YCategory, number>>,
  bonuses: Record<string, number> = room.yahtzee.bonuses,
): RoomState {
  return {
    ...room,
    yahtzee: {
      ...room.yahtzee,
      dice: dice(vals),
      cards: { ...room.yahtzee.cards, h1: card },
      bonuses,
    },
  }
}

function score(room: RoomState, category: YCategory, by = 'h1'): RoomState {
  return applyAction(room, { type: 'yahtzeeScore', category }, by)
}

describe('yahtzeeScore — +100 bonus for a second yahtzee', () => {
  it('awards 100 when the yahtzee box holds 50 and the roll is five of a kind', () => {
    const room = setYahtzee(yahtzeeRoom(), [6, 6, 6, 6, 6], { yahtzee: 50 })
    const result = score(room, 'sixes')

    expect(result.yahtzee.bonuses.h1).toBe(100)
    expect(result.yahtzee.cards.h1.sixes).toBe(30)
    // Seat score is grandTotal of the card plus the bonus — 80 + 100
    const h1 = result.seats.find((s) => s.id === 'h1')!
    expect(h1.score).toBe(grandTotal(result.yahtzee.cards.h1) + 100)
    // Independently derived: sixes scores 30 (5×6), card becomes {yahtzee:50, sixes:30},
    // upperTotal=30 (yahtzee excluded from upper section) is under 63 so no upper bonus,
    // grandTotal = 50+30 = 80, plus the +100 yahtzee bonus = 180.
    expect(h1.score).toBe(180)
  })

  it('no bonus when the yahtzee box was zeroed (scored elsewhere)', () => {
    // yahtzee: 0 is a filled box, but the bonus requires exactly 50
    const room = setYahtzee(yahtzeeRoom(), [6, 6, 6, 6, 6], { yahtzee: 0 })
    const result = score(room, 'sixes')

    expect(result.yahtzee.bonuses.h1).toBe(0)
    expect(result.yahtzee.cards.h1.sixes).toBe(30)
  })

  it('no bonus without five of a kind', () => {
    const room = setYahtzee(yahtzeeRoom(), [6, 6, 6, 6, 5], { yahtzee: 50 })
    const result = score(room, 'sixes')

    expect(result.yahtzee.bonuses.h1).toBe(0)
  })

  it('first yahtzee: no bonus, just the 50 in the box', () => {
    const room = setYahtzee(yahtzeeRoom(), [6, 6, 6, 6, 6], {})
    const result = score(room, 'yahtzee')

    expect(result.yahtzee.bonuses.h1).toBe(0)
    expect(result.yahtzee.cards.h1.yahtzee).toBe(50)
  })

  it('accumulates across bonuses without double counting', () => {
    // Simulate one prior bonus already banked
    const room = setYahtzee(yahtzeeRoom(), [2, 2, 2, 2, 2], { yahtzee: 50 }, { h1: 100, g1: 0 })
    const result = score(room, 'twos')

    expect(result.yahtzee.bonuses.h1).toBe(200)
    expect(result.yahtzee.cards.h1.twos).toBe(10)
    // grandTotal never reads bonuses, so the 200 is added exactly once in yahtzeeScore
    const h1 = result.seats.find((s) => s.id === 'h1')!
    expect(h1.score).toBe(grandTotal(result.yahtzee.cards.h1) + 200)
  })
})

describe('farkle — held dice survive a busted roll', () => {
  // Cycling mock guarantees every rolled die is a 2, 3, 4, or 6 (never a 1 or 5, and no
  // 3-of-a-kind possible), so any roll is a guaranteed bust. rollDie consumes two
  // Math.random() calls per die (val + rot), which the cycling mock handles fine.
  const mockVals = [0.2, 0.4, 0.6, 0.85]
  let mockIdx = 0

  beforeEach(() => {
    mockIdx = 0
    vi.spyOn(Math, 'random').mockImplementation(() => mockVals[mockIdx++ % mockVals.length])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function farkleRoom(): RoomState {
    let room = makeRoom('TEST-2', 'farkle', 'Host', 'h1')
    room = addSeat(room, 'g1', 'Guest', false)
    // h1 is seats[0], so turnIdx 0 already points at them. Pre-populate kept/turnScore to
    // simulate the player having already set aside two 5s earlier in the turn.
    return { ...room, screen: 'farkle' as const, farkle: { ...room.farkle, kept: [5, 5], turnScore: 100, dice: [] } }
  }

  it('keeps already-held dice visible when the roll busts', () => {
    const result = applyAction(farkleRoom(), { type: 'farkleRoll' }, 'h1')

    expect(result.farkle.farkle).toBe(true)
    // Previously reset to [] the moment a roll busted; the held dice must survive
    expect(result.farkle.kept).toEqual([5, 5])
    expect(result.farkle.lost).toBe(100)
  })

  it('clears held dice when the turn ends after a farkle', () => {
    const room = farkleRoom()
    const farkled = { ...room, farkle: { ...room.farkle, farkle: true, dice: [{ id: 0, val: 2, sel: false, rot: 0 }] } }
    const result = applyAction(farkled, { type: 'farkleEndTurn' }, 'h1')

    expect(result.farkle.kept).toEqual([])
    expect(result.farkle.dice).toEqual([])
  })
})
