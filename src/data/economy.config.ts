/**
 * Economy tuning — the ONE place points-per-coin conversion, item prices, and
 * (later) spawn rates live. Nothing in `src/data/economy.ts` or any caller
 * hardcodes a number; they all read from here.
 *
 * Unlocks sold through `SHOP_CATALOG` are cosmetic only (themes today, skins
 * later — the `kind` union stays open for that). Nothing here may grant a
 * gameplay advantage; see `CLAUDE.md`.
 *
 * Data only: no adapter calls, no engine/render/ui imports.
 */

/** One purchasable cosmetic in the shop. */
export interface ShopItem {
  /** Stable id, also the unlock id recorded via `PersistenceAdapter.addUnlock`. */
  readonly id: string // e.g. 'theme:mono-plus'
  /** Cosmetic category. Only 'theme' exists today; the union stays open for
   * future kinds (e.g. 'skin') without changing this shape. */
  readonly kind: 'theme'
  /** Which theme (from `src/themes` registry) this item unlocks. */
  readonly themeId: string
  /** Display name shown in the shop UI. */
  readonly name: string
  /** Price in coins. */
  readonly price: number
}

/** Baseline economy tuning. */
export const ECONOMY = {
  /** Every `pointsPerCoin` points of score converts to 1 coin. */
  pointsPerCoin: 20,
} as const

/**
 * The shop catalog, in ladder (unlock) order. `classic` is the free default
 * theme and is intentionally NOT listed here — it is always unlocked
 * regardless of the catalog (see `isThemeUnlocked` in `economy.ts`).
 */
export const SHOP_CATALOG: readonly ShopItem[] = [
  {
    id: 'theme:mono-plus',
    kind: 'theme',
    themeId: 'mono-plus',
    name: 'Mono+',
    price: 50,
  },
  {
    id: 'theme:first-color',
    kind: 'theme',
    themeId: 'first-color',
    name: 'First Color',
    price: 100,
  },
  {
    id: 'theme:colored-pixel',
    kind: 'theme',
    themeId: 'colored-pixel',
    name: 'Colored Pixel',
    price: 200,
  },
]
