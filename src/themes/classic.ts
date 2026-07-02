/**
 * Classic — authentic Nokia monochrome LCD. Drawn entirely from filled
 * rectangles by the renderer; no image assets, no grid lines, and chunky
 * cell-snapped movement (`interpolate: false`) to match the original 84x48
 * display feel. Snake and food share the same near-black olive ink color, the
 * way a real single-color LCD would render them.
 */
import type { Theme } from './types'

/** LCD background: the pale olive-green glow of an unlit Nokia screen. */
const LCD_BACKGROUND = '#c4cfa1'
/** LCD ink: the near-black olive of lit pixels — shared by snake and food. */
const LCD_INK = '#1f261a'

export const classicTheme: Theme = {
  id: 'classic',
  name: 'Classic',
  colors: {
    background: LCD_BACKGROUND,
    grid: null,
    snakeHead: LCD_INK,
    snakeBody: LCD_INK,
    food: LCD_INK,
    obstacle: LCD_INK,
    hudText: LCD_INK,
    overlayText: LCD_INK,
    // Translucent version of the background so the overlay reads as a dimmed
    // LCD rather than an unrelated color.
    overlayBackdrop: 'rgba(196, 207, 161, 0.85)',
  },
  cell: {
    shape: 'square',
    inset: 0.08,
    radius: 0,
  },
  interpolate: false,
}
