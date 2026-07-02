/**
 * Persistence & economy layer.
 *
 * Exposes ONE `PersistenceAdapter` interface (high scores per mode, coin
 * balance, cosmetic unlocks, leaderboard) that every caller — UI, economy,
 * future remote sync — talks to. `createLocalAdapter()` is the IndexedDB
 * implementation used today; `createMemoryAdapter()` is both its automatic
 * fallback when `indexedDB` is unavailable and a dependency-free adapter for
 * tests. A future remote leaderboard (Phase 7) slots in behind this same
 * interface without any caller changes.
 *
 * Economy tuning numbers (points-per-coin conversion, item prices, spawn
 * rates) live in `src/data/economy.config.ts` — never scattered throughout
 * the codebase. `src/data/economy.ts` is the pure conversion/unlock logic
 * plus purchase orchestration against a `PersistenceAdapter`. Unlocks
 * recorded here are cosmetic only (themes, skins); they must never grant a
 * gameplay advantage.
 *
 * No engine imports, no DOM beyond `indexedDB` itself, no UI.
 */
export type { LeaderboardEntry, PersistenceAdapter } from './adapter'
export { createLocalAdapter } from './local'
export { createMemoryAdapter } from './memory'

export type { ShopItem } from './economy.config'
export { ECONOMY, SHOP_CATALOG } from './economy.config'
export type { PurchaseResult } from './economy'
export {
  coinsForScore,
  isThemeUnlocked,
  getShopItem,
  purchaseItem,
  grantCoinsForScore,
} from './economy'
