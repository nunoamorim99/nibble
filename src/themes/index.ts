/**
 * Themes — data only. A theme is a tokens object (grid colors, snake-skin
 * sprite refs, food/coin sprites, background, cell style, optional sounds).
 * Swapping a theme is swapping a data object; adding one never touches the
 * engine. This barrel is also where sprite loading and the theme registry
 * will live once richer themes arrive in Phase 3 — for now it re-exports the
 * single classic theme.
 */

export type { Theme, ThemeColors, ThemeCellStyle } from './types'
export { classicTheme } from './classic'
