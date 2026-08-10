import { describe, expect, it } from 'vitest'
import {
  CORNER_RELS,
  createBoard,
  HOME_ENTRANCE_REL,
  LANE_END,
  LANE_START,
  OWNER_TRACK_LEN,
  SHORTCUT_ENTRIES,
  SHORTCUT_EXITS,
  trackIndexFor,
  TRACK_LEN,
  type Hole,
} from './board.ts'

const key = (h: Hole): string => `${h.x},${h.y}`
const sqDist = (a: Hole, b: Hole): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

// 90° clockwise in screen coordinates (+y down).
const rotateCW = (h: Hole): Hole => ({ x: -h.y, y: h.x })

describe('createBoard', () => {
  it('lays 64 unique track holes clear of homes, bases, and the center', () => {
    const board = createBoard()
    expect(board.track).toHaveLength(TRACK_LEN)
    expect(new Set(board.track.map(key)).size).toBe(TRACK_LEN)

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

  it('travel order is 64 unit steps — the shared corners make every step length 1, wrap included', () => {
    const { track } = createBoard()
    const steps = Array.from({ length: TRACK_LEN }, (_, i) => sqDist(track[i], track[(i + 1) % TRACK_LEN]))
    // The exact multiset: all 1s (no diagonal corner steps at all).
    expect(steps.every((d) => d === 1)).toBe(true)
    // The wrap closes the circuit at the last shared corner → the top arm's
    // first hole: (−2,−2) → (−2,−3) is a unit step.
    expect(sqDist(track[TRACK_LEN - 1], track[0])).toBe(1)
    // Tip-corner turns stay unit steps too: (−2,−7)→(−2,−8) and (−2,−8)→(−1,−8).
    expect(sqDist(track[4], track[5])).toBe(1)
    expect(sqDist(track[5], track[6])).toBe(1)
    // Shared corner → next quadrant's first hole: (2,−2) → (3,−2) is a unit step.
    expect(sqDist(track[15], track[16])).toBe(1)
  })

  it('rotates each quadrant hole-for-hole into the next quadrant', () => {
    const board = createBoard()
    const per = TRACK_LEN / 4
    for (let q = 0; q < 4; q++) {
      const next = (q + 1) % 4
      for (let i = 0; i < per; i++) {
        expect(rotateCW(board.track[q * per + i])).toEqual(board.track[next * per + i])
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

  it('places shared corners at 15/31/47/63, entries at 9/25/41/57, entrances at 7/23/39/55', () => {
    const board = createBoard()
    expect(board.corners).toEqual([15, 31, 47, 63])
    expect(board.entries).toEqual([9, 25, 41, 57])
    expect(board.entrances).toEqual([7, 23, 39, 55])
    // The shared corners are the four (±2, ±2) holes — each quadrant's last
    // hole; the entrance is the tip middle of each arm (furthest from center).
    const expectedCorners: Hole[] = [
      { x: 2, y: -2 },
      { x: 2, y: 2 },
      { x: -2, y: 2 },
      { x: -2, y: -2 },
    ]
    const expectedEntrances: Hole[] = [
      { x: 0, y: -8 },
      { x: 8, y: 0 },
      { x: 0, y: 8 },
      { x: -8, y: 0 },
    ]
    board.corners.forEach((index, q) => {
      expect(board.track[index]).toEqual(expectedCorners[q])
    })
    board.entrances.forEach((index, q) => {
      // Compare via key(): the 90°/180° rotations can yield −0 for a zero
      // coordinate ({ x: -0, y: 8 }), which deep-equals as distinct from +0
      // but stringifies to the same hole.
      expect(key(board.track[index])).toBe(key(expectedEntrances[q]))
    })
    for (let q = 0; q < 4; q++) {
      // The come-out (entry) is the own-arm tip corner on the base-facing
      // side, two holes past the home entrance in travel order (e.g. (2,−8)
      // for the top arm, two after the entrance at (0,−8)).
      expect(board.entries[q] - board.entrances[q]).toBe(2)
      // Corner → next arm's first hole is a unit step (shared corners).
      expect(sqDist(board.track[board.corners[q]], board.track[(board.corners[q] + 1) % TRACK_LEN])).toBe(1)
      // Seat-relative landmarks: rel 0 = the come-out, rel 62 = the entrance.
      expect(trackIndexFor(q, 0)).toBe(board.entries[q])
      expect(trackIndexFor(q, HOME_ENTRANCE_REL)).toBe(board.entrances[q])
    }
  })

  it('home lanes start at the entrance-adjacent hole (rel 63) and run toward the center (rel 66)', () => {
    const board = createBoard()
    // The top arm's lane hangs INWARD from the tip-middle entrance: (0,−7) …
    // (0,−4), rel 63 = adjacent below the entrance, rel 66 = deepest.
    expect(board.homes[0]).toEqual([
      { x: 0, y: -7 },
      { x: 0, y: -6 },
      { x: 0, y: -5 },
      { x: 0, y: -4 },
    ])
    for (let q = 0; q < 4; q++) {
      // homes[q][0] (rel 63) is one unit from the arm's home entrance.
      expect(sqDist(board.track[board.entrances[q]], board.homes[q][0])).toBe(1)
      // The lane is a straight run: consecutive slots are unit steps apart.
      for (let i = 0; i < 3; i++) {
        expect(sqDist(board.homes[q][i], board.homes[q][i + 1])).toBe(1)
      }
      // Deepest slot (rel 66) is closer to the center than the outer slot.
      expect(sqDist(board.homes[q][3], board.center)).toBeLessThan(sqDist(board.homes[q][0], board.center))
    }
  })

  it('bases are diagonal lines of 4 in the diagonal region each come-out edge faces', () => {
    const board = createBoard()
    // q0 (top arm): the NE diagonal (4,−4) → (7,−7), matching the entry on the
    // NE-facing edge; q1 is the rotated SE cluster.
    expect(board.bases[0]).toEqual([
      { x: 4, y: -4 },
      { x: 5, y: -5 },
      { x: 6, y: -6 },
      { x: 7, y: -7 },
    ])
    for (const cluster of board.bases) {
      expect(new Set(cluster.map(key)).size).toBe(4)
      for (let i = 0; i < 3; i++) {
        // Consecutive base holes are diagonal unit steps (squared distance 2).
        expect(sqDist(cluster[i], cluster[i + 1])).toBe(2)
      }
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
    expect(trackIndexFor(0, 0)).toBe(9) // the arm's come-out, not the seam
    expect(trackIndexFor(2, HOME_ENTRANCE_REL)).toBe(39) // arm 2's home entrance
    const expected = [
      [15, 31, 47, 63],
      [31, 47, 63, 15],
      [47, 63, 15, 31],
      [63, 15, 31, 47],
    ]
    for (let arm = 0; arm < 4; arm++) {
      for (const [k, distance] of CORNER_RELS.entries()) {
        expect(trackIndexFor(arm, distance)).toBe(expected[arm][k])
      }
    }
  })

  it("places each arm's four corners at relative distances 6/22/38/54", () => {
    const board = createBoard()
    for (let arm = 0; arm < 4; arm++) {
      const relatives = board.corners.map((c) => ((c - trackIndexFor(arm, 0)) % TRACK_LEN + TRACK_LEN) % TRACK_LEN)
      expect(new Set(relatives)).toEqual(new Set(CORNER_RELS))
      relatives.forEach((distance, k) => {
        expect(trackIndexFor(arm, distance)).toBe(board.corners[k])
      })
    }
  })

  it('shortcut entries are forward corners; exits land on the opposite diagonal (+32)', () => {
    for (const entry of SHORTCUT_ENTRIES) {
      expect(CORNER_RELS).toContain(entry)
      const exit = SHORTCUT_EXITS[entry]
      expect(CORNER_RELS).toContain(exit)
      // Diagonal opposites sit half a lap away: entry 6 → 38, entry 22 → 54.
      expect(exit - entry).toBe(TRACK_LEN / 2)
    }
  })

  it('the owner path is 0..62 then the lane: rel 63..66 are homes, never track', () => {
    const board = createBoard()
    expect(OWNER_TRACK_LEN).toBe(63)
    expect(LANE_START).toBe(63)
    expect(LANE_END).toBe(66)
    const homeKeys = new Set(board.homes.flat().map(key))
    for (let rel = LANE_START; rel <= LANE_END; rel++) {
      expect(homeKeys.has(key(board.homes[0][rel - LANE_START]))).toBe(true)
    }
  })
})

describe('bounds', () => {
  it('keeps every hole within |x| ≤ 8 and |y| ≤ 8', () => {
    const board = createBoard()
    const all = [...board.track, ...board.homes.flat(), ...board.bases.flat(), board.center]
    for (const h of all) {
      expect(Math.abs(h.x)).toBeLessThanOrEqual(8)
      expect(Math.abs(h.y)).toBeLessThanOrEqual(8)
    }
  })
})
