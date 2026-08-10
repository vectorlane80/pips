// Pure board geometry for Wahoo, in unit space: 1 unit = one hole spacing,
// +x right, +y down (screen convention), origin at the board center. The full
// board is generated from ONE quadrant (the top arm) rotated 4× by 90°
// clockwise — never hand-typed per arm.
//
// Topology v4 (spec 18q), faithful to the designer's dot diagram: arms are
// FIVE holes wide (x = −2..2), adjacent arms SHARE their inner corner hole
// ((±2, ±2) are track), and the track is 64 holes. Each seat comes out at
// ITS OWN ARM'S TIP CORNER on the side facing its base (quadrant index 9 —
// (2,−8) for the top arm); the home entrance is the MIDDLE of the arm's own
// tip row (index 7), two holes before the come-out in travel order, so the
// owner path runs rel 0..62 and the lane hangs inward from the entrance
// toward the center. Bases are diagonal lines of 4.

export interface Hole {
  x: number
  y: number
}

// One exported set of board constants — state.ts, rules.ts, the screen, and
// the tests all import these instead of re-hardcoding the topology.
export const TRACK_LEN = 64
export const OWNER_TRACK_LEN = 63 // owner path: rel 0..62 then lane
export const HOME_ENTRANCE_REL = 62 // = the own-arm tip middle
export const LANE_START = 63 // lane rel 63..66 (deepest 66)
export const LANE_END = 66
export const CORNER_RELS = [6, 22, 38, 54] as const // own corner is rel 6
export const SHORTCUT_ENTRIES = [6, 22] as const // forward-diagonal corners
export const SHORTCUT_EXITS = { 6: 38, 22: 54 } as const // +32 diagonals

export interface WahooBoard {
  track: Hole[] // 64, travel order
  corners: [number, number, number, number] // absolute track indices of each quadrant's shared corner (15, 31, 47, 63)
  entries: [number, number, number, number] // each arm's come-out hole index (9, 25, 41, 57)
  entrances: [number, number, number, number] // each arm's home-entrance (tip middle) hole index (7, 23, 39, 55)
  homes: Hole[][] // [arm][0..3], index 0 = the outermost lane hole (relative 63, adjacent to the entrance)
  bases: Hole[][] // [arm][0..3]
  center: Hole // (0,0)
}

const HOLES_PER_QUADRANT = TRACK_LEN / 4 // 16
// Each quadrant's come-out hole is the tip corner on the side facing the base,
// quadrant index 9 in travel order, so an arm's relative distance 0 is
// absolute arm*16 + 9.
const ENTRY_OFFSET = 9

// Quadrant 0 (top arm), travel order (clockwise, +y down): left edge
// descending, tip left→right, right edge ascending; the last hole is this
// quadrant's SHARED corner hole, one unit step from the next quadrant's first
// hole (the shared corners make the whole circuit unit steps — no diagonals).
// The come-out (relative 0) is the tip-right corner, index 9; the home
// entrance (index 7) is two holes before it in travel order.
const Q0_TRACK: Hole[] = [
  { x: -2, y: -3 },
  { x: -2, y: -4 },
  { x: -2, y: -5 },
  { x: -2, y: -6 },
  { x: -2, y: -7 },
  { x: -2, y: -8 }, // tip-left corner
  { x: -1, y: -8 }, // tip middle
  { x: 0, y: -8 }, // tip middle — the HOME ENTRANCE for this arm's owner
  { x: 1, y: -8 }, // tip middle
  { x: 2, y: -8 }, // tip-right corner — the COME-OUT (entry) for this arm's owner
  { x: 2, y: -7 },
  { x: 2, y: -6 },
  { x: 2, y: -5 },
  { x: 2, y: -4 },
  { x: 2, y: -3 },
  { x: 2, y: -2 }, // NE shared corner — also quadrant 1's starting corner
]

// Home lane, hanging INWARD from the entrance (tip middle): index 0 is
// relative 63, the hole adjacent below the entrance; index 3 is relative 66,
// deepest (nearest the center).
const Q0_HOME: Hole[] = [
  { x: 0, y: -7 },
  { x: 0, y: -6 },
  { x: 0, y: -5 },
  { x: 0, y: -4 },
]

// Base cluster: a DIAGONAL line of 4, outward from the diagonal region the
// come-out (the tip corner on the arm's NE side) faces.
const Q0_BASE: Hole[] = [
  { x: 4, y: -4 },
  { x: 5, y: -5 },
  { x: 6, y: -6 },
  { x: 7, y: -7 },
]

// 90° clockwise in screen coordinates (+y down): (x, y) → (-y, x).
function rotate(h: Hole, times: number): Hole {
  let { x, y } = h
  for (let i = 0; i < times; i++) [x, y] = [-y, x]
  return { x, y }
}

// Absolute track index for a seat's arm + relative distance 0..62 (relative 0
// is the arm's come-out, the tip corner facing its base; relative 62 is its
// home entrance). Relative 63..66 are the home lane — lane marbles have no
// absolute track index.
export function trackIndexFor(arm: number, distance: number): number {
  return (arm * HOLES_PER_QUADRANT + ENTRY_OFFSET + distance) % TRACK_LEN
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
    trackIndexFor(0, CORNER_RELS[0]),
    trackIndexFor(1, CORNER_RELS[0]),
    trackIndexFor(2, CORNER_RELS[0]),
    trackIndexFor(3, CORNER_RELS[0]),
  ]
  const entries: [number, number, number, number] = [
    trackIndexFor(0, 0),
    trackIndexFor(1, 0),
    trackIndexFor(2, 0),
    trackIndexFor(3, 0),
  ]
  const entrances: [number, number, number, number] = [
    trackIndexFor(0, HOME_ENTRANCE_REL),
    trackIndexFor(1, HOME_ENTRANCE_REL),
    trackIndexFor(2, HOME_ENTRANCE_REL),
    trackIndexFor(3, HOME_ENTRANCE_REL),
  ]
  return { track, corners, entries, entrances, homes, bases, center: { x: 0, y: 0 } }
}
