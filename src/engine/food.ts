/**
 * Food placement. Enumerating the free cells (never rejection-sampling)
 * guarantees two things at once: food can never land on the snake or an
 * obstacle, and placement always terminates — even on a board with a single
 * free cell left. When there are no free cells, food is null and the caller
 * treats the session as won.
 */
import type { GameConfig, Vec2 } from './types'
import { cellInList } from './grid'
import { rngInt } from './rng'

/**
 * Place food on a uniformly-random free cell.
 * @param occupied Cells that are unavailable (typically the snake). Obstacles
 *   from `config` are excluded automatically.
 * @param rngState Current RNG state; the returned `rngState` must be threaded on.
 * @returns The chosen `food` cell (or null if the board is full) and next `rngState`.
 */
export function spawnFood(
  occupied: readonly Vec2[],
  config: GameConfig,
  rngState: number,
): { food: Vec2 | null; rngState: number } {
  const free: Vec2[] = []
  for (let y = 0; y < config.rows; y++) {
    for (let x = 0; x < config.cols; x++) {
      const cell: Vec2 = { x, y }
      if (cellInList(cell, occupied)) continue
      if (cellInList(cell, config.obstacles)) continue
      free.push(cell)
    }
  }

  if (free.length === 0) {
    return { food: null, rngState }
  }

  const pick = rngInt(rngState, free.length)
  return { food: free[pick.value], rngState: pick.state }
}
