/**
 * Cartoon — ladder rung 6. Expressive illustrated snake + food from a
 * code-generated (SVG + `sharp`) spritesheet, over a Higgsfield-generated
 * scenic background (`art-pipeline` owns both). `interpolate: true` for
 * smooth, lively motion befitting the cuter, more animated look. Warm
 * red/yellow eat-particle burst matches the food's own palette.
 */
import type { Theme } from './types'
import { assetUrl } from './assetUrl'

/** Warm, sunny fallback background tone (used while the scene loads/fails). */
const BACKGROUND = '#fde8b6'
/** Fallback flat green body/head color, used only until the sheet loads. */
const BODY_GREEN = '#5bb450'
const HEAD_GREEN = '#79cf5f'
/** Fallback warm-red food color, used only until the sheet loads. */
const FOOD_RED = '#e8543f'
/**
 * Dark, desaturated grey-brown "stone" obstacle tone — deliberately darker
 * and flatter than the bright, saturated food/snake hues (contrast ~2.1-4.0
 * against them) so a masonry block never blends into a warm red apple or
 * green snake segment the way the old warmer `#8a5a3b` brown nearly did
 * (contrast ~1.6 against food).
 */
const OBSTACLE_STONE = '#57534c'
/** Dark warm text, readable over the sunny palette. */
const DARK_TEXT = '#3a2a1a'
/** White eye dot, used only in the token fallback (sprites draw their own eye). */
const EYE_WHITE = '#ffffff'

export const cartoonTheme: Theme = {
  id: 'cartoon',
  name: 'Cartoon',
  colors: {
    background: BACKGROUND,
    backgroundImage: assetUrl('assets/backgrounds/cartoon/bg.png'),
    grid: null,
    snakeHead: HEAD_GREEN,
    snakeBody: BODY_GREEN,
    food: FOOD_RED,
    obstacle: OBSTACLE_STONE,
    hudText: DARK_TEXT,
    overlayText: DARK_TEXT,
    overlayBackdrop: 'rgba(253, 232, 182, 0.85)',
    eye: EYE_WHITE,
  },
  cell: {
    shape: 'rounded',
    inset: 0,
    radius: 0.3,
  },
  interpolate: true,
  sprites: {
    sheetUrl: assetUrl('assets/sprites/cartoon/sheet.png'),
    mapUrl: assetUrl('assets/sprites/cartoon/sheet.json'),
  },
  particles: {
    eat: ['#e8543f', '#f4a53a', '#ffd34d', '#f26b4d'],
  },
}
