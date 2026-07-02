import { describe, it, expect } from 'vitest'
import { LEVELS, levelToGameConfig, validateLevel, type LevelConfig } from '../../src/levels'
import {
  CLASSIC_CONFIG,
  applyTurn,
  cellInList,
  cellOnSnake,
  createInitialState,
  step,
  type GameConfig,
  type GameState,
  type Vec2,
} from '../../src/engine'

const TEST_SEED = 42

describe('LEVELS — data validity', () => {
  it.each(LEVELS.map((level) => [level.id, level] as const))(
    'level %s passes validateLevel with no problems',
    (id, level) => {
      const problems = validateLevel(level)
      expect(problems, `level "${id}" reported problems: ${problems.join('; ')}`).toEqual([])
    },
  )

  it('has exactly 8 entries', () => {
    expect(LEVELS.length).toBe(8)
  })

  it('has unique ids', () => {
    const ids = LEVELS.map((level) => level.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('applesToAdvance is non-decreasing across the set', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      const prev = LEVELS[i - 1]
      const curr = LEVELS[i]
      expect(
        curr.applesToAdvance,
        `applesToAdvance regressed from "${prev.id}" (${prev.applesToAdvance}) to "${curr.id}" (${curr.applesToAdvance})`,
      ).toBeGreaterThanOrEqual(prev.applesToAdvance)
    }
  })

  it('speedMultiplier is non-decreasing across the set', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      const prev = LEVELS[i - 1]
      const curr = LEVELS[i]
      expect(
        curr.speedMultiplier,
        `speedMultiplier regressed from "${prev.id}" (${prev.speedMultiplier}) to "${curr.id}" (${curr.speedMultiplier})`,
      ).toBeGreaterThanOrEqual(prev.speedMultiplier)
    }
  })

  it('speedMultiplier stays within (0.5, 1.5] for every level', () => {
    for (const level of LEVELS) {
      expect(
        level.speedMultiplier,
        `level "${level.id}" speedMultiplier ${level.speedMultiplier} out of (0.5, 1.5]`,
      ).toBeGreaterThan(0.5)
      expect(
        level.speedMultiplier,
        `level "${level.id}" speedMultiplier ${level.speedMultiplier} out of (0.5, 1.5]`,
      ).toBeLessThanOrEqual(1.5)
    }
  })
})

describe('levelToGameConfig', () => {
  const sample: LevelConfig = LEVELS[2] // level-3: has obstacles + wrapAround + wallsKill:false

  it('preserves the CLASSIC_CONFIG fields a level does not own', () => {
    const config = levelToGameConfig(sample, TEST_SEED)
    expect(config.baseTicksPerSecond).toBe(CLASSIC_CONFIG.baseTicksPerSecond)
    expect(config.growthPerFood).toBe(CLASSIC_CONFIG.growthPerFood)
    expect(config.pointsPerFood).toBe(CLASSIC_CONFIG.pointsPerFood)
  })

  it('applies the level\'s own grid, flags, obstacles, and apple target', () => {
    const config = levelToGameConfig(sample, TEST_SEED)
    expect(config.cols).toBe(sample.cols)
    expect(config.rows).toBe(sample.rows)
    expect(config.applesToAdvance).toBe(sample.applesToAdvance)
    expect(config.speedMultiplier).toBe(sample.speedMultiplier)
    expect(config.wallsKill).toBe(sample.wallsKill)
    expect(config.wrapAround).toBe(sample.wrapAround)
    expect(config.obstacles).toEqual(sample.obstacles)
  })

  it('sets the given seed', () => {
    expect(levelToGameConfig(sample, TEST_SEED).seed).toBe(TEST_SEED)
    expect(levelToGameConfig(sample, 999).seed).toBe(999)
  })

  it('does the same field assembly for every level in LEVELS', () => {
    for (const level of LEVELS) {
      const config = levelToGameConfig(level, TEST_SEED)
      expect(config).toEqual<GameConfig>({
        ...CLASSIC_CONFIG,
        cols: level.cols,
        rows: level.rows,
        applesToAdvance: level.applesToAdvance,
        speedMultiplier: level.speedMultiplier,
        wallsKill: level.wallsKill,
        wrapAround: level.wrapAround,
        obstacles: level.obstacles,
        seed: TEST_SEED,
      })
    }
  })
})

describe('LEVELS — engine integration', () => {
  it.each(LEVELS.map((level) => [level.id, level] as const))(
    'level %s: createInitialState yields a running state with food/snake clear of obstacles',
    (id, level) => {
      const config = levelToGameConfig(level, TEST_SEED)
      const state = createInitialState(config)

      expect(state.status, `level "${id}" did not start running`).toBe('running')

      // Snake must not overlap any obstacle at spawn.
      for (const obstacle of level.obstacles) {
        expect(
          cellOnSnake(obstacle, state.snake),
          `level "${id}": snake overlaps obstacle (${obstacle.x}, ${obstacle.y}) at spawn`,
        ).toBe(false)
      }

      // Food must exist (grid is large relative to a length-3 snake + sparse
      // obstacles) and must not land on the snake or an obstacle.
      expect(state.food, `level "${id}": no food spawned`).not.toBeNull()
      const food = state.food as Vec2
      expect(
        cellOnSnake(food, state.snake),
        `level "${id}": food spawned on the snake at (${food.x}, ${food.y})`,
      ).toBe(false)
      expect(
        cellInList(food, level.obstacles),
        `level "${id}": food spawned on an obstacle at (${food.x}, ${food.y})`,
      ).toBe(false)
    },
  )

  it('every level starts a running state across many seeds (food/snake/obstacle safety holds broadly)', () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 25; seed++) {
        const state = createInitialState(levelToGameConfig(level, seed))
        expect(state.status).toBe('running')
        const food = state.food as Vec2
        expect(cellOnSnake(food, state.snake)).toBe(false)
        expect(cellInList(food, level.obstacles)).toBe(false)
        for (const obstacle of level.obstacles) {
          expect(cellOnSnake(obstacle, state.snake)).toBe(false)
        }
      }
    }
  })

  it('reaching applesToAdvance through the level pipeline (levelToGameConfig) wins the session', () => {
    // A minimal custom LevelConfig — small grid, no obstacles, one apple to
    // advance — proves level completion flows correctly through
    // levelToGameConfig, not just through a hand-built GameConfig.
    const miniLevel: LevelConfig = {
      id: 'test-mini-level',
      name: 'Test Mini Level',
      cols: 12,
      rows: 12,
      applesToAdvance: 1,
      speedMultiplier: 1,
      wallsKill: true,
      wrapAround: false,
      obstacles: [],
    }

    let state: GameState = createInitialState(levelToGameConfig(miniLevel, TEST_SEED))
    expect(state.status).toBe('running')
    expect(state.applesEaten).toBe(0)

    const opposite: Record<'up' | 'down' | 'left' | 'right', 'up' | 'down' | 'left' | 'right'> = {
      up: 'down',
      down: 'up',
      left: 'right',
      right: 'left',
    }
    const vectors: Record<'up' | 'down' | 'left' | 'right', Vec2> = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    }

    /**
     * Pick a direction that (a) is not the illegal 180 reversal of the
     * currently committed direction and (b) keeps the head in bounds, biased
     * toward closing the larger remaining gap to the food first. `wallsKill`
     * is true and `wrapAround` is false on `miniLevel`, so bounds-safety is
     * necessary — a pure greedy-toward-food walker can drive itself into a
     * wall before reaching the food on a small grid.
     */
    function chooseSafeDirection(current: GameState): 'up' | 'down' | 'left' | 'right' {
      const head = current.snake[0]
      const food = current.food as Vec2
      const dx = food.x - head.x
      const dy = food.y - head.y

      const candidates: Array<'up' | 'down' | 'left' | 'right'> =
        Math.abs(dx) >= Math.abs(dy)
          ? [dx >= 0 ? 'right' : 'left', dy >= 0 ? 'down' : 'up', dy < 0 ? 'down' : 'up', dx < 0 ? 'right' : 'left']
          : [dy >= 0 ? 'down' : 'up', dx >= 0 ? 'right' : 'left', dx < 0 ? 'right' : 'left', dy < 0 ? 'down' : 'up']

      for (const dir of candidates) {
        if (dir === opposite[current.direction]) continue
        const vec = vectors[dir]
        const next: Vec2 = { x: head.x + vec.x, y: head.y + vec.y }
        const inBounds =
          next.x >= 0 && next.x < current.config.cols && next.y >= 0 && next.y < current.config.rows
        if (inBounds) return dir
      }
      // Fall back to straight ahead if every candidate above was rejected
      // (should not happen on this open, obstacle-free mini level).
      return current.direction
    }

    // Walk the snake toward the food one tick at a time, steering with
    // applyTurn/step (never teleporting state), until it eats the first
    // apple and the level-configured win condition fires.
    let guard = 0
    const maxTicks = miniLevel.cols * miniLevel.rows * 4
    while (state.status === 'running' && guard < maxTicks) {
      const desired = chooseSafeDirection(state)
      state = step(applyTurn(state, desired))
      guard += 1
    }

    expect(guard, 'walk toward food exceeded the guard budget — engine likely stuck').toBeLessThan(maxTicks)
    expect(state.status).toBe('won')
    expect(state.applesEaten).toBeGreaterThanOrEqual(miniLevel.applesToAdvance)
  })
})
