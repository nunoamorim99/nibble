/**
 * Core engine types. Data only — no behavior lives here.
 *
 * Everything the engine touches is plain, immutable data so a `GameState` can
 * be snapshotted, diffed, and interpolated by the renderer. Modes are not
 * types here: they are combinations of the modifier flags on `GameConfig`.
 */

/** Integer grid cell / unit direction vector. Origin is top-left. */
export interface Vec2 {
  readonly x: number
  readonly y: number
}

/** The four cardinal directions the snake can face. */
export type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * Unit vectors for each direction. Origin is top-left, so `up` decreases `y`
 * and `down` increases it.
 */
export const DIRECTION_VECTORS: Record<Direction, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

/** Lifecycle of a single play session. */
export type GameStatus = 'running' | 'gameover' | 'won'

/** Why a running game transitioned to `gameover`. */
export type DeathCause = 'wall' | 'self' | 'obstacle'

/**
 * Rules for a play session. Modes and challenges are expressed purely as flag
 * combinations here — the engine never branches on a named mode. "Classic" is
 * just one such combination (see `CLASSIC_CONFIG`).
 */
export interface GameConfig {
  /** Grid width in cells. */
  readonly cols: number
  /** Grid height in cells. */
  readonly rows: number
  /** Logical ticks per second before `speedMultiplier` is applied. */
  readonly baseTicksPerSecond: number
  /** Speed scaling; effective ticks/sec = base × this. */
  readonly speedMultiplier: number
  /** When true (and not wrapping), leaving the board is fatal. */
  readonly wallsKill: boolean
  /** When true, leaving one edge re-enters from the opposite edge. Wins over `wallsKill`. */
  readonly wrapAround: boolean
  /** Cells the snake cannot occupy; also excluded from food spawns. */
  readonly obstacles: readonly Vec2[]
  /** Apples needed to win the level, or null for an endless session. */
  readonly applesToAdvance: number | null
  /** Segments added per food eaten. */
  readonly growthPerFood: number
  /** Score awarded per food eaten. */
  readonly pointsPerFood: number
  /** Seed for the deterministic RNG that drives food placement. */
  readonly seed: number
}

/**
 * Complete, immutable snapshot of a session. `step`/`applyTurn` return a new
 * `GameState`; the RNG state travels inside the snapshot so replays are exact.
 */
export interface GameState {
  /** The rules this session is running under. */
  readonly config: GameConfig
  /** Number of ticks elapsed. */
  readonly tick: number
  /** Snake body, head first, tail last. Each entry is one occupied cell. */
  readonly snake: readonly Vec2[]
  /** Direction the snake is moving this tick (committed). */
  readonly direction: Direction
  /** Buffered direction applied on the next `step`. */
  readonly nextDirection: Direction
  /** Segments still to grow; while > 0 the tail does not advance. */
  readonly pendingGrowth: number
  /** Current food cell, or null only when the board is full. */
  readonly food: Vec2 | null
  /** Accumulated score. */
  readonly score: number
  /** Count of food eaten this session. */
  readonly applesEaten: number
  /** Current lifecycle status. */
  readonly status: GameStatus
  /** Set alongside a `gameover` status, otherwise null. */
  readonly deathCause: DeathCause | null
  /** Current numeric state of the seeded RNG. */
  readonly rngState: number
}
