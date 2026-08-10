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
  entries: [number, number, number, number] // each arm's entry hole index (0, 13, 26, 39)
  homes: Hole[][] // [arm][0..3], index 0 = the innermost lane hole (distance 52)
  bases: Hole[][] // [arm][0..3]
  center: Hole // (0,0)
}

const HOLES_PER_QUADRANT = 13
const TRACK_HOLES = HOLES_PER_QUADRANT * 4 // 52

// Quadrant 0 (top arm), travel order: left edge ascending, tip left→right,
// right edge descending, then the corner in-step.
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
  { x: 2, y: -2 },
]

// Home lane, innermost first.
const Q0_HOME: Hole[] = [
  { x: 0, y: -2 },
  { x: 0, y: -3 },
  { x: 0, y: -4 },
  { x: 0, y: -5 },
]

// Base cluster, 2×2.
const Q0_BASE: Hole[] = [
  { x: -4, y: -4 },
  { x: -5, y: -4 },
  { x: -4, y: -5 },
  { x: -5, y: -5 },
]

// 90° clockwise in screen coordinates (+y down): (x, y) → (-y, x).
function rotate(h: Hole, times: number): Hole {
  let { x, y } = h
  for (let i = 0; i < times; i++) [x, y] = [-y, x]
  return { x, y }
}

// Absolute track index for a seat's arm + relative distance 0..51.
export function trackIndexFor(arm: number, distance: number): number {
  return (arm * HOLES_PER_QUADRANT + distance) % TRACK_HOLES
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
    trackIndexFor(0, 12),
    trackIndexFor(1, 12),
    trackIndexFor(2, 12),
    trackIndexFor(3, 12),
  ]
  const entries: [number, number, number, number] = [
    trackIndexFor(0, 0),
    trackIndexFor(1, 0),
    trackIndexFor(2, 0),
    trackIndexFor(3, 0),
  ]
  return { track, corners, entries, homes, bases, center: { x: 0, y: 0 } }
}
