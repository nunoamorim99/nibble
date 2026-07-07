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
import { PLAYER_ACCOUNTS } from './player.config'
import { createIdentity, type Identity } from './identity'
import { createPlayerClient, createPlayerSyncAdapter, type PlayerClient } from './player-sync'
import type { PersistenceAdapter } from './adapter'

export type {
  LeaderboardEntry,
  LeaderboardPage,
  LeaderboardPageOptions,
  LeaderboardSource,
  PersistenceAdapter,
} from './adapter'
export { createLocalAdapter } from './local'
export { createMemoryAdapter } from './memory'

export type { RemoteLeaderboardConfig } from './remote.config'
export { REMOTE_LEADERBOARD } from './remote.config'
export { createRemoteLeaderboardAdapter } from './remote'

export type { PlayerAccountsConfig } from './player.config'
export { PLAYER_ACCOUNTS } from './player.config'
export type { Identity, Player, Progress } from './identity'
export {
  createIdentity,
  generatePlayerCode,
  normalizeCode,
  reconcile,
  CODE_PATTERN,
} from './identity'
export type {
  PlayerClient,
  PlayerAccount,
  PlayerScore,
  CreatedAccount,
  SyncedProgress,
} from './player-sync'
export { createPlayerClient, createPlayerSyncAdapter } from './player-sync'

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

/** Everything `main.ts` needs to run with (optional) player accounts. */
export interface PlayerRuntime {
  /** The composed adapter: local → (leaderboard if enabled) → (player-sync if
   * enabled). Always a plain `PersistenceAdapter` to every caller. */
  readonly adapter: PersistenceAdapter
  /** Current-player holder (present regardless of enablement; just never gets
   * a player set when accounts are disabled). */
  readonly identity: Identity
  /** The Edge Function client, or `null` when accounts are disabled. */
  readonly playerClient: PlayerClient | null
  /** Whether the account feature is configured (drives the welcome prompt and
   * the PROFILE menu entry). */
  readonly accountsEnabled: boolean
}

/**
 * Compose the full runtime: local IndexedDB, wrapped by the leaderboard
 * decorator when configured, then by the player-sync decorator when accounts
 * are configured. `identity` is built over the composed adapter so its
 * current-player state persists through the same storage; the sync decorator
 * reads the code via `identity.code`.
 *
 * When accounts are disabled this returns an adapter identical to
 * `createAdapter()` plus an idle identity and a null client — the app behaves
 * exactly as before the feature existed. This is the factory `main.ts` uses
 * instead of `createAdapter()`; `createAdapter()` stays for existing callers.
 */
export function createPlayerRuntime(): PlayerRuntime {
  const local = createLocalAdapter()
  const withLeaderboard = REMOTE_LEADERBOARD.enabled
    ? createRemoteLeaderboardAdapter(local, REMOTE_LEADERBOARD)
    : local

  // Identity is built over the leaderboard/local layer so its setSetting
  // persists locally; the player-sync decorator wraps OUTSIDE it and reads the
  // code through identity.code.
  const identity = createIdentity(withLeaderboard)

  if (!PLAYER_ACCOUNTS.enabled) {
    return { adapter: withLeaderboard, identity, playerClient: null, accountsEnabled: false }
  }

  const playerClient = createPlayerClient(PLAYER_ACCOUNTS)
  const adapter = createPlayerSyncAdapter(
    withLeaderboard,
    PLAYER_ACCOUNTS,
    identity.code,
    playerClient,
  )
  return { adapter, identity, playerClient, accountsEnabled: true }
}
