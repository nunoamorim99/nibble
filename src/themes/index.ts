/**
 * Themes — data only. A theme is a tokens object (grid colors, snake-skin
 * sprite refs, food/coin sprites, background, cell style, optional sounds).
 * Swapping a theme is swapping a data object; adding one never touches the
 * engine. This barrel is also where sprite loading and the theme registry
 * live — sprite loading arrives once a spritesheet-based theme (ladder rung
 * 5+) does; for now every theme is code-drawn from tokens.
 */

export type { Theme, ThemeColors, ThemeCellStyle } from './types'
export { classicTheme } from './classic'
export { monoPlusTheme } from './monoPlus'
export { firstColorTheme } from './firstColor'
export { coloredPixelTheme } from './coloredPixel'
export { DEFAULT_THEME_ID, themeRegistry, getThemeById } from './registry'
