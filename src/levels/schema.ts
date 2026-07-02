/**
 * Level schema — data shape + two pure helpers. No engine logic lives here:
 * `levelToGameConfig` only assembles a `GameConfig` from `CLASSIC_CONFIG`
 * defaults and a level's fields, and `validateLevel` only inspects data.
 * Everything a level expresses is a flag the engine already reads.
 */
import type { GameConfig, Vec2 } from '../engine'
import { CLASSIC_CONFIG } from '../engine'

/**
 * A single level or challenge: grid size, apple target, and the modifier
 * flags the engine reads (`speedMultiplier`, `wallsKill`, `wrapAround`,
 * `obstacles`). Pure data — never branch engine code on level identity.
 */
export interface LevelConfig {
  /** Stable identifier, e.g. `'level-1'`. */
  readonly id: string
  /** Short, evocative display name. */
  readonly name: string
  /** Grid width in cells. */
  readonly cols: number
  /** Grid height in cells. */
  readonly rows: number
  /** Apples needed to clear the level. */
  readonly applesToAdvance: number
  /** Speed scaling relative to `CLASSIC_CONFIG.baseTicksPerSecond`. */
  readonly speedMultiplier: number
  /** When true (and not wrapping), leaving the board is fatal. */
  readonly wallsKill: boolean
  /** When true, edges wrap instead of killing. Wins over `wallsKill`. */
  readonly wrapAround: boolean
  /** Cells the snake cannot occupy; also excluded from food spawns. */
  readonly obstacles: readonly Vec2[]
}

/**
 * Assemble a `GameConfig` for a level: `CLASSIC_CONFIG` supplies the fields a
 * level does not own (`baseTicksPerSecond`, `growthPerFood`,
 * `pointsPerFood`), the level supplies its own grid/rules, and the caller
 * supplies the seed for this session.
 */
export function levelToGameConfig(level: LevelConfig, seed: number): GameConfig {
  return {
    ...CLASSIC_CONFIG,
    cols: level.cols,
    rows: level.rows,
    applesToAdvance: level.applesToAdvance,
    speedMultiplier: level.speedMultiplier,
    wallsKill: level.wallsKill,
    wrapAround: level.wrapAround,
    obstacles: level.obstacles,
    seed,
  }
}

/** Cell equality without importing engine internals not on the public surface. */
function cellEq(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y
}

/**
 * Validate a level's data. Returns human-readable problem descriptions;
 * an empty array means the level is valid. Checks:
 * - grid at least 10×10
 * - `applesToAdvance` >= 1
 * - `speedMultiplier` in (0.5, 3]
 * - every obstacle is in bounds
 * - no duplicate obstacle cells
 * - spawn safety: the length-3 snake spawns centered on row
 *   `floor(rows / 2)`, head at `floor(cols / 2)`, tail two cells behind (it
 *   moves right). No obstacle may occupy that spawn row from one cell behind
 *   the tail to four cells ahead of the head, so the snake always has a fair
 *   start and immediate room to move.
 * - obstacles must stay under 25% of grid cells, for breathing room
 */
export function validateLevel(level: LevelConfig): readonly string[] {
  const problems: string[] = []

  if (level.cols < 10 || level.rows < 10) {
    problems.push(
      `grid must be at least 10x10, got ${level.cols}x${level.rows}`,
    )
  }

  if (level.applesToAdvance < 1) {
    problems.push(
      `applesToAdvance must be >= 1, got ${level.applesToAdvance}`,
    )
  }

  if (level.speedMultiplier <= 0.5 || level.speedMultiplier > 3) {
    problems.push(
      `speedMultiplier must be in (0.5, 3], got ${level.speedMultiplier}`,
    )
  }

  for (const cell of level.obstacles) {
    if (
      cell.x < 0 ||
      cell.x >= level.cols ||
      cell.y < 0 ||
      cell.y >= level.rows
    ) {
      problems.push(`obstacle out of bounds: (${cell.x}, ${cell.y})`)
    }
  }

  for (let i = 0; i < level.obstacles.length; i++) {
    for (let j = i + 1; j < level.obstacles.length; j++) {
      if (cellEq(level.obstacles[i], level.obstacles[j])) {
        problems.push(
          `duplicate obstacle cell: (${level.obstacles[i].x}, ${level.obstacles[i].y})`,
        )
      }
    }
  }

  // Spawn safety: length-3 snake occupies [startCol .. headCol] on
  // row floor(rows / 2); require that row clear from one cell behind the
  // tail through four cells ahead of the head.
  const midY = Math.floor(level.rows / 2)
  const headCol = Math.floor(level.cols / 2)
  const startCol = headCol - 2
  const clearFrom = startCol - 1
  const clearTo = headCol + 4
  for (const cell of level.obstacles) {
    if (cell.y === midY && cell.x >= clearFrom && cell.x <= clearTo) {
      problems.push(
        `obstacle blocks spawn safety zone: (${cell.x}, ${cell.y})`,
      )
    }
  }

  const totalCells = level.cols * level.rows
  if (level.obstacles.length >= totalCells * 0.25) {
    problems.push(
      `obstacles too dense: ${level.obstacles.length} of ${totalCells} cells (must be < 25%)`,
    )
  }

  return problems
}
