import type { DominoArm, PlacedTile } from './state.ts'

// Pure board geometry in unit space: 1 unit = one half-tile square (a tile is
// 2×1 units), origin = the opening tile's center, +x right, +y down. The
// screen layer multiplies by a pixel scale and centers the bounds in the pane.

export interface LaidTile {
  x: number
  y: number // center, units
  w: number
  h: number // footprint, units
  horizontal: boolean // run orientation of THIS tile (doubles: the crosswise orientation actually drawn)
  inner: number
  outer: number // pip halves; inner faces back toward the start of the arm
  isDouble: boolean
  // direction the run was travelling when this tile was placed — the screen
  // uses it to decide which half of the tile art shows `inner`
  dir: 'right' | 'left' | 'up' | 'down'
}

export interface EndTarget {
  arm: DominoArm | 'center'
  x: number
  y: number
  r: number
}

export interface BoardLayout {
  tiles: LaidTile[] // center tile first, then arms in order right,left,up,down
  targets: EndTarget[] // one per open arm (4 when spinner, 2 otherwise); single center target when no center
  minX: number
  maxX: number
  minY: number
  maxY: number // bounds over tile footprints AND targets
}

const H_MAX = 11 // horizontal travel limit from origin, units
const V_MAX = 4 // vertical travel limit from origin, units
const TARGET_R = 0.8

const DIR: Record<DominoArm, { x: number; y: number }> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
}

// Pinwheel: right→up, up→left, left→down, down→right.
const BEND: Record<DominoArm, DominoArm> = {
  right: 'up',
  up: 'left',
  left: 'down',
  down: 'right',
}

const ARM_ORDER: DominoArm[] = ['right', 'left', 'up', 'down']

function armStart(arm: DominoArm, isSpinner: boolean): { x: number; y: number } {
  if (arm === 'right') return { x: isSpinner ? 0.5 : 1, y: 0 }
  if (arm === 'left') return { x: isSpinner ? -0.5 : -1, y: 0 }
  if (arm === 'up') return { x: 0, y: -1 }
  return { x: 0, y: 1 }
}

interface ArmRun {
  tiles: LaidTile[]
  cursorX: number
  cursorY: number
  dirX: number
  dirY: number
}

function layArm(arm: DominoArm, isSpinner: boolean, placed: PlacedTile[]): ArmRun {
  const start = armStart(arm, isSpinner)
  let x = start.x
  let y = start.y
  let dir = arm
  let bent = false
  const tiles: LaidTile[] = []
  for (const p of placed) {
    const d = DIR[dir]
    const len = p.isDouble ? 1 : 2
    // Before placing, bend if advancing would push the cursor's distance from
    // origin along the current direction beyond the travel limit. At most one
    // bend per arm — beyond that the screen's scale clamp absorbs the rest.
    if (!bent && x * d.x + y * d.y + len > (d.x !== 0 ? H_MAX : V_MAX)) {
      dir = BEND[dir]
      bent = true
      // Physical corner: the bent run sits flush BESIDE the straight run's end.
      // Shift the cursor half a unit along the old direction and half a unit
      // back along the new one, so the first bent tile's near edge meets the
      // last straight tile's end edge instead of overlapping it.
      x += d.x * 0.5 - DIR[dir].x * 0.5
      y += d.y * 0.5 - DIR[dir].y * 0.5
    }
    const nd = DIR[dir]
    const cx = x + nd.x * (len / 2)
    const cy = y + nd.y * (len / 2)
    const runHorizontal = dir === 'right' || dir === 'left'
    const horizontal = runHorizontal !== p.isDouble
    tiles.push({
      x: cx,
      y: cy,
      w: horizontal ? 2 : 1,
      h: horizontal ? 1 : 2,
      horizontal,
      inner: p.inner,
      outer: p.outer,
      isDouble: p.isDouble,
      dir,
    })
    x += nd.x * len
    y += nd.y * len
  }
  const fd = DIR[dir]
  return { tiles, cursorX: x, cursorY: y, dirX: fd.x, dirY: fd.y }
}

export function layoutBoard(
  center: { a: number; b: number } | null,
  isSpinner: boolean,
  arms: Record<DominoArm, PlacedTile[]>,
): BoardLayout {
  const tiles: LaidTile[] = []
  const targets: EndTarget[] = []
  if (center === null) {
    targets.push({ arm: 'center', x: 0, y: 0, r: TARGET_R })
  } else {
    tiles.push({
      x: 0,
      y: 0,
      w: isSpinner ? 1 : 2,
      h: isSpinner ? 2 : 1,
      horizontal: !isSpinner,
      inner: center.a,
      outer: center.b,
      isDouble: center.a === center.b,
      dir: 'right',
    })
    const openArms: DominoArm[] = isSpinner ? ARM_ORDER : ['right', 'left']
    for (const arm of openArms) {
      const run = layArm(arm, isSpinner, arms[arm])
      tiles.push(...run.tiles)
      // Targets sit 1 unit beyond the arm's final cursor, on its current axis.
      targets.push({ arm, x: run.cursorX + run.dirX, y: run.cursorY + run.dirY, r: TARGET_R })
    }
  }
  const first = targets[0]
  let minX = first.x - first.r
  let maxX = first.x + first.r
  let minY = first.y - first.r
  let maxY = first.y + first.r
  for (const t of tiles) {
    minX = Math.min(minX, t.x - t.w / 2)
    maxX = Math.max(maxX, t.x + t.w / 2)
    minY = Math.min(minY, t.y - t.h / 2)
    maxY = Math.max(maxY, t.y + t.h / 2)
  }
  for (let i = 1; i < targets.length; i++) {
    minX = Math.min(minX, targets[i].x - targets[i].r)
    maxX = Math.max(maxX, targets[i].x + targets[i].r)
    minY = Math.min(minY, targets[i].y - targets[i].r)
    maxY = Math.max(maxY, targets[i].y + targets[i].r)
  }
  return { tiles, targets, minX, maxX, minY, maxY }
}

// Largest scale ≤ 1 that fits the bounds (padded by 1 unit each side) into
// paneW×paneH at unitPx pixels per unit, clamped to ≥ 0.7.
export function scaleToFit(layout: BoardLayout, paneW: number, paneH: number, unitPx: number): number {
  const widthUnits = layout.maxX - layout.minX + 2
  const heightUnits = layout.maxY - layout.minY + 2
  const scale = Math.min(1, paneW / (widthUnits * unitPx), paneH / (heightUnits * unitPx))
  return Math.max(0.7, scale)
}
