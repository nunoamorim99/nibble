import { describe, it, expect } from 'vitest'
import { spawnFood } from '../../src/engine/food'
import { cellInList } from '../../src/engine/grid'
import type { GameConfig, Vec2 } from '../../src/engine/types'

/** Minimal config helper; only fields `spawnFood` reads matter here. */
function cfg(over: Partial<GameConfig> = {}): GameConfig {
  return {
    cols: 5,
    rows: 5,
    baseTicksPerSecond: 8,
    speedMultiplier: 1,
    wallsKill: true,
    wrapAround: false,
    obstacles: [],
    applesToAdvance: null,
    growthPerFood: 3,
    pointsPerFood: 10,
    seed: 1,
    ...over,
  }
}

describe('spawnFood', () => {
  it('never lands on the snake or an obstacle, across many seeds', () => {
    const snake: Vec2[] = [
      { x: 2, y: 2 },
      { x: 1, y: 2 },
    ]
    const obstacles: Vec2[] = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
    ]
    const config = cfg({ obstacles })
    for (let seed = 0; seed < 3000; seed++) {
      const { food } = spawnFood(snake, config, seed >>> 0)
      expect(food).not.toBeNull()
      expect(cellInList(food as Vec2, snake)).toBe(false)
      expect(cellInList(food as Vec2, obstacles)).toBe(false)
    }
  })

  it('always produces an in-bounds cell', () => {
    const config = cfg()
    for (let seed = 0; seed < 2000; seed++) {
      const { food } = spawnFood([], config, seed >>> 0)
      const f = food as Vec2
      expect(f.x).toBeGreaterThanOrEqual(0)
      expect(f.x).toBeLessThan(config.cols)
      expect(f.y).toBeGreaterThanOrEqual(0)
      expect(f.y).toBeLessThan(config.rows)
    }
  })

  it('returns the single remaining free cell when the board is nearly full', () => {
    // A 2x1 board with one cell occupied leaves exactly one free cell.
    const config = cfg({ cols: 2, rows: 1 })
    const occupied: Vec2[] = [{ x: 0, y: 0 }]
    const { food } = spawnFood(occupied, config, 123)
    expect(food).toEqual({ x: 1, y: 0 })
  })

  it('returns null (board full) and preserves rngState when no cell is free', () => {
    const config = cfg({ cols: 2, rows: 1 })
    const occupied: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]
    const result = spawnFood(occupied, config, 777)
    expect(result.food).toBeNull()
    // With no draw taken, the state passes through untouched.
    expect(result.rngState).toBe(777)
  })

  it('is deterministic and advances rngState on a successful spawn', () => {
    const config = cfg()
    const a = spawnFood([], config, 55)
    const b = spawnFood([], config, 55)
    expect(a.food).toEqual(b.food)
    expect(a.rngState).toBe(b.rngState)
    expect(a.rngState).not.toBe(55)
  })

  it('covers every free cell over enough seeds (uniform reach)', () => {
    // 3x3 board, center occupied -> 8 reachable free cells.
    const config = cfg({ cols: 3, rows: 3 })
    const occupied: Vec2[] = [{ x: 1, y: 1 }]
    const seen = new Set<string>()
    for (let seed = 0; seed < 5000; seed++) {
      const { food } = spawnFood(occupied, config, seed >>> 0)
      const f = food as Vec2
      seen.add(`${f.x},${f.y}`)
    }
    expect(seen.size).toBe(8)
    expect(seen.has('1,1')).toBe(false)
  })
})
