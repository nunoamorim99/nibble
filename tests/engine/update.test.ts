import { describe, it, expect } from 'vitest'
import {
  CLASSIC_CONFIG,
  createInitialState,
  applyTurn,
  step,
  ticksPerSecond,
} from '../../src/engine/update'
import type {
  Direction,
  GameConfig,
  GameState,
  Vec2,
} from '../../src/engine/types'

/** Build a config from CLASSIC with overrides. */
function cfg(over: Partial<GameConfig> = {}): GameConfig {
  return { ...CLASSIC_CONFIG, ...over }
}

/**
 * Build a running GameState directly so movement/collision traces do not
 * depend on RNG-placed food. `food` defaults to null (off-board) so eating
 * never interferes unless a test opts in.
 */
function makeState(over: Partial<GameState> & { snake: Vec2[] }): GameState {
  const config = over.config ?? CLASSIC_CONFIG
  const direction = over.direction ?? 'right'
  return {
    config,
    tick: over.tick ?? 0,
    snake: over.snake,
    direction,
    nextDirection: over.nextDirection ?? direction,
    pendingGrowth: over.pendingGrowth ?? 0,
    food: over.food ?? null,
    score: over.score ?? 0,
    applesEaten: over.applesEaten ?? 0,
    status: over.status ?? 'running',
    deathCause: over.deathCause ?? null,
    rngState: over.rngState ?? 1,
  }
}

describe('ticksPerSecond', () => {
  it('multiplies base rate by speedMultiplier', () => {
    expect(ticksPerSecond(CLASSIC_CONFIG)).toBe(8)
    expect(ticksPerSecond(cfg({ speedMultiplier: 2 }))).toBe(16)
    expect(ticksPerSecond(cfg({ baseTicksPerSecond: 10, speedMultiplier: 1.5 }))).toBe(15)
  })
})

describe('CLASSIC_CONFIG', () => {
  it('matches the documented classic flag combination', () => {
    expect(CLASSIC_CONFIG).toMatchObject({
      cols: 20,
      rows: 20,
      baseTicksPerSecond: 8,
      speedMultiplier: 1,
      wallsKill: true,
      wrapAround: false,
      obstacles: [],
      applesToAdvance: null,
      growthPerFood: 3,
      pointsPerFood: 10,
      seed: 1,
    })
  })
})

describe('createInitialState', () => {
  it('creates a centered length-3 horizontal snake moving right', () => {
    const s = createInitialState(CLASSIC_CONFIG)
    expect(s.snake).toEqual([
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ])
    expect(s.direction).toBe('right')
    expect(s.nextDirection).toBe('right')
    expect(s.status).toBe('running')
    expect(s.tick).toBe(0)
    expect(s.score).toBe(0)
    expect(s.applesEaten).toBe(0)
    expect(s.pendingGrowth).toBe(0)
    expect(s.deathCause).toBeNull()
  })

  it('spawns food off the snake, deterministically from the seed', () => {
    const s = createInitialState(CLASSIC_CONFIG)
    // Pinned from the seeded RNG (seed = 1) over the classic free cells.
    expect(s.food).toEqual({ x: 11, y: 12 })
    expect(createInitialState(CLASSIC_CONFIG).food).toEqual(s.food)
  })
})

describe('step — basic movement', () => {
  it('advances the head one cell and preserves length when not growing', () => {
    const s = makeState({ snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }] })
    const n = step(s)
    expect(n.snake).toEqual([
      { x: 6, y: 5 },
      { x: 5, y: 5 },
      { x: 4, y: 5 },
    ])
    expect(n.tick).toBe(1)
    expect(n.status).toBe('running')
  })

  it('commits nextDirection into direction on the tick', () => {
    const s = makeState({
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }],
      direction: 'right',
      nextDirection: 'up',
    })
    const n = step(s)
    expect(n.direction).toBe('up')
    expect(n.snake[0]).toEqual({ x: 5, y: 4 })
  })

  it('leaves non-running states untouched', () => {
    const dead = makeState({
      snake: [{ x: 5, y: 5 }],
      status: 'gameover',
      deathCause: 'wall',
    })
    expect(step(dead)).toBe(dead)
    const won = makeState({ snake: [{ x: 5, y: 5 }], status: 'won' })
    expect(step(won)).toBe(won)
  })
})

describe('applyTurn — reversal guard', () => {
  it('buffers a legal perpendicular turn', () => {
    const s = makeState({ snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }], direction: 'right' })
    expect(applyTurn(s, 'up').nextDirection).toBe('up')
    expect(applyTurn(s, 'down').nextDirection).toBe('down')
  })

  it('ignores an instant 180 reversal against the committed direction', () => {
    const s = makeState({ snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }], direction: 'right' })
    const n = applyTurn(s, 'left')
    expect(n).toBe(s)
    expect(n.nextDirection).toBe('right')
  })

  it('allows opposite-of-nextDirection while perpendicular to direction', () => {
    // Moving right, already buffered up; turning down is perpendicular to the
    // committed direction (right) so it is legal even though it reverses the
    // buffered value. Double-turn safety is the UI queue's job, not the engine.
    const s = makeState({
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }],
      direction: 'right',
      nextDirection: 'up',
    })
    expect(applyTurn(s, 'down').nextDirection).toBe('down')
  })

  it('is a no-op when the game is not running', () => {
    const s = makeState({ snake: [{ x: 5, y: 5 }], status: 'gameover', direction: 'right' })
    expect(applyTurn(s, 'up')).toBe(s)
  })

  it('is a no-op when the direction is unchanged', () => {
    const s = makeState({ snake: [{ x: 5, y: 5 }], direction: 'right', nextDirection: 'right' })
    expect(applyTurn(s, 'right')).toBe(s)
  })

  it('prevents a same-tick reversal from turning the snake back on itself', () => {
    // Guard is defined against the committed direction, so a reversal never
    // takes effect on the immediately following step.
    const s = makeState({
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }],
      direction: 'right',
    })
    const turned = applyTurn(s, 'left')
    const n = step(turned)
    expect(n.status).toBe('running')
    expect(n.snake[0]).toEqual({ x: 6, y: 5 })
  })
})

describe('step — growth', () => {
  it('eating adds pointsPerFood, an apple, and queues growthPerFood', () => {
    const s = makeState({
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }],
      food: { x: 6, y: 5 },
      config: cfg({ growthPerFood: 3, pointsPerFood: 10 }),
    })
    const n = step(s)
    expect(n.score).toBe(10)
    expect(n.applesEaten).toBe(1)
    expect(n.pendingGrowth).toBe(3)
    // Length is unchanged on the eating tick; growth is applied over the next ticks.
    expect(n.snake.length).toBe(3)
    expect(n.food).not.toBeNull()
    expect(n.food).not.toEqual({ x: 6, y: 5 })
  })

  it('grows exactly growthPerFood cells over the following ticks', () => {
    // Place food directly ahead, then walk straight with no further food in reach.
    let s: GameState = makeState({
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }],
      food: { x: 6, y: 5 },
      config: cfg({ growthPerFood: 3, pointsPerFood: 10 }),
    })
    const startLen = s.snake.length
    s = step(s) // eat; queues 3
    // Move the food far away so we can walk without eating again.
    s = { ...s, food: { x: 0, y: 0 } }
    s = step(s) // +1
    s = step(s) // +1
    s = step(s) // +1
    expect(s.snake.length).toBe(startLen + 3)
    expect(s.pendingGrowth).toBe(0)
    // One more tick is length-preserving again.
    const before = s.snake.length
    s = step(s)
    expect(s.snake.length).toBe(before)
  })

  it('keeps the tail in place while growth is pending', () => {
    const s = makeState({
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }],
      pendingGrowth: 2,
    })
    const n = step(s)
    expect(n.snake.length).toBe(4)
    expect(n.snake[n.snake.length - 1]).toEqual({ x: 3, y: 5 })
    expect(n.pendingGrowth).toBe(1)
  })
})

describe('step — wall death', () => {
  it('kills on leaving the board when wallsKill and not wrapping', () => {
    const s = makeState({
      snake: [{ x: 19, y: 5 }, { x: 18, y: 5 }],
      direction: 'right',
      config: cfg({ wallsKill: true, wrapAround: false }),
    })
    const n = step(s)
    expect(n.status).toBe('gameover')
    expect(n.deathCause).toBe('wall')
    // Snake body is not advanced on the fatal tick.
    expect(n.snake).toEqual(s.snake)
    expect(n.tick).toBe(1)
  })

  it('treats a solid wall as fatal when neither wallsKill nor wrapAround is set', () => {
    const s = makeState({
      snake: [{ x: 0, y: 5 }, { x: 1, y: 5 }],
      direction: 'left',
      config: cfg({ wallsKill: false, wrapAround: false }),
    })
    const n = step(s)
    expect(n.status).toBe('gameover')
    expect(n.deathCause).toBe('wall')
  })
})

describe('step — wrap-around (wins over wallsKill)', () => {
  it('wraps the head to the opposite edge instead of dying', () => {
    const s = makeState({
      snake: [{ x: 19, y: 5 }, { x: 18, y: 5 }],
      direction: 'right',
      config: cfg({ wallsKill: true, wrapAround: true }),
    })
    const n = step(s)
    expect(n.status).toBe('running')
    expect(n.snake[0]).toEqual({ x: 0, y: 5 })
  })

  it('wraps on the top edge (origin top-left)', () => {
    const s = makeState({
      snake: [{ x: 5, y: 0 }, { x: 5, y: 1 }],
      direction: 'up',
      config: cfg({ wrapAround: true }),
    })
    const n = step(s)
    expect(n.snake[0]).toEqual({ x: 5, y: 19 })
    expect(n.status).toBe('running')
  })

  it('still wraps when wallsKill is false (precedence holds for every wallsKill value, not just true)', () => {
    // Both prior tests pin wrapAround > wallsKill with wallsKill: true. Wrap
    // must behave identically when wallsKill is false — the flags are
    // independent inputs, so the precedence rule should not depend on the
    // other flag's value.
    // NOTE: food is pinned (see the sibling wrap+self-collision test below
    // for why) to avoid tripping the pre-existing `boardFull` engine bug.
    const s = makeState({
      snake: [{ x: 19, y: 5 }, { x: 18, y: 5 }],
      direction: 'right',
      food: { x: 10, y: 10 },
      config: cfg({ wallsKill: false, wrapAround: true }),
    })
    const n = step(s)
    expect(n.status).toBe('running')
    expect(n.snake[0]).toEqual({ x: 0, y: 5 })
  })

  it('a wrapped-in head still dies to self-collision under the moving-tail rule', () => {
    // wrapAround only relocates the head across the edge — it must not skip
    // the collision checks that run after edge resolution. Snake occupies the
    // left edge column so wrapping the head from the right edge lands it
    // directly on a non-tail body segment.
    const s = makeState({
      snake: [
        { x: 19, y: 5 }, // head, about to wrap
        { x: 0, y: 5 }, // will be hit after wrap
        { x: 0, y: 6 },
        { x: 0, y: 7 },
        { x: 0, y: 8 }, // tail
      ],
      direction: 'right',
      config: cfg({ wrapAround: true, wallsKill: false }),
    })
    const n = step(s)
    expect(n.status).toBe('gameover')
    expect(n.deathCause).toBe('self')
  })

  it('a wrapped-in head is safe when it lands on the tail cell that vacates this tick', () => {
    // Same wrap, but the target cell is the tail and no growth is pending, so
    // the moving-tail rule makes this safe — mirroring the non-wrap moving-
    // tail test but exercising it through an edge wrap.
    // NOTE: food is pinned to an unrelated free cell (not eaten this tick)
    // rather than left at the makeState default of null. With food left
    // null, step()'s `boardFull = food === null` check (update.ts) reads
    // "no food ever placed" as "board just filled" and forces status to
    // 'won' even though nothing was eaten — see the QA findings for this
    // pre-existing engine bug, which also fails 5 tests already in this
    // file (basic movement, reversal-guard, and the two prior wrap tests).
    const s = makeState({
      snake: [
        { x: 19, y: 5 }, // head, about to wrap
        { x: 18, y: 5 },
        { x: 17, y: 5 },
        { x: 0, y: 5 }, // tail — this is where the head wraps to
      ],
      direction: 'right',
      food: { x: 10, y: 10 }, // unrelated cell; not eaten this tick
      config: cfg({ wrapAround: true, wallsKill: false }),
    })
    const n = step(s)
    expect(n.status).toBe('running')
    expect(n.snake[0]).toEqual({ x: 0, y: 5 })
  })
})

describe('step — obstacle collision', () => {
  it('dies with cause "obstacle" when stepping onto one', () => {
    const s = makeState({
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }],
      direction: 'right',
      config: cfg({ obstacles: [{ x: 6, y: 5 }] }),
    })
    const n = step(s)
    expect(n.status).toBe('gameover')
    expect(n.deathCause).toBe('obstacle')
  })
})

describe('step — self collision and the moving-tail rule', () => {
  it('dies when the head runs into a body segment', () => {
    // A tight square: head at (5,5) turning down into its own neck region.
    const s = makeState({
      snake: [
        { x: 6, y: 5 },
        { x: 6, y: 6 },
        { x: 5, y: 6 },
        { x: 5, y: 5 },
      ],
      direction: 'up',
      nextDirection: 'left',
    })
    // Moving left from (6,5) -> (5,5), which is the last body segment (the tail).
    // The tail vacates this tick (no pending growth), so this is SAFE.
    const safe = step(s)
    expect(safe.status).toBe('running')
    expect(safe.snake[0]).toEqual({ x: 5, y: 5 })
  })

  it('stepping onto the tail cell is fatal when the tail stays (growth pending)', () => {
    const s = makeState({
      snake: [
        { x: 6, y: 5 },
        { x: 6, y: 6 },
        { x: 5, y: 6 },
        { x: 5, y: 5 },
      ],
      direction: 'up',
      nextDirection: 'left',
      pendingGrowth: 2, // tail will NOT move this tick
    })
    const n = step(s)
    expect(n.status).toBe('gameover')
    expect(n.deathCause).toBe('self')
  })

  it('dies when the head hits a non-tail segment even without growth', () => {
    // Long snake folded so moving up hits the 2nd segment, not the tail.
    const s = makeState({
      snake: [
        { x: 5, y: 5 },
        { x: 5, y: 4 },
        { x: 6, y: 4 },
        { x: 6, y: 5 },
        { x: 6, y: 6 },
      ],
      direction: 'up',
    })
    const n = step(s) // (5,5) -> (5,4) which is the 2nd segment
    expect(n.status).toBe('gameover')
    expect(n.deathCause).toBe('self')
  })
})

describe('step — win conditions', () => {
  it('wins when applesToAdvance is reached', () => {
    const s = makeState({
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }],
      food: { x: 6, y: 5 },
      applesEaten: 2,
      config: cfg({ applesToAdvance: 3 }),
    })
    const n = step(s) // eats the 3rd apple
    expect(n.applesEaten).toBe(3)
    expect(n.status).toBe('won')
  })

  it('does not win before the target', () => {
    const s = makeState({
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }],
      food: { x: 6, y: 5 },
      applesEaten: 0,
      config: cfg({ applesToAdvance: 3 }),
    })
    const n = step(s)
    expect(n.status).toBe('running')
  })

  it('wins by filling the board (food becomes null)', () => {
    // 2x2 board. Snake covers 3 cells with growth pending so the tail stays;
    // eating the 4th (food) cell fills the board, leaving no free cell -> food
    // is null and the session is won. Growth pending is required because a
    // deferred-growth tail would otherwise vacate and free a cell.
    const config = cfg({ cols: 2, rows: 2, growthPerFood: 1, applesToAdvance: null })
    const s = makeState({
      snake: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
      direction: 'up',
      // head at (0,0); moving right -> (1,0) where the food is.
      nextDirection: 'right',
      pendingGrowth: 1,
      food: { x: 1, y: 0 },
      config,
    })
    const n = step(s)
    expect(n.snake.length).toBe(4)
    expect(n.food).toBeNull()
    expect(n.status).toBe('won')
  })
})

describe('step — determinism and immutability', () => {
  it('does not mutate the input state', () => {
    const snake: Vec2[] = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }]
    const s = makeState({ snake })
    const snapshot = JSON.parse(JSON.stringify(s))
    step(s)
    expect(s).toEqual(snapshot)
    // Original snake array reference is untouched.
    expect(s.snake).toBe(snake)
    expect(snake).toEqual([{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }])
  })

  it('produces an identical trace from the same seed', () => {
    const play = (): GameState => {
      let s = createInitialState(CLASSIC_CONFIG)
      const moves: Direction[] = ['down', 'right', 'up', 'left', 'down', 'down']
      for (const m of moves) {
        s = applyTurn(s, m)
        s = step(s)
      }
      return s
    }
    expect(play()).toEqual(play())
  })

  it('re-spawned food after eating is deterministic for a fixed seed', () => {
    const s = makeState({
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }],
      food: { x: 6, y: 5 },
      rngState: 12345,
    })
    const a = step(s)
    const b = step(s)
    expect(a.food).toEqual(b.food)
    expect(a.rngState).toBe(b.rngState)
  })
})
