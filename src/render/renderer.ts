/**
 * Canvas renderer. Reads an immutable `GameState` (plus the previous tick's
 * state for interpolation) and the active `Theme`, and draws — nothing here
 * decides game rules. Cell geometry is recomputed from the canvas size every
 * draw so the game can be resized without the renderer or engine knowing.
 */
import type { GameState, Vec2 } from '../engine'
import { DIRECTION_VECTORS } from '../engine'
import type { Theme } from '../themes'

/** Read-only HUD data supplied by the caller; the renderer never computes it. */
export interface Hud {
  readonly highScore: number
  /** Loop-level pause flag (pause is not engine state); drawn as an overlay. */
  readonly paused?: boolean
}

/** A themed, stateless-per-call drawer bound to one canvas. */
export interface Renderer {
  /**
   * Draw one frame.
   * @param prev The `GameState` one logical tick ago, or `null` if there is
   *   no previous tick yet (e.g. the very first frame after a restart).
   * @param next The current, authoritative `GameState` — always drawn as the
   *   target position; `prev` only supplies where to interpolate *from*.
   * @param alpha Progress toward the next tick in `[0, 1]`. Ignored unless
   *   `theme.interpolate` is `true` and `prev` is non-null.
   * @param theme The active theme; every color/shape decision comes from it.
   * @param hud Optional HUD data (currently just the high score).
   */
  draw(prev: GameState | null, next: GameState, alpha: number, theme: Theme, hud?: Hud): void
}

/** Pixel rect for one grid cell, already integer-aligned. */
interface CellRect {
  readonly x: number
  readonly y: number
  readonly size: number
}

/** Cached playfield geometry for a single draw call. */
interface Layout {
  readonly cellSize: number
  readonly offsetX: number
  readonly offsetY: number
}

const HUD_MARGIN = 8
const HUD_FONT = '14px "Courier New", ui-monospace, monospace'
const OVERLAY_TITLE_FONT = 'bold 28px "Courier New", ui-monospace, monospace'
const OVERLAY_LINE_FONT = '16px "Courier New", ui-monospace, monospace'
const OVERLAY_LINE_GAP = 26

/** Compute the largest integer cell size that fits the grid, and center the remainder. */
function computeLayout(canvas: HTMLCanvasElement, cols: number, rows: number): Layout {
  const cellSize = Math.max(1, Math.floor(Math.min(canvas.width / cols, canvas.height / rows)))
  const offsetX = Math.floor((canvas.width - cellSize * cols) / 2)
  const offsetY = Math.floor((canvas.height - cellSize * rows) / 2)
  return { cellSize, offsetX, offsetY }
}

/** Linear interpolation between two numbers. */
function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha
}

/**
 * Resolve where a snake segment should be drawn this frame. Interpolates
 * from `prevCell` to `nextCell` when the theme wants smooth motion and the
 * move is a normal single-cell step; otherwise (theme opts out, no previous
 * state, a wrap-around jump of more than one cell on either axis, or the
 * previous segment simply doesn't exist at this index) it snaps to `nextCell`.
 */
function resolveSegmentPosition(
  prevCell: Vec2 | undefined,
  nextCell: Vec2,
  alpha: number,
  interpolate: boolean,
): Vec2 {
  if (!interpolate || !prevCell) return nextCell

  const dx = nextCell.x - prevCell.x
  const dy = nextCell.y - prevCell.y
  const isNormalStep = Math.abs(dx) <= 1 && Math.abs(dy) <= 1

  if (!isNormalStep) return nextCell

  return {
    x: lerp(prevCell.x, nextCell.x, alpha),
    y: lerp(prevCell.y, nextCell.y, alpha),
  }
}

/** Convert a (possibly fractional, interpolated) grid cell to an integer-aligned pixel rect. */
function cellToRect(cell: Vec2, layout: Layout, inset: number): CellRect {
  const { cellSize, offsetX, offsetY } = layout
  const insetPx = Math.floor(cellSize * inset)
  const size = Math.max(1, cellSize - insetPx * 2)
  const x = Math.round(offsetX + cell.x * cellSize + insetPx)
  const y = Math.round(offsetY + cell.y * cellSize + insetPx)
  return { x, y, size }
}

/** Width, in device pixels, of each bevel edge line. Kept subtle and cell-size-independent. */
const BEVEL_LINE_WIDTH = 1

/**
 * Draw a subtle pixel bevel inside an already-filled cell: a translucent
 * white line tracing the top+left edges (the "lit" side) and a translucent
 * black line tracing the bottom+right edges (the "shadow" side). Purely
 * decorative shading derived from white/black overlays — no extra theme
 * color tokens required.
 */
function drawBevel(ctx: CanvasRenderingContext2D, rect: CellRect): void {
  if (rect.size < 4) return // too small to read as a bevel; avoid muddying tiny cells

  const half = BEVEL_LINE_WIDTH / 2
  const inner = BEVEL_LINE_WIDTH

  ctx.lineWidth = BEVEL_LINE_WIDTH

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.beginPath()
  ctx.moveTo(rect.x + half, rect.y + rect.size - inner)
  ctx.lineTo(rect.x + half, rect.y + half)
  ctx.lineTo(rect.x + rect.size - inner, rect.y + half)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.beginPath()
  ctx.moveTo(rect.x + inner, rect.y + rect.size - half)
  ctx.lineTo(rect.x + rect.size - half, rect.y + rect.size - half)
  ctx.lineTo(rect.x + rect.size - half, rect.y + inner)
  ctx.stroke()
}

/** Fill one themed cell, honoring the theme's square/rounded cell style and optional bevel. */
function fillCell(ctx: CanvasRenderingContext2D, rect: CellRect, theme: Theme, color: string): void {
  ctx.fillStyle = color
  if (theme.cell.shape === 'rounded') {
    const radius = Math.max(0, Math.min(rect.size / 2, rect.size * theme.cell.radius))
    ctx.beginPath()
    ctx.roundRect(rect.x, rect.y, rect.size, rect.size, radius)
    ctx.fill()
  } else {
    ctx.fillRect(rect.x, rect.y, rect.size, rect.size)
  }

  if (theme.cell.bevel) drawBevel(ctx, rect)
}

/**
 * Fill the canvas background — a vertical `backgroundGradient` when the
 * theme supplies one, else the flat `background` color.
 */
function drawBackground(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, theme: Theme): void {
  const gradientStops = theme.colors.backgroundGradient
  if (gradientStops) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, gradientStops[0])
    gradient.addColorStop(1, gradientStops[1])
    ctx.fillStyle = gradient
  } else {
    ctx.fillStyle = theme.colors.background
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  cols: number,
  rows: number,
  theme: Theme,
): void {
  const gridColor = theme.colors.grid
  if (!gridColor) return

  const { cellSize, offsetX, offsetY } = layout
  ctx.strokeStyle = gridColor
  ctx.lineWidth = 1

  ctx.beginPath()
  for (let col = 0; col <= cols; col++) {
    const x = Math.round(offsetX + col * cellSize) + 0.5
    ctx.moveTo(x, offsetY)
    ctx.lineTo(x, offsetY + rows * cellSize)
  }
  for (let row = 0; row <= rows; row++) {
    const y = Math.round(offsetY + row * cellSize) + 0.5
    ctx.moveTo(offsetX, y)
    ctx.lineTo(offsetX + cols * cellSize, y)
  }
  ctx.stroke()
}

function drawObstacles(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  obstacles: readonly Vec2[],
  theme: Theme,
): void {
  for (const cell of obstacles) {
    fillCell(ctx, cellToRect(cell, layout, theme.cell.inset), theme, theme.colors.obstacle)
  }
}

function drawFood(ctx: CanvasRenderingContext2D, layout: Layout, food: Vec2 | null, theme: Theme): void {
  if (!food) return
  fillCell(ctx, cellToRect(food, layout, theme.cell.inset), theme, theme.colors.food)
}

/** Fraction of the head cell's size used as the eye dot's radius. */
const EYE_RADIUS_FRACTION = 0.12
/** Fraction of the head cell's size the eye is offset from center toward the facing direction. */
const EYE_OFFSET_FRACTION = 0.22

/**
 * Draw a small eye dot on the head cell, offset toward `direction` — a pure
 * placement detail read from state for display only, deciding nothing about
 * gameplay. No-op when the theme has no `eye` color.
 */
function drawEye(ctx: CanvasRenderingContext2D, rect: CellRect, direction: Vec2, theme: Theme): void {
  const eyeColor = theme.colors.eye
  if (!eyeColor) return

  const centerX = rect.x + rect.size / 2
  const centerY = rect.y + rect.size / 2
  const offset = rect.size * EYE_OFFSET_FRACTION
  const radius = Math.max(0.5, rect.size * EYE_RADIUS_FRACTION)

  ctx.fillStyle = eyeColor
  ctx.beginPath()
  ctx.arc(centerX + direction.x * offset, centerY + direction.y * offset, radius, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Draw the snake body first (all segments, alternating `snakeBody` /
 * `snakeBodyAlt` by index when the theme supplies an alt color), then the
 * head on top with an optional eye dot facing `next.direction`.
 */
function drawSnake(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  prev: GameState | null,
  next: GameState,
  alpha: number,
  theme: Theme,
): void {
  const prevSnake = prev?.snake
  const positions = next.snake.map((cell, index) =>
    resolveSegmentPosition(prevSnake?.[index], cell, alpha, theme.interpolate),
  )
  const bodyAlt = theme.colors.snakeBodyAlt

  for (let index = positions.length - 1; index >= 1; index--) {
    const color = bodyAlt && index % 2 === 1 ? bodyAlt : theme.colors.snakeBody
    fillCell(ctx, cellToRect(positions[index], layout, theme.cell.inset), theme, color)
  }
  if (positions.length > 0) {
    const headRect = cellToRect(positions[0], layout, theme.cell.inset)
    fillCell(ctx, headRect, theme, theme.colors.snakeHead)
    drawEye(ctx, headRect, DIRECTION_VECTORS[next.direction], theme)
  }
}

function drawHud(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, next: GameState, theme: Theme, hud?: Hud): void {
  ctx.fillStyle = theme.colors.hudText
  ctx.font = HUD_FONT
  ctx.textBaseline = 'top'

  ctx.textAlign = 'left'
  ctx.fillText(`SCORE ${Math.floor(next.score)}`, HUD_MARGIN, HUD_MARGIN)

  if (hud) {
    ctx.textAlign = 'right'
    ctx.fillText(`HI ${Math.floor(hud.highScore)}`, canvas.width - HUD_MARGIN, HUD_MARGIN)
  }
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  next: GameState,
  theme: Theme,
  hud?: Hud,
): void {
  const roundEnded = next.status === 'gameover' || next.status === 'won'
  const paused = hud?.paused === true && next.status === 'running'
  if (!roundEnded && !paused) return

  ctx.fillStyle = theme.colors.overlayBackdrop
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const centerX = Math.round(canvas.width / 2)
  const centerY = Math.round(canvas.height / 2)

  ctx.fillStyle = theme.colors.overlayText
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (paused) {
    ctx.font = OVERLAY_TITLE_FONT
    ctx.fillText('PAUSED', centerX, centerY - OVERLAY_LINE_GAP)
    ctx.font = OVERLAY_LINE_FONT
    ctx.fillText('Press P to resume', centerX, centerY + OVERLAY_LINE_GAP * 0.4)
    return
  }

  const title = next.status === 'won' ? 'YOU WIN' : 'GAME OVER'

  ctx.font = OVERLAY_TITLE_FONT
  ctx.fillText(title, centerX, centerY - OVERLAY_LINE_GAP)

  ctx.font = OVERLAY_LINE_FONT
  ctx.fillText(`FINAL SCORE ${Math.floor(next.score)}`, centerX, centerY + OVERLAY_LINE_GAP * 0.4)
  ctx.fillText('Press Enter to restart', centerX, centerY + OVERLAY_LINE_GAP * 1.6)
}

/** Create a `Renderer` bound to one canvas. Never reads or holds engine state between calls. */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  return {
    draw(prev, next, alpha, theme, hud) {
      const { cols, rows, obstacles } = next.config
      const layout = computeLayout(canvas, cols, rows)
      const clampedAlpha = Math.min(1, Math.max(0, alpha))

      drawBackground(ctx, canvas, theme)
      drawGridLines(ctx, layout, cols, rows, theme)
      drawObstacles(ctx, layout, obstacles, theme)
      drawFood(ctx, layout, next.food, theme)
      drawSnake(ctx, layout, prev, next, clampedAlpha, theme)
      drawHud(ctx, canvas, next, theme, hud)
      drawOverlay(ctx, canvas, next, theme, hud)
    },
  }
}
