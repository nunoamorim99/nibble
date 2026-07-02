/**
 * Detailed Pixel — ladder rung 5, the first skin-spritesheet theme. Snake and
 * food are drawn from a code-generated (SVG + `sharp`) spritesheet produced
 * by the `art-pipeline` agent; grid tokens still color the board itself. No
 * background image — just a subtle, flat "patterned" bg tone (a real tiled
 * pattern is a renderer/asset concern, not a theme-data one; this theme
 * stays true to a flat token so it degrades gracefully with zero assets).
 * `interpolate: false` keeps the chunky, tile-snapped pixel-art feel — a
 * sprite sliding smoothly between cells would blur the illusion of scales.
 */
import type { Theme } from './types'

/** Deep, slightly warm near-black board background. */
const BACKGROUND = '#1a1712'
/** Faint warm grid line, just enough to suggest a scaled/tiled board. */
const GRID_LINE = 'rgba(255, 214, 140, 0.05)'
/** Fallback flat green body/head color, used only until the sheet loads. */
const BODY_GREEN = '#4c8c3f'
const HEAD_GREEN = '#6ab54f'
/** Fallback amber food color, used only until the sheet loads. */
const FOOD_AMBER = '#e0a336'
/** Muted obstacle stone tone. */
const OBSTACLE_GREY = '#5a5346'
/** Warm off-white text. */
const LIGHT_TEXT = '#f3ecd8'
/** White eye dot, used only in the token fallback (sprites draw their own eye). */
const EYE_WHITE = '#ffffff'

export const detailedPixelTheme: Theme = {
  id: 'detailed-pixel',
  name: 'Detailed Pixel',
  colors: {
    background: BACKGROUND,
    grid: GRID_LINE,
    snakeHead: HEAD_GREEN,
    snakeBody: BODY_GREEN,
    food: FOOD_AMBER,
    obstacle: OBSTACLE_GREY,
    hudText: LIGHT_TEXT,
    overlayText: LIGHT_TEXT,
    overlayBackdrop: 'rgba(26, 23, 18, 0.85)',
    eye: EYE_WHITE,
  },
  cell: {
    shape: 'square',
    inset: 0,
    radius: 0,
  },
  interpolate: false,
  sprites: {
    sheetUrl: '/assets/sprites/detailed-pixel/sheet.png',
    mapUrl: '/assets/sprites/detailed-pixel/sheet.json',
    pixelated: true,
  },
}
