import { describe, expect, it } from 'vitest'
import { computeDealFlights } from './DealIntro'

describe('computeDealFlights', () => {
  it('deals 10 alternating flights starting with the (single) other seat for 10/10 hands', () => {
    const flights = computeDealFlights(10, [10])
    expect(flights.map((f) => f.seat)).toEqual([0, 'you', 0, 'you', 0, 'you', 0, 'you', 0, 'you'])
    expect(flights).toHaveLength(10)
    expect(flights.filter((f) => f.seat === 0).map((f) => f.seatIndex)).toEqual([0, 1, 2, 3, 4])
    expect(flights.filter((f) => f.seat === 'you').map((f) => f.seatIndex)).toEqual([0, 1, 2, 3, 4])
  })

  it('respects a smaller maxFlights cap', () => {
    const flights = computeDealFlights(10, [10], 4)
    expect(flights.map((f) => f.seat)).toEqual([0, 'you', 0, 'you'])
    expect(flights).toHaveLength(4)
  })

  it('keeps dealing to the remaining seat once the other is exhausted', () => {
    // 3 yours + 5 other's = 8 real cards, cap 10 → all 8 produced: alternating
    // until 'you' is exhausted at seatIndex 3, then other-only flights.
    const flights = computeDealFlights(3, [5])
    expect(flights.map((f) => f.seat)).toEqual([0, 'you', 0, 'you', 0, 'you', 0, 0])
    expect(flights).toHaveLength(8)
    expect(flights.filter((f) => f.seat === 'you').map((f) => f.seatIndex)).toEqual([0, 1, 2])
    expect(flights.filter((f) => f.seat === 0).map((f) => f.seatIndex)).toEqual([0, 1, 2, 3, 4])
    // Never a flight for the exhausted seat.
    expect(flights.filter((f) => f.seat === 'you').some((f) => f.seatIndex >= 3)).toBe(false)
  })

  it('produces other-only flights when your count is 0', () => {
    const flights = computeDealFlights(0, [5])
    expect(flights.map((f) => f.seat)).toEqual([0, 0, 0, 0, 0])
    expect(flights.map((f) => f.seatIndex)).toEqual([0, 1, 2, 3, 4])
  })

  it('returns an empty array when both counts are 0', () => {
    expect(computeDealFlights(0, [0])).toEqual([])
  })

  it('round-robins across N other seats in order, then you, before wrapping', () => {
    // 3 other seats with 2 each + you with 2: expect seat 0,1,2,you repeating.
    const flights = computeDealFlights(2, [2, 2, 2])
    expect(flights.map((f) => f.seat)).toEqual([0, 1, 2, 'you', 0, 1, 2, 'you'])
    expect(flights).toHaveLength(8)
  })

  it('skips an exhausted seat mid-cycle and keeps cycling the rest', () => {
    // Seat 0 has 1, seat 1 has 3, you have 1.
    // Cycle order is [0, 1, you]: 0,1,you,(0 skipped),1,(you skipped),1
    const flights = computeDealFlights(1, [1, 3])
    expect(flights.map((f) => f.seat)).toEqual([0, 1, 'you', 1, 1])
    expect(flights).toHaveLength(5)
    expect(flights.filter((f) => f.seat === 1).map((f) => f.seatIndex)).toEqual([0, 1, 2])
  })
})
