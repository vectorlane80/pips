import { describe, expect, it } from 'vitest'
import { createBoard, trackIndexFor, type Hole } from './board.ts'

const key = (h: Hole): string => `${h.x},${h.y}`
const sqDist = (a: Hole, b: Hole): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

// 90° clockwise in screen coordinates (+y down).
const rotateCW = (h: Hole): Hole => ({ x: -h.y, y: h.x })

describe('createBoard', () => {
  it('lays 52 unique track holes clear of homes, bases, and the center', () => {
    const board = createBoard()
    expect(board.track).toHaveLength(52)
    expect(new Set(board.track.map(key)).size).toBe(52)

    const homes = board.homes.flat()
    const bases = board.bases.flat()
    expect(homes).toHaveLength(16)
    expect(bases).toHaveLength(16)

    const trackKeys = new Set(board.track.map(key))
    const homeKeys = new Set(homes.map(key))
    const baseKeys = new Set(bases.map(key))
    expect(homeKeys.size).toBe(16)
    expect(baseKeys.size).toBe(16)
    expect(board.center).toEqual({ x: 0, y: 0 })

    for (const k of trackKeys) {
      expect(homeKeys.has(k)).toBe(false)
      expect(baseKeys.has(k)).toBe(false)
      expect(k).not.toBe('0,0')
    }
    for (const k of homeKeys) {
      expect(baseKeys.has(k)).toBe(false)
      expect(k).not.toBe('0,0')
    }
  })

  it('travel order is 48 unit steps plus 4 diagonals, wrap step length 1', () => {
    const { track } = createBoard()
    const steps = Array.from({ length: 52 }, (_, i) => sqDist(track[i], track[(i + 1) % 52]))
    expect(steps.filter((d) => d === 1)).toHaveLength(48)
    expect(steps.filter((d) => d === 2)).toHaveLength(4)
    expect(sqDist(track[51], track[0])).toBe(1)
  })

  it('rotates each quadrant hole-for-hole into the next quadrant', () => {
    const board = createBoard()
    for (let q = 0; q < 4; q++) {
      const next = (q + 1) % 4
      for (let i = 0; i < 13; i++) {
        expect(rotateCW(board.track[q * 13 + i])).toEqual(board.track[next * 13 + i])
      }
      for (let i = 0; i < 4; i++) {
        expect(rotateCW(board.homes[q][i])).toEqual(board.homes[next][i])
        expect(rotateCW(board.bases[q][i])).toEqual(board.bases[next][i])
      }
    }
    // And so on around: four rotations return every hole to itself.
    const four = (h: Hole): Hole => rotateCW(rotateCW(rotateCW(rotateCW(h))))
    for (const h of [...board.track, ...board.homes.flat(), ...board.bases.flat(), board.center]) {
      expect(four(h)).toEqual(h)
    }
  })

  it('corners sit at (±2, ±2) with indices 12/25/38/51, diagonals 26 apart', () => {
    const board = createBoard()
    expect(board.corners).toEqual([12, 25, 38, 51])
    const expected: Hole[] = [
      { x: 2, y: -2 },
      { x: 2, y: 2 },
      { x: -2, y: 2 },
      { x: -2, y: -2 },
    ]
    board.corners.forEach((index, q) => {
      expect(board.track[index]).toEqual(expected[q])
    })
    for (let q = 0; q < 4; q++) {
      expect((board.corners[q] + 26) % 52).toBe(board.corners[(q + 2) % 4])
    }
  })

  it('entries are 0/13/26/39, each one unit after the preceding corner', () => {
    const board = createBoard()
    expect(board.entries).toEqual([0, 13, 26, 39])
    for (let q = 0; q < 4; q++) {
      const prevCorner = board.corners[(q + 3) % 4]
      expect(sqDist(board.track[prevCorner], board.track[board.entries[q]])).toBe(1)
    }
  })

  it('is deterministic', () => {
    expect(createBoard()).toEqual(createBoard())
  })
})

describe('trackIndexFor', () => {
  it('maps arm + relative distance to the absolute track index', () => {
    expect(trackIndexFor(0, 0)).toBe(0)
    expect(trackIndexFor(2, 51)).toBe(25)
    const expected = [
      [0, 12, 25, 51],
      [13, 25, 38, 12],
      [26, 38, 51, 25],
      [39, 51, 12, 38],
    ]
    for (let arm = 0; arm < 4; arm++) {
      for (const [k, distance] of [0, 12, 25, 51].entries()) {
        expect(trackIndexFor(arm, distance)).toBe(expected[arm][k])
      }
    }
  })

  it('places each arm\'s four corners at relative distances 12/25/38/51', () => {
    const board = createBoard()
    for (let arm = 0; arm < 4; arm++) {
      const relatives = board.corners.map((c) => ((c - arm * 13) % 52 + 52) % 52)
      expect(new Set(relatives)).toEqual(new Set([12, 25, 38, 51]))
      relatives.forEach((distance, k) => {
        expect(trackIndexFor(arm, distance)).toBe(board.corners[k])
      })
    }
  })
})

describe('bounds', () => {
  it('keeps every hole within |x| ≤ 7 and |y| ≤ 7', () => {
    const board = createBoard()
    const all = [...board.track, ...board.homes.flat(), ...board.bases.flat(), board.center]
    for (const h of all) {
      expect(Math.abs(h.x)).toBeLessThanOrEqual(7)
      expect(Math.abs(h.y)).toBeLessThanOrEqual(7)
    }
  })
})
