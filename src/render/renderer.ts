/**
 * Canvas renderer. Reads an immutable `GameState` (plus the previous tick's
 * state for interpolation) and the active `Theme`, and draws — nothing here
 * decides game rules. Cell geometry is recomputed from the canvas size every
 * draw so the game can be resized without the renderer or engine knowing.
 */
import type { GameState, Vec2 } from '../engine'
import { DIRECTION_VECTORS } from '../engine'
import type { Theme } from '../themes'
import { createBackgroundImageCache } from './backgroundImage'
import { createParticleSystem } from './particles'
import type { LoadedSprites, PartKey } from './sprites'
import { createSpriteCache, partSourceRect, resolveSegmentPart } from './sprites'

/** Read-only HUD data supplied by the caller; the renderer never computes it. */
export interface Hud {
  readonly highScore?: number
  /** Loop-level pause flag (pause is not engine state); drawn as an overlay. */
  readonly paused?: boolean
  /** Optional top-center label (e.g. level progress); text is caller-composed. */
  readonly levelLabel?: string
  /** Optional overrides for the round-end overlay text (display data only). */
  readonly overlayTitle?: string
  readonly overlayHint?: string
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

/** Alpha of the `background`-colored dimming overlay drawn on top of a scenic `backgroundImage`. */
const BACKGROUND_IMAGE_OVERLAY_ALPHA = 0.35

/**
 * Fill the canvas background. Precedence: a loaded `backgroundImage` (drawn
 * cover-scaled, then dimmed with a translucent `background` overlay so
 * gameplay stays readable) > a vertical `backgroundGradient` > the flat
 * `background` color. While the image is still loading (or failed), this
 * falls back to the gradient/flat fill — never a blank frame.
 */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  theme: Theme,
  backgroundImage: HTMLImageElement | undefined,
): void {
  if (backgroundImage) {
    drawCoverImage(ctx, canvas, backgroundImage)
    ctx.fillStyle = withAlpha(theme.colors.background, BACKGROUND_IMAGE_OVERLAY_ALPHA)
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    return
  }

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

/** Draw `image` scaled to cover the canvas (cropping overflow), centered. */
function drawCoverImage(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, image: HTMLImageElement): void {
  const canvasRatio = canvas.width / canvas.height
  const imageRatio = image.width / image.height

  let drawWidth = canvas.width
  let drawHeight = canvas.height
  if (imageRatio > canvasRatio) {
    drawHeight = canvas.height
    drawWidth = drawHeight * imageRatio
  } else {
    drawWidth = canvas.width
    drawHeight = drawWidth / imageRatio
  }

  const dx = (canvas.width - drawWidth) / 2
  const dy = (canvas.height - drawHeight) / 2
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight)
}

/**
 * Convert a theme color token to an `rgba()` string at `alpha`, so the
 * background-dimming overlay always matches the theme's own `background`
 * hue without requiring a second token. Supports `#rgb`/`#rrggbb` hex input
 * (every theme's `background` token today); any other CSS color string is
 * returned unchanged (falls back to fully opaque rather than guessing).
 */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim()
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex)
  if (!match) return color

  const value = match[1]
  const expand = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const r = Number.parseInt(expand.slice(0, 2), 16)
  const g = Number.parseInt(expand.slice(2, 4), 16)
  const b = Number.parseInt(expand.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Draw one named sprite `part` from `sprites` into `rect`, honoring the
 * sheet's `pixelated` flag (nearest-neighbor for chunky pixel art vs. the
 * canvas default smoothing for painterly sheets). Returns `false` (drawing
 * nothing) if the sheet has no tile for that part, so callers can fall back
 * to the token-driven `fillCell` pipeline for that one segment.
 */
function drawSpritePart(
  ctx: CanvasRenderingContext2D,
  sprites: LoadedSprites,
  part: PartKey,
  rect: CellRect,
): boolean {
  const source = partSourceRect(sprites.map, part)
  if (!source) return false

  const wasSmoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = !sprites.pixelated
  ctx.drawImage(sprites.image, source.sx, source.sy, source.size, source.size, rect.x, rect.y, rect.size, rect.size)
  ctx.imageSmoothingEnabled = wasSmoothing
  return true
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

function drawFood(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  food: Vec2 | null,
  theme: Theme,
  sprites: LoadedSprites | undefined,
): void {
  if (!food) return
  const rect = cellToRect(food, layout, theme.cell.inset)
  if (sprites && drawSpritePart(ctx, sprites, 'food', rect)) return
  fillCell(ctx, rect, theme, theme.colors.food)
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
 * Draw the snake. With a loaded spritesheet, each segment's tile is chosen
 * from the *authoritative* (non-interpolated) `next.snake` neighbor geometry
 * — head facing, and each middle/tail segment's neighbor offsets — then
 * drawn at the (possibly interpolated) on-screen position, tail-to-head so
 * later-drawn segments overlap earlier ones correctly. Without a loaded
 * sheet, falls back to the token pipeline: flat/alternating body fill, then
 * the head on top with an optional eye dot facing `next.direction`.
 */
function drawSnake(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  prev: GameState | null,
  next: GameState,
  alpha: number,
  theme: Theme,
  interpolate: boolean,
  sprites: LoadedSprites | undefined,
): void {
  const prevSnake = prev?.snake
  const snake = next.snake
  const positions = snake.map((cell, index) =>
    resolveSegmentPosition(prevSnake?.[index], cell, alpha, interpolate),
  )

  if (sprites) {
    for (let index = snake.length - 1; index >= 0; index--) {
      const part = resolveSegmentPart(
        index,
        snake.length,
        snake[index],
        snake[index - 1],
        snake[index + 1],
        next.direction,
      )
      const rect = cellToRect(positions[index], layout, theme.cell.inset)
      if (!drawSpritePart(ctx, sprites, part, rect)) {
        // This one part is missing from an otherwise-loaded sheet — fall
        // back to a token fill for just this segment rather than skip it.
        const color = index === 0 ? theme.colors.snakeHead : theme.colors.snakeBody
        fillCell(ctx, rect, theme, color)
      }
    }
    return
  }

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

  if (hud?.highScore !== undefined) {
    ctx.textAlign = 'right'
    ctx.fillText(`HI ${Math.floor(hud.highScore)}`, canvas.width - HUD_MARGIN, HUD_MARGIN)
  }

  if (hud?.levelLabel) {
    ctx.textAlign = 'center'
    ctx.fillText(hud.levelLabel, Math.round(canvas.width / 2), HUD_MARGIN)
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
    ctx.fillText(hud?.overlayTitle ?? 'PAUSED', centerX, centerY - OVERLAY_LINE_GAP)
    ctx.font = OVERLAY_LINE_FONT
    ctx.fillText(hud?.overlayHint ?? 'Press P to resume', centerX, centerY + OVERLAY_LINE_GAP * 0.4)
    return
  }

  const title = hud?.overlayTitle ?? (next.status === 'won' ? 'YOU WIN' : 'GAME OVER')
  const hint = hud?.overlayHint ?? 'Press Enter to restart'

  ctx.font = OVERLAY_TITLE_FONT
  ctx.fillText(title, centerX, centerY - OVERLAY_LINE_GAP)

  ctx.font = OVERLAY_LINE_FONT
  ctx.fillText(`FINAL SCORE ${Math.floor(next.score)}`, centerX, centerY + OVERLAY_LINE_GAP * 0.4)
  ctx.fillText(hint, centerX, centerY + OVERLAY_LINE_GAP * 1.6)
}

/**
 * Whether the platform prefers reduced motion, read once at renderer
 * creation. Presentation-only concern (disables particle bursts and forces
 * cell-snapped movement); never consulted by any game decision. Falls back
 * to `false` (full motion) in environments without `matchMedia` (e.g. tests).
 */
function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Fallback single-color eat-particle palette when a theme defines no `particles.eat`. */
function eatParticlePalette(theme: Theme): readonly string[] {
  return theme.particles?.eat && theme.particles.eat.length > 0
    ? theme.particles.eat
    : [theme.colors.food]
}

/** Create a `Renderer` bound to one canvas. Never reads or holds engine state between calls. */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  const spriteCache = createSpriteCache()
  const backgroundImageCache = createBackgroundImageCache()
  const particles = createParticleSystem()
  const reducedMotion = prefersReducedMotion()

  // Tracks the most recent `next` snapshot a burst was already spawned for,
  // by reference. `draw` is called once per animation frame but `next` only
  // changes once per logical tick (the engine returns a fresh, immutable
  // snapshot from `step`), so comparing references — not values — is what
  // makes "spawn once per eaten apple" correct even though this same
  // `next`/`prev` pair is redrawn many times while interpolating toward it.
  let lastBurstFor: GameState | null = null

  return {
    draw(prev, next, alpha, theme, hud) {
      const { cols, rows, obstacles } = next.config
      const layout = computeLayout(canvas, cols, rows)
      const clampedAlpha = Math.min(1, Math.max(0, alpha))
      const interpolate = theme.interpolate && !reducedMotion

      const loadedSprites = theme.sprites ? spriteCache.get(theme.id, theme.sprites) : undefined
      const backgroundImage = theme.colors.backgroundImage
        ? backgroundImageCache.get(theme.colors.backgroundImage)
        : undefined

      // Cosmetic-only: detect an apple eaten since the last logical tick
      // (display data, not a decision) and spawn a burst at its last known
      // cell, exactly once per fresh `next` snapshot.
      const now = performance.now()
      if (
        !reducedMotion &&
        prev &&
        next !== lastBurstFor &&
        next.applesEaten > prev.applesEaten &&
        prev.food
      ) {
        particles.spawnBurst(prev.food, eatParticlePalette(theme), now)
      }
      if (next !== lastBurstFor) lastBurstFor = next

      drawBackground(ctx, canvas, theme, backgroundImage)
      drawGridLines(ctx, layout, cols, rows, theme)
      drawObstacles(ctx, layout, obstacles, theme)
      drawFood(ctx, layout, next.food, theme, loadedSprites)
      drawSnake(ctx, layout, prev, next, clampedAlpha, theme, interpolate, loadedSprites)
      if (reducedMotion) {
        particles.clear()
      } else {
        particles.draw(ctx, now, layout.cellSize, (cellX, cellY) => {
          const rect = cellToRect({ x: cellX, y: cellY }, layout, 0)
          return { x: rect.x, y: rect.y }
        })
      }
      drawHud(ctx, canvas, next, theme, hud)
      drawOverlay(ctx, canvas, next, theme, hud)
    },
  }
}
