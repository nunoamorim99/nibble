/**
 * The tick engine: how a `GameState` becomes the next `GameState`.
 *
 * `step` is one fixed logical tick and is the source of truth; the loop
 * outside decides *when* to call it (no time enters here). `applyTurn` only
 * buffers input. Every rule that differs between modes is read from
 * `GameConfig` flags — there are no mode branches.
 */
import type {
  Direction,
  GameConfig,
  GameState,
  GameStatus,
  Vec2,
} from './types'
import { DIRECTION_VECTORS } from './types'
import { cellEq, cellInList, inBounds, wrapCell } from './grid'
import { spawnFood } from './food'

/**
 * Classic Snake: a 20×20 board, 8 ticks/sec, deadly walls, no wrap, no
 * obstacles, endless (no apple target). Just one flag combination among many.
 */
export const CLASSIC_CONFIG: GameConfig = {
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
}

/** Effective logical ticks per second for a config. */
export function ticksPerSecond(config: GameConfig): number {
  return config.baseTicksPerSecond * config.speedMultiplier
}

/** The opposite of a direction; used to forbid instant 180° reversals. */
function opposite(dir: Direction): Direction {
  switch (dir) {
    case 'up':
      return 'down'
    case 'down':
      return 'up'
    case 'left':
      return 'right'
    case 'right':
      return 'left'
  }
}

/**
 * Build the starting snapshot: a length-3 horizontal snake centered on the
 * board, moving right, with food already placed via the seeded RNG. Pure and
 * deterministic for a given config.
 */
export function createInitialState(config: GameConfig): GameState {
  const midY = Math.floor(config.rows / 2)
  const headX = Math.floor(config.cols / 2)
  // Head first; body trails to the left so movement is rightward.
  const snake: Vec2[] = [
    { x: headX, y: midY },
    { x: headX - 1, y: midY },
    { x: headX - 2, y: midY },
  ]

  const spawn = spawnFood(snake, config, config.seed >>> 0)

  return {
    config,
    tick: 0,
    snake,
    direction: 'right',
    nextDirection: 'right',
    pendingGrowth: 0,
    food: spawn.food,
    score: 0,
    applesEaten: 0,
    status: 'running',
    deathCause: null,
    rngState: spawn.rngState,
  }
}

/**
 * Buffer a turn for the next tick. Ignored if the game is not running or if
 * `dir` is the exact opposite of the *committed* `direction` (a 180° reversal).
 * Turning to the opposite of `nextDirection` while perpendicular to
 * `direction` is legal — double-turn buffering is the UI's job, not the
 * engine's.
 */
export function applyTurn(state: GameState, dir: Direction): GameState {
  if (state.status !== 'running') return state
  if (dir === opposite(state.direction)) return state
  if (dir === state.nextDirection) return state
  return { ...state, nextDirection: dir }
}

/**
 * Advance one logical tick. Non-running states are returned unchanged.
 *
 * Order per tick: commit the buffered direction, move the head, resolve the
 * edge (wrap wins over wallsKill; with neither flag the wall is still solid),
 * check obstacle/self collision under the moving-tail rule, then eat/grow and
 * re-spawn food, and finally test the win conditions.
 */
export function step(state: GameState): GameState {
  if (state.status !== 'running') return state

  const { config } = state
  const direction = state.nextDirection
  const tick = state.tick + 1
  const vec = DIRECTION_VECTORS[direction]

  // Move the head one cell in the committed direction.
  let head: Vec2 = {
    x: state.snake[0].x + vec.x,
    y: state.snake[0].y + vec.y,
  }

  // Resolve leaving the board. Precedence: wrapAround > wallsKill; with
  // neither flag set, the wall is still solid (treated as wallsKill).
  if (!inBounds(head, config.cols, config.rows)) {
    if (config.wrapAround) {
      head = wrapCell(head, config.cols, config.rows)
    } else {
      return {
        ...state,
        tick,
        direction,
        status: 'gameover',
        deathCause: 'wall',
      }
    }
  }

  // Obstacle collision.
  if (cellInList(head, config.obstacles)) {
    return {
      ...state,
      tick,
      direction,
      status: 'gameover',
      deathCause: 'obstacle',
    }
  }

  // The tail is kept (snake grows by one) whenever growth is queued; movement
  // is otherwise length-preserving. Eating adds to the queue below, so it does
  // not itself keep the tail on the eating tick — the queued units do, one per
  // subsequent tick, giving exactly `growthPerFood` extra cells per food.
  const willGrow = state.pendingGrowth > 0

  // Self collision under the moving-tail rule: the current tail cell is only
  // dangerous if it will still be occupied after this move (i.e. we grow).
  // Compare against every segment except the tail when the tail vacates.
  const bodyToCheck = willGrow
    ? state.snake
    : state.snake.slice(0, state.snake.length - 1)
  if (cellInList(head, bodyToCheck)) {
    return {
      ...state,
      tick,
      direction,
      status: 'gameover',
      deathCause: 'self',
    }
  }

  // Build the new body: prepend the head, drop the tail unless growing.
  let pendingGrowthOut = state.pendingGrowth
  const newSnake: Vec2[] = [head, ...state.snake]
  if (willGrow) {
    // Consumed one unit of queued growth by keeping the tail this tick.
    pendingGrowthOut -= 1
  } else {
    newSnake.pop()
  }

  // Apply eating: score, apple count, queued growth, and a fresh food cell.
  const ateFood = state.food !== null && cellEq(head, state.food)
  let score = state.score
  let applesEaten = state.applesEaten
  let food = state.food
  let rngState = state.rngState

  if (ateFood) {
    score += config.pointsPerFood
    applesEaten += 1
    pendingGrowthOut += config.growthPerFood
    const spawn = spawnFood(newSnake, config, rngState)
    food = spawn.food
    rngState = spawn.rngState
  }

  // Win conditions: hit the apple target, or the board is full (no free cell).
  // Board-full can only newly occur on an eating tick (spawnFood found no free
  // cell); a state that already carried food: null is not a win.
  let status: GameStatus = state.status
  const reachedTarget =
    config.applesToAdvance !== null && applesEaten >= config.applesToAdvance
  const boardFull = ateFood && food === null
  if (reachedTarget || boardFull) {
    status = 'won'
  }

  return {
    ...state,
    tick,
    snake: newSnake,
    direction,
    nextDirection: direction,
    pendingGrowth: pendingGrowthOut,
    food,
    score,
    applesEaten,
    status,
    deathCause: null,
    rngState,
  }
}
