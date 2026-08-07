import { describe, expect, it } from 'vitest'
import { createRng } from './rng.ts'

describe('createRng', () => {
  it('produces identical sequences for the same seed', () => {
    const rng1 = createRng(1)
    const rng2 = createRng(1)
    for (let i = 0; i < 20; i++) {
      expect(rng1()).toBe(rng2())
    }
  })

  it('produces different sequences for different seeds', () => {
    const rng1 = createRng(1)
    const rng2 = createRng(2)
    let anyDiffer = false
    for (let i = 0; i < 5; i++) {
      if (rng1() !== rng2()) {
        anyDiffer = true
        break
      }
    }
    expect(anyDiffer).toBe(true)
  })

  it('produces values in [0, 1)', () => {
    const rng = createRng(42)
    for (let i = 0; i < 100; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('produces the exact known mulberry32 sequence for seed 1', () => {
    const rng = createRng(1)
    expect(rng()).toBeCloseTo(0.6270739405881613, 12)
    expect(rng()).toBeCloseTo(0.002735721180215478, 12)
    expect(rng()).toBeCloseTo(0.5274470399599522, 12)
  })
})
