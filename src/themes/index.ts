/**
 * Themes — data only. A theme is a tokens object (grid colors, snake-skin
 * sprite refs, food/coin sprites, background, cell style, optional sounds).
 * Swapping a theme is swapping a data object; adding one never touches the
 * engine. The theme registry lives in `./registry`; sprite loading and the
 * part-resolution/particle/background-image logic that reads `sprites` /
 * `colors.backgroundImage` / `particles` live in `src/render/` (the renderer
 * lazy-loads and caches them — themes only ever declare the data).
 */

export type { Theme, ThemeColors, ThemeCellStyle, ThemeSprites, ThemeParticles } from './types'
export { classicTheme } from './classic'
export { monoPlusTheme } from './monoPlus'
export { firstColorTheme } from './firstColor'
export { coloredPixelTheme } from './coloredPixel'
export { detailedPixelTheme } from './detailedPixel'
export { cartoonTheme } from './cartoon'
export { neonTheme } from './neon'
export { DEFAULT_THEME_ID, themeRegistry, getThemeById } from './registry'
