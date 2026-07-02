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
 * rates) live in `src/data/economy.config.ts` (Phase 4) — never scattered
 * throughout the codebase. Unlocks recorded here are cosmetic only (themes,
 * skins); they must never grant a gameplay advantage.
 *
 * No engine imports, no DOM beyond `indexedDB` itself, no UI.
 */
export type { LeaderboardEntry, PersistenceAdapter } from './adapter'
export { createLocalAdapter } from './local'
export { createMemoryAdapter } from './memory'
