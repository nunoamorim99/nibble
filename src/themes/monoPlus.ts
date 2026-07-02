/**
 * Mono+ — the same one-color LCD world as Classic, but with a subtle pixel
 * bevel and rounded cell corners. Still strictly two colors (background +
 * ink); no image assets, cell-snapped movement stays off for the chunkier
 * period-appropriate feel.
 */
import type { Theme } from './types'

/** LCD background: the same pale olive-green glow as Classic. */
const LCD_BACKGROUND = '#c4cfa1'
/** LCD ink: the same near-black olive ink, shared by snake and food. */
const LCD_INK = '#1f261a'

export const monoPlusTheme: Theme = {
  id: 'mono-plus',
  name: 'Mono+',
  colors: {
    background: LCD_BACKGROUND,
    grid: null,
    snakeHead: LCD_INK,
    snakeBody: LCD_INK,
    food: LCD_INK,
    obstacle: LCD_INK,
    hudText: LCD_INK,
    overlayText: LCD_INK,
    overlayBackdrop: 'rgba(196, 207, 161, 0.85)',
  },
  cell: {
    shape: 'rounded',
    inset: 0.1,
    radius: 0.25,
    bevel: true,
  },
  interpolate: false,
}
