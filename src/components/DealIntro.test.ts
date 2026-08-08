import { describe, expect, it } from 'vitest'
import { computeDealFlights } from './DealIntro'

describe('computeDealFlights', () => {
  it('deals 10 alternating flights starting with the opponent for 10/10 hands', () => {
    const flights = computeDealFlights(10, 10)
    expect(flights.map((f) => f.seat)).toEqual([
      'opponent', 'you', 'opponent', 'you', 'opponent', 'you', 'opponent', 'you', 'opponent', 'you',
    ])
    expect(flights).toHaveLength(10)
    expect(flights.filter((f) => f.seat === 'opponent').map((f) => f.seatIndex)).toEqual([0, 1, 2, 3, 4])
    expect(flights.filter((f) => f.seat === 'you').map((f) => f.seatIndex)).toEqual([0, 1, 2, 3, 4])
  })

  it('respects a smaller maxFlights cap', () => {
    const flights = computeDealFlights(10, 10, 4)
    expect(flights.map((f) => f.seat)).toEqual(['opponent', 'you', 'opponent', 'you'])
    expect(flights).toHaveLength(4)
  })

  it('keeps dealing to the remaining seat once the other is exhausted', () => {
    // 3 yours + 5 opponents = 8 real cards, cap 10 → all 8 produced: alternating
    // until 'you' is exhausted at seatIndex 3, then opponent-only flights.
    const flights = computeDealFlights(3, 5)
    expect(flights.map((f) => f.seat)).toEqual([
      'opponent', 'you', 'opponent', 'you', 'opponent', 'you', 'opponent', 'opponent',
    ])
    expect(flights).toHaveLength(8)
    expect(flights.filter((f) => f.seat === 'you').map((f) => f.seatIndex)).toEqual([0, 1, 2])
    expect(flights.filter((f) => f.seat === 'opponent').map((f) => f.seatIndex)).toEqual([0, 1, 2, 3, 4])
    // Never a flight for the exhausted seat.
    expect(flights.filter((f) => f.seat === 'you').some((f) => f.seatIndex >= 3)).toBe(false)
  })

  it('produces opponent-only flights when your count is 0', () => {
    const flights = computeDealFlights(0, 5)
    expect(flights.map((f) => f.seat)).toEqual(['opponent', 'opponent', 'opponent', 'opponent', 'opponent'])
    expect(flights.map((f) => f.seatIndex)).toEqual([0, 1, 2, 3, 4])
  })

  it('returns an empty array when both counts are 0', () => {
    expect(computeDealFlights(0, 0)).toEqual([])
  })
})
