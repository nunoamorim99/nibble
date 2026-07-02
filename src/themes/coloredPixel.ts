/**
 * Colored Pixel — a small deliberate palette: a deep blue-grey gradient
 * background, a two-tone shaded green body, and amber food. Grid lines and
 * a pixel bevel are both on, hinting at the shaded/scaled look later rungs
 * will render with real sprites. Still fully procedural (code-drawn); no
 * image assets.
 */
import type { Theme } from './types'

/** Gradient top: lighter blue-grey. */
const BACKGROUND_TOP = '#2b3a4a'
/** Gradient bottom: deeper blue-grey. */
const BACKGROUND_BOTTOM = '#141d26'
/** Faint grid line color, readable against the dark gradient. */
const GRID_LINE = 'rgba(255, 255, 255, 0.06)'
/** Primary body green. */
const BODY_GREEN = '#43a047'
/** Secondary, slightly darker body green for the two-tone alternation. */
const BODY_GREEN_ALT = '#2e7d32'
/** Head green, distinct from both body tones. */
const HEAD_GREEN = '#66bb6a'
/** Amber food. */
const FOOD_AMBER = '#ffb300'
/** Muted obstacle color that reads against the dark background. */
const OBSTACLE_GREY = '#5c6b7a'
/** Light text for HUD/overlay against the dark background. */
const LIGHT_TEXT = '#eceff1'
/** White eye dot on the head. */
const EYE_WHITE = '#ffffff'

export const coloredPixelTheme: Theme = {
  id: 'colored-pixel',
  name: 'Colored Pixel',
  colors: {
    background: BACKGROUND_BOTTOM,
    backgroundGradient: [BACKGROUND_TOP, BACKGROUND_BOTTOM],
    grid: GRID_LINE,
    snakeHead: HEAD_GREEN,
    snakeBody: BODY_GREEN,
    snakeBodyAlt: BODY_GREEN_ALT,
    food: FOOD_AMBER,
    obstacle: OBSTACLE_GREY,
    hudText: LIGHT_TEXT,
    overlayText: LIGHT_TEXT,
    overlayBackdrop: 'rgba(20, 29, 38, 0.85)',
    eye: EYE_WHITE,
  },
  cell: {
    shape: 'square',
    inset: 0.08,
    radius: 0,
    bevel: true,
  },
  interpolate: true,
}
