import { describe, it, expect } from 'vitest'
import { rngNext, rngInt } from '../../src/engine/rng'

/**
 * The RNG must be a pure function of its numeric state: deterministic,
 * reproducible from a seed, and free of hidden mutable state. These properties
 * are what make whole sessions replayable, so they are pinned here.
 */
describe('rng (mulberry32)', () => {
  it('is deterministic for a given seed', () => {
    const a = rngNext(1)
    const b = rngNext(1)
    expect(a.value).toBe(b.value)
    expect(a.state).toBe(b.state)
  })

  it('produces the pinned sequence for seed 1', () => {
    const r0 = rngNext(1)
    expect(r0.value).toBeCloseTo(0.627073940588, 12)
    const r1 = rngNext(r0.state)
    expect(r1.value).toBeCloseTo(0.00273572118, 12)
    const r2 = rngNext(r1.state)
    expect(r2.value).toBeCloseTo(0.52744703996, 12)
  })

  it('returns values within [0, 1)', () => {
    let state = 12345 >>> 0
    for (let i = 0; i < 5000; i++) {
      const r = rngNext(state)
      expect(r.value).toBeGreaterThanOrEqual(0)
      expect(r.value).toBeLessThan(1)
      state = r.state
    }
  })

  it('advances state without holding a closure', () => {
    const first = rngNext(1)
    // A different call site with the SAME input yields the SAME output —
    // proof there is no accumulated internal state.
    expect(rngNext(1)).toEqual(first)
    expect(rngNext(first.state).value).not.toBe(first.value)
  })

  it('rngInt stays within [0, maxExclusive)', () => {
    let state = 999 >>> 0
    for (let i = 0; i < 5000; i++) {
      const r = rngInt(state, 397)
      expect(r.value).toBeGreaterThanOrEqual(0)
      expect(r.value).toBeLessThan(397)
      expect(Number.isInteger(r.value)).toBe(true)
      state = r.state
    }
  })

  it('rngInt handles a range of 1 and advances state', () => {
    const r = rngInt(42, 1)
    expect(r.value).toBe(0)
    expect(r.state).not.toBe(42)
  })

  it('rngInt handles maxExclusive <= 0 by returning 0 but advancing state', () => {
    const r = rngInt(42, 0)
    expect(r.value).toBe(0)
    expect(r.state).toBe(rngNext(42).state)
  })

  it('is roughly uniform across buckets', () => {
    const buckets = new Array<number>(10).fill(0)
    let state = 7 >>> 0
    const n = 100000
    for (let i = 0; i < n; i++) {
      const r = rngInt(state, 10)
      buckets[r.value]++
      state = r.state
    }
    const expected = n / 10
    for (const count of buckets) {
      // Within 10% of uniform is plenty for a smoke check.
      expect(Math.abs(count - expected)).toBeLessThan(expected * 0.1)
    }
  })
})
