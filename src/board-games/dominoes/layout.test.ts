import { describe, expect, it } from 'vitest'
import { layoutBoard, scaleToFit, type LaidTile } from './layout.ts'
import type { DominoArm, PlacedTile } from './state.ts'

const emptyArms = (): Record<DominoArm, PlacedTile[]> => ({ right: [], left: [], up: [], down: [] })

function placed(inner: number, outer: number, isDouble = false): PlacedTile {
  return { inner, outer, isDouble }
}

// Strict interior intersection — shared edges do not count.
function interiorOverlap(a: LaidTile, b: LaidTile): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2
}

describe('layoutBoard', () => {
  it('lays a non-double lead 2×1 at the origin with two targets', () => {
    const layout = layoutBoard({ a: 6, b: 4 }, false, emptyArms())
    expect(layout.tiles).toHaveLength(1)
    expect(layout.tiles[0]).toMatchObject({
      x: 0,
      y: 0,
      w: 2,
      h: 1,
      horizontal: true,
      inner: 6,
      outer: 4,
      isDouble: false,
      dir: 'right',
    })
    expect(layout.targets).toEqual([
      { arm: 'right', x: 2, y: 0, r: 0.8 },
      { arm: 'left', x: -2, y: 0, r: 0.8 },
    ])
  })

  it('lays a spinner lead crosswise with four targets', () => {
    const layout = layoutBoard({ a: 5, b: 5 }, true, emptyArms())
    expect(layout.tiles[0]).toMatchObject({
      x: 0,
      y: 0,
      w: 1,
      h: 2,
      horizontal: false,
      isDouble: true,
      dir: 'right',
    })
    expect(layout.targets).toEqual([
      { arm: 'right', x: 1.5, y: 0, r: 0.8 },
      { arm: 'left', x: -1.5, y: 0, r: 0.8 },
      { arm: 'up', x: 0, y: -2, r: 0.8 },
      { arm: 'down', x: 0, y: 2, r: 0.8 },
    ])
  })

  it('lays a single center target on an empty board', () => {
    const layout = layoutBoard(null, false, emptyArms())
    expect(layout.tiles).toEqual([])
    expect(layout.targets).toEqual([{ arm: 'center', x: 0, y: 0, r: 0.8 }])
    expect([layout.minX, layout.maxX, layout.minY, layout.maxY]).toEqual([-0.8, 0.8, -0.8, 0.8])
  })

  it('advances a right arm of three non-doubles by one tile length each', () => {
    const layout = layoutBoard({ a: 6, b: 4 }, false, {
      ...emptyArms(),
      right: [placed(4, 5), placed(5, 3), placed(3, 2)],
    })
    expect(layout.tiles.slice(1).map((t) => [t.x, t.y])).toEqual([
      [2, 0],
      [4, 0],
      [6, 0],
    ])
    // inner faces back toward the center; the run travels right
    expect(layout.tiles[1]).toMatchObject({ inner: 4, outer: 5, horizontal: true, dir: 'right' })
    expect(layout.targets[0]).toEqual({ arm: 'right', x: 8, y: 0, r: 0.8 })
  })

  it('places doubles crosswise consuming one unit of run length', () => {
    const layout = layoutBoard({ a: 6, b: 4 }, false, {
      ...emptyArms(),
      right: [placed(4, 5), placed(5, 5, true), placed(5, 2)],
    })
    const [first, dbl, last] = layout.tiles.slice(1)
    expect([first.x, dbl.x, last.x]).toEqual([2, 3.5, 5])
    expect(first).toMatchObject({ w: 2, h: 1, horizontal: true, isDouble: false })
    expect(dbl).toMatchObject({ w: 1, h: 2, horizontal: false, isDouble: true })
    expect(last).toMatchObject({ w: 2, h: 1, horizontal: true })
    // run length 5 units (cursor 1 → 6); target sits 1 unit beyond
    expect(layout.targets[0]).toEqual({ arm: 'right', x: 7, y: 0, r: 0.8 })
  })

  it('bends a right arm up once it would cross H_MAX = 11', () => {
    const layout = layoutBoard({ a: 6, b: 4 }, false, {
      ...emptyArms(),
      right: [
        placed(4, 5),
        placed(5, 3),
        placed(3, 2),
        placed(2, 1),
        placed(1, 0),
        placed(0, 6),
        placed(6, 6, true),
      ],
    })
    const arm = layout.tiles.slice(1)
    expect(arm).toHaveLength(7)
    // five non-doubles advance +x at y = 0
    expect(arm.slice(0, 5).map((t) => [t.x, t.y])).toEqual([
      [2, 0],
      [4, 0],
      [6, 0],
      [8, 0],
      [10, 0],
    ])
    expect(arm.slice(0, 5).every((t) => t.horizontal && t.dir === 'right')).toBe(true)
    // the sixth triggers the bend: the vertical run sits half a unit beyond the
    // straight run's end, its near edge flush with the last straight tile
    expect(arm[5]).toMatchObject({ x: 11.5, y: -0.5, w: 1, h: 2, horizontal: false, dir: 'up' })
    // a double after the bend sits crosswise to the vertical run: 2 wide × 1 tall
    expect(arm[6]).toMatchObject({ x: 11.5, y: -2, w: 2, h: 1, horizontal: true, isDouble: true, dir: 'up' })
    // no tile's x-extent exceeds the straight-run threshold plus the bend's
    // cross-axis offset: the bent run overhangs +1 beyond H_MAX and a
    // crosswise double adds another half unit
    const maxExtent = Math.max(...layout.tiles.map((t) => t.x + t.w / 2))
    expect(maxExtent).toBeLessThanOrEqual(12.5)
    expect(layout.targets[0]).toEqual({ arm: 'right', x: 11.5, y: -3.5, r: 0.8 })
  })

  it('bends arms in the pinwheel direction', () => {
    const layout = layoutBoard({ a: 5, b: 5 }, true, {
      ...emptyArms(),
      left: [placed(5, 4), placed(4, 3), placed(3, 2), placed(2, 1), placed(1, 0), placed(0, 6)],
      up: [placed(5, 4), placed(4, 3)],
      down: [placed(5, 4), placed(4, 3)],
    })
    // tiles: center, right (empty), left (6), up (2), down (2)
    const left = layout.tiles.slice(1, 7)
    const up = layout.tiles.slice(7, 9)
    const down = layout.tiles.slice(9, 11)
    // left arm travels −x, then bends down (left→down), offset half a unit
    // beyond the straight run's end
    expect(left.slice(0, 5).every((t) => t.dir === 'left' && t.y === 0)).toBe(true)
    expect(left[5]).toMatchObject({ x: -11, y: 0.5, dir: 'down', horizontal: false })
    // up arm travels −y, then bends left (up→left)
    expect(up[0]).toMatchObject({ y: -2, dir: 'up' })
    expect(up[1]).toMatchObject({ x: -0.5, y: -3.5, dir: 'left', horizontal: true })
    // down arm travels +y, then bends right (down→right)
    expect(down[0]).toMatchObject({ y: 2, dir: 'down' })
    expect(down[1]).toMatchObject({ x: 0.5, y: 3.5, dir: 'right', horizontal: true })
  })

  it('keeps a busy board free of overlaps', () => {
    const arms = {
      right: [placed(5, 4), placed(4, 4, true), placed(4, 3), placed(3, 2), placed(2, 1), placed(1, 0)],
      left: [placed(5, 4), placed(4, 3), placed(3, 2), placed(2, 1), placed(1, 0), placed(0, 6)],
      up: [placed(5, 4), placed(4, 3), placed(3, 3, true), placed(3, 2)],
      down: [placed(5, 4), placed(4, 3), placed(3, 2), placed(2, 2, true)],
    }
    const layout = layoutBoard({ a: 5, b: 5 }, true, arms)
    // every arm is long enough that at least one bends
    expect(layout.tiles.some((t) => t.dir === 'up' || t.dir === 'down')).toBe(true)

    // the full guarantee: no two tiles on the busy board intersect in their
    // interiors — straight runs, cross-arm neighbours, and every bend corner
    // included (shared edges do not count)
    for (let i = 0; i < layout.tiles.length; i++) {
      for (let j = i + 1; j < layout.tiles.length; j++) {
        expect(interiorOverlap(layout.tiles[i], layout.tiles[j])).toBe(false)
      }
    }
  })
})

describe('scaleToFit', () => {
  it('includes targets in the bounds and fits a small board at scale 1', () => {
    const small = layoutBoard({ a: 6, b: 4 }, false, emptyArms())
    // bounds cover tile footprints AND target circles (targets at (±2, 0), r = 0.8)
    expect([small.minX, small.maxX, small.minY, small.maxY]).toEqual([-2.8, 2.8, -0.8, 0.8])
    expect(scaleToFit(small, 800, 600, 20)).toBe(1)
  })

  it('scales a huge board down but never below 0.7', () => {
    const huge = layoutBoard({ a: 5, b: 5 }, true, {
      ...emptyArms(),
      right: Array.from({ length: 20 }, () => placed(5, 4)),
    })
    const heightUnits = huge.maxY - huge.minY + 2
    // 600×600 @ 20 px/unit: the height is the binding constraint
    const s = scaleToFit(huge, 600, 600, 20)
    expect(s).toBe(600 / (heightUnits * 20))
    expect(s).toBeLessThan(1)
    expect(s).toBeGreaterThanOrEqual(0.7)
    // a tiny pane would need less than 0.7 → clamped to the floor
    expect(scaleToFit(huge, 100, 100, 20)).toBe(0.7)
  })
})
