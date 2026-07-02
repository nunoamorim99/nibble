/**
 * Engine — PURE game logic: grid, snake, tick/update, collision, food,
 * scoring, and the mode/level rule engine. No canvas, no DOM, no
 * `window`/`document`, and no `Date.now()`/`Math.random()`: time never enters
 * here (the loop outside decides when to `step`) and the RNG is seeded with
 * its state living inside `GameState`, so `step`/`applyTurn` are deterministic
 * and testable. Modes are flag combinations on `GameConfig`, never branches.
 * This layer is the public surface other layers build against and depends on
 * nothing above it.
 */

export type {
  Vec2,
  Direction,
  GameStatus,
  DeathCause,
  GameConfig,
  GameState,
} from './types'
export { DIRECTION_VECTORS } from './types'

export { rngNext, rngInt } from './rng'

export { cellEq, inBounds, wrapCell, cellOnSnake, cellInList } from './grid'

export { spawnFood } from './food'

export {
  CLASSIC_CONFIG,
  ticksPerSecond,
  createInitialState,
  applyTurn,
  step,
} from './update'
