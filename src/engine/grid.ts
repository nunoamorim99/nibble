/**
 * Grid geometry helpers. All pure, all cheap — the building blocks the
 * update logic composes for movement, wrapping, and collision.
 */
import type { Vec2 } from './types'

/** True when two cells occupy the same coordinate. */
export function cellEq(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y
}

/** True when a cell lies within the `cols` × `rows` board. */
export function inBounds(cell: Vec2, cols: number, rows: number): boolean {
  return cell.x >= 0 && cell.x < cols && cell.y >= 0 && cell.y < rows
}

/**
 * Wrap a cell that has left the board back in from the opposite edge.
 * Uses modulo that stays correct for the single-step overshoot movement
 * produces (one cell past any edge).
 */
export function wrapCell(cell: Vec2, cols: number, rows: number): Vec2 {
  return {
    x: ((cell.x % cols) + cols) % cols,
    y: ((cell.y % rows) + rows) % rows,
  }
}

/** True when `cell` coincides with any snake segment. */
export function cellOnSnake(cell: Vec2, snake: readonly Vec2[]): boolean {
  return cellInList(cell, snake)
}

/** True when `cell` appears anywhere in `list`. */
export function cellInList(cell: Vec2, list: readonly Vec2[]): boolean {
  for (const c of list) {
    if (cellEq(cell, c)) return true
  }
  return false
}
