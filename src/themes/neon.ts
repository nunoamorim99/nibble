/**
 * Neon — ladder rung 7. Glowing futuristic snake + food from a
 * code-generated (SVG + `sharp` + glow) spritesheet, over a Higgsfield
 * sci-fi scene (`art-pipeline` owns both). Dark palette with cyan/magenta
 * accents; faint cyan grid lines suggest a HUD/holographic board.
 * `interpolate: true` for a smooth, glowing trail. Particle burst mixes
 * cyan/magenta/white to match the neon accent palette.
 */
import type { Theme } from './types'

/** Near-black dark-sci-fi fallback background (used while the scene loads/fails). */
const BACKGROUND = '#05070d'
/** Faint cyan grid line — a holographic board suggestion. */
const GRID_LINE = 'rgba(74, 227, 255, 0.08)'
/** Fallback cyan body/head color, used only until the sheet loads. */
const BODY_CYAN = '#2fd8e0'
const HEAD_CYAN = '#7ef2f7'
/** Fallback magenta food color, used only until the sheet loads. */
const FOOD_MAGENTA = '#ff4fd8'
/** Dim violet obstacle tone, distinct from both accent colors. */
const OBSTACLE_VIOLET = '#4a3a66'
/** Bright cyan-white HUD/overlay text. */
const LIGHT_TEXT = '#d8fbff'
/** Magenta eye dot, used only in the token fallback (sprites draw their own eye). */
const EYE_MAGENTA = '#ff4fd8'

export const neonTheme: Theme = {
  id: 'neon',
  name: 'Neon',
  colors: {
    background: BACKGROUND,
    backgroundImage: '/assets/backgrounds/neon/bg.png',
    grid: GRID_LINE,
    snakeHead: HEAD_CYAN,
    snakeBody: BODY_CYAN,
    food: FOOD_MAGENTA,
    obstacle: OBSTACLE_VIOLET,
    hudText: LIGHT_TEXT,
    overlayText: LIGHT_TEXT,
    overlayBackdrop: 'rgba(5, 7, 13, 0.85)',
    eye: EYE_MAGENTA,
  },
  cell: {
    shape: 'square',
    inset: 0,
    radius: 0,
  },
  interpolate: true,
  sprites: {
    sheetUrl: '/assets/sprites/neon/sheet.png',
    mapUrl: '/assets/sprites/neon/sheet.json',
  },
  particles: {
    eat: ['#4ae3ff', '#ff4fd8', '#ffffff'],
  },
}
