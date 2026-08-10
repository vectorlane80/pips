// Pure board geometry for Wahoo, in unit space: 1 unit = one hole spacing,
// +x right, +y down (screen convention), origin at the board center. The full
// board is generated from ONE quadrant (the top arm) rotated 4× by 90°
// clockwise — never hand-typed per arm.

export interface Hole {
  x: number
  y: number
}

export interface WahooBoard {
  track: Hole[] // 52, travel order
  corners: [number, number, number, number] // absolute track indices of each quadrant's corner (12, 25, 38, 51)
  entries: [number, number, number, number] // each arm's come-out hole index (10, 23, 36, 49)
  entrances: [number, number, number, number] // each arm's home-entrance (branch) hole index (9, 22, 35, 48)
  homes: Hole[][] // [arm][0..3], index 0 = the outermost lane hole (distance 52, adjacent to the entrance)
  bases: Hole[][] // [arm][0..3]
  center: Hole // (0,0)
}

const HOLES_PER_QUADRANT = 13
const TRACK_HOLES = HOLES_PER_QUADRANT * 4 // 52
// Each quadrant's come-out hole sits 10 steps after the quadrant's first hole
// (two before its corner), so an arm's relative distance 0 is absolute
// arm*13 + 10.
const ENTRY_OFFSET = 10

// Quadrant 0 (top arm), travel order (clockwise, +y down): left edge
// descending, tip left→right, right edge ascending; the last hole is this
// quadrant's corner, one √2 step from the next quadrant's first hole.
const Q0_TRACK: Hole[] = [
  { x: -1, y: -2 },
  { x: -1, y: -3 },
  { x: -1, y: -4 },
  { x: -1, y: -5 },
  { x: -1, y: -6 },
  { x: -1, y: -7 },
  { x: 0, y: -7 },
  { x: 1, y: -7 },
  { x: 1, y: -6 },
  { x: 1, y: -5 },
  { x: 1, y: -4 },
  { x: 1, y: -3 },
  { x: 1, y: -2 },
]

// Home lane, outermost first: index 0 is relative 52, adjacent to the home
// entrance hole on the arm's inbound edge; index 3 is relative 55, deepest
// (nearest the center).
const Q0_HOME: Hole[] = [
  { x: 0, y: -5 },
  { x: 0, y: -4 },
  { x: 0, y: -3 },
  { x: 0, y: -2 },
]

// Base cluster, 2×2, in the diagonal region the come-out edge faces.
const Q0_BASE: Hole[] = [
  { x: 4, y: -4 },
  { x: 4, y: -5 },
  { x: 5, y: -4 },
  { x: 5, y: -5 },
]

// 90° clockwise in screen coordinates (+y down): (x, y) → (-y, x).
function rotate(h: Hole, times: number): Hole {
  let { x, y } = h
  for (let i = 0; i < times; i++) [x, y] = [-y, x]
  return { x, y }
}

// Absolute track index for a seat's arm + relative distance 0..51 (relative 0
// is the arm's come-out hole; relative 51 is its home entrance).
export function trackIndexFor(arm: number, distance: number): number {
  return (arm * HOLES_PER_QUADRANT + ENTRY_OFFSET + distance) % TRACK_HOLES
}

// Deterministic and cheap — no caching needed.
export function createBoard(): WahooBoard {
  const track: Hole[] = []
  const homes: Hole[][] = []
  const bases: Hole[][] = []
  for (let q = 0; q < 4; q++) {
    track.push(...Q0_TRACK.map((h) => rotate(h, q)))
    homes.push(Q0_HOME.map((h) => rotate(h, q)))
    bases.push(Q0_BASE.map((h) => rotate(h, q)))
  }
  const corners: [number, number, number, number] = [
    trackIndexFor(0, 2),
    trackIndexFor(1, 2),
    trackIndexFor(2, 2),
    trackIndexFor(3, 2),
  ]
  const entries: [number, number, number, number] = [
    trackIndexFor(0, 0),
    trackIndexFor(1, 0),
    trackIndexFor(2, 0),
    trackIndexFor(3, 0),
  ]
  const entrances: [number, number, number, number] = [
    trackIndexFor(0, 51),
    trackIndexFor(1, 51),
    trackIndexFor(2, 51),
    trackIndexFor(3, 51),
  ]
  return { track, corners, entries, entrances, homes, bases, center: { x: 0, y: 0 } }
}
