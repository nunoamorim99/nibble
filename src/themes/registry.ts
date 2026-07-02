/**
 * Theme registry — data + lookup only. Ladder order mirrors `docs/THEMES.md`
 * (rungs 1–4 asset-free; rungs 5–7 add skin spritesheets + rung 6/7 add
 * scenic backgrounds, both lazy-loaded by the renderer). Adding a theme means
 * adding its data file and one entry here; nothing else in the repo should
 * need to change.
 */
import type { Theme } from './types'
import { classicTheme } from './classic'
import { monoPlusTheme } from './monoPlus'
import { firstColorTheme } from './firstColor'
import { coloredPixelTheme } from './coloredPixel'
import { detailedPixelTheme } from './detailedPixel'
import { cartoonTheme } from './cartoon'
import { neonTheme } from './neon'

/** Theme selected on first run / when no persisted choice exists. */
export const DEFAULT_THEME_ID = 'classic'

/** All themes, in ladder (unlock) order. */
export const themeRegistry: readonly Theme[] = [
  classicTheme,
  monoPlusTheme,
  firstColorTheme,
  coloredPixelTheme,
  detailedPixelTheme,
  cartoonTheme,
  neonTheme,
]

/** Look up a theme by its stable `id`, or `undefined` if it isn't registered. */
export function getThemeById(id: string): Theme | undefined {
  return themeRegistry.find((theme) => theme.id === id)
}
