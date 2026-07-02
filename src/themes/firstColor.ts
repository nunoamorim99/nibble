/**
 * First Color — the snake gains its first flat color (classic green) against
 * a plain light background, with a simple white eye on the head. Food turns
 * red. Still palette-only (code-drawn); no image assets. Interpolated motion
 * marks the shift away from the chunky monochrome era.
 */
import type { Theme } from './types'

/** Flat, slightly warm off-white background. */
const BACKGROUND = '#f4f1e8'
/** Classic snake-green body. */
const BODY_GREEN = '#2e7d32'
/** Slightly darker green for the head, so it reads distinctly from the body. */
const HEAD_GREEN = '#1b5e20'
/** Simple red food. */
const FOOD_RED = '#c62828'
/** White eye dot on the head. */
const EYE_WHITE = '#ffffff'
/** Neutral dark ink for obstacles and text. */
const INK = '#2b2b2b'

export const firstColorTheme: Theme = {
  id: 'first-color',
  name: 'First Color',
  colors: {
    background: BACKGROUND,
    grid: null,
    snakeHead: HEAD_GREEN,
    snakeBody: BODY_GREEN,
    food: FOOD_RED,
    obstacle: INK,
    hudText: INK,
    overlayText: INK,
    overlayBackdrop: 'rgba(244, 241, 232, 0.85)',
    eye: EYE_WHITE,
  },
  cell: {
    shape: 'square',
    inset: 0.08,
    radius: 0,
  },
  interpolate: true,
}
