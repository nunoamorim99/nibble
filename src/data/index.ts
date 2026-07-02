/**
 * Persistence & economy layer.
 *
 * Exposes ONE `PersistenceAdapter` interface (high scores per mode, coin
 * balance, cosmetic unlocks, leaderboard) that every caller — UI, economy,
 * future remote sync — talks to. `createLocalAdapter()` is the IndexedDB
 * implementation used today; `createMemoryAdapter()` is both its automatic
 * fallback when `indexedDB` is unavailable and a dependency-free adapter for
 * tests. The remote (global) leaderboard (Phase 7) is
 * `createRemoteLeaderboardAdapter()`, a decorator over a `PersistenceAdapter`
 * that satisfies this exact same interface — callers never touch it
 * directly; use `createAdapter()` below, which picks local-only vs.
 * local+remote based on `REMOTE_LEADERBOARD` config, with no caller changes
 * either way.
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
import { createLocalAdapter } from './local'
import { createRemoteLeaderboardAdapter } from './remote'
import { REMOTE_LEADERBOARD } from './remote.config'
import type { PersistenceAdapter } from './adapter'

export type { LeaderboardEntry, PersistenceAdapter } from './adapter'
export { createLocalAdapter } from './local'
export { createMemoryAdapter } from './memory'

export type { RemoteLeaderboardConfig } from './remote.config'
export { REMOTE_LEADERBOARD } from './remote.config'
export { createRemoteLeaderboardAdapter } from './remote'

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

/**
 * The one factory the rest of the app (`main.ts`) calls to get "the"
 * persistence adapter. Returns the plain local (IndexedDB) adapter unless
 * `REMOTE_LEADERBOARD.enabled` — i.e. `VITE_LEADERBOARD_URL` and
 * `VITE_LEADERBOARD_ANON_KEY` are both set — in which case it wraps that
 * same local adapter with `createRemoteLeaderboardAdapter`. Either way the
 * return type is `PersistenceAdapter`, so this is the only place that ever
 * needs to know whether a remote backend is configured.
 */
export function createAdapter(): PersistenceAdapter {
  const local = createLocalAdapter()
  if (!REMOTE_LEADERBOARD.enabled) return local
  return createRemoteLeaderboardAdapter(local, REMOTE_LEADERBOARD)
}
