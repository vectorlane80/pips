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

  it('travel order is 48 unit steps plus 4 diagonal √2 steps, wrap included', () => {
    const { track } = createBoard()
    const steps = Array.from({ length: 52 }, (_, i) => sqDist(track[i], track[(i + 1) % 52]))
    expect(steps.filter((d) => d === 1)).toHaveLength(48)
    expect(steps.filter((d) => d === 2)).toHaveLength(4)
    // The wrap closes the circuit at the last corner → the first hole of the
    // top arm, which is one of the four √2 corner transitions.
    expect(sqDist(track[51], track[0])).toBe(2)
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

  it('corners sit one step in from the arm bend at indices 12/25/38/51, diagonals 26 apart', () => {
    const board = createBoard()
    expect(board.corners).toEqual([12, 25, 38, 51])
    const expected: Hole[] = [
      { x: 1, y: -2 },
      { x: 2, y: 1 },
      { x: -1, y: 2 },
      { x: -2, y: -1 },
    ]
    board.corners.forEach((index, q) => {
      expect(board.track[index]).toEqual(expected[q])
    })
    for (let q = 0; q < 4; q++) {
      expect((board.corners[q] + 26) % 52).toBe(board.corners[(q + 2) % 4])
    }
  })

  it('entries are 10/23/36/49, one step after the entrance and two before the corner', () => {
    const board = createBoard()
    expect(board.entries).toEqual([10, 23, 36, 49])
    expect(board.entrances).toEqual([9, 22, 35, 48])
    for (let q = 0; q < 4; q++) {
      // Home entrance (q*13+9) → come-out (q*13+10) is a unit step; the
      // come-out is two unit steps before the quadrant's corner (a hole sits
      // between them), so the squared distance is 4.
      expect(sqDist(board.track[board.entrances[q]], board.track[board.entries[q]])).toBe(1)
      expect(sqDist(board.track[board.entries[q]], board.track[board.corners[q]])).toBe(4)
      // Corner → next arm's first hole is the √2 step.
      expect(sqDist(board.track[board.corners[q]], board.track[(board.corners[q] + 1) % 52])).toBe(2)
      // The home entrance is seat-relative 51 (the branch hole just before the
      // lane), unchanged by the topology rework.
      expect(trackIndexFor(q, 51)).toBe(board.entrances[q])
    }
  })

  it('home lanes start at the entrance-adjacent hole (rel 52) and run toward the center (rel 55)', () => {
    const board = createBoard()
    for (let q = 0; q < 4; q++) {
      // homes[q][0] (rel 52) is one unit from the arm's home entrance.
      expect(sqDist(board.track[board.entrances[q]], board.homes[q][0])).toBe(1)
      // The lane is a straight run: consecutive slots are unit steps apart.
      for (let i = 0; i < 3; i++) {
        expect(sqDist(board.homes[q][i], board.homes[q][i + 1])).toBe(1)
      }
      // Deepest slot (rel 55) is closer to the center than the outer slot.
      expect(sqDist(board.homes[q][3], board.center)).toBeLessThan(sqDist(board.homes[q][0], board.center))
    }
  })

  it('bases sit in the diagonal region each come-out edge faces; q1 is the SE cluster', () => {
    const board = createBoard()
    // q1 (right arm): the SE cluster specifically.
    expect(new Set(board.bases[1].map(key))).toEqual(new Set(['4,4', '5,4', '4,5', '5,5']))
    // Every cluster is a 2×2 block off the cross, at |x| ≥ 4 and |y| ≥ 4.
    for (const cluster of board.bases) {
      expect(new Set(cluster.map(key)).size).toBe(4)
      for (const h of cluster) {
        expect(Math.abs(h.x)).toBeGreaterThanOrEqual(4)
        expect(Math.abs(h.y)).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('is deterministic', () => {
    expect(createBoard()).toEqual(createBoard())
  })
})

describe('trackIndexFor', () => {
  it('maps arm + relative distance to the absolute track index', () => {
    expect(trackIndexFor(0, 0)).toBe(10) // the arm's come-out, not the seam
    expect(trackIndexFor(2, 51)).toBe(35)
    const expected = [
      [12, 25, 38, 51],
      [25, 38, 51, 12],
      [38, 51, 12, 25],
      [51, 12, 25, 38],
    ]
    for (let arm = 0; arm < 4; arm++) {
      for (const [k, distance] of [2, 15, 28, 41].entries()) {
        expect(trackIndexFor(arm, distance)).toBe(expected[arm][k])
      }
    }
  })

  it("places each arm's four corners at relative distances 2/15/28/41", () => {
    const board = createBoard()
    for (let arm = 0; arm < 4; arm++) {
      const relatives = board.corners.map((c) => ((c - arm * 13 - 10) % 52 + 52) % 52)
      expect(new Set(relatives)).toEqual(new Set([2, 15, 28, 41]))
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
