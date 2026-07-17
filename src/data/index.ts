/**
 * Persistence layer.
 *
 * Exposes ONE `PersistenceAdapter` interface (personal best per mode, plus
 * opaque settings) that every caller — UI, game shell — talks to.
 * `createLocalAdapter()` is the IndexedDB implementation used today;
 * `createMemoryAdapter()` is both its automatic fallback when `indexedDB` is
 * unavailable and a dependency-free adapter for tests. Callers should use
 * `createAdapter()` below rather than picking an implementation themselves.
 *
 * Nibble is offline-only and single-device: no accounts, no coins, no shared
 * leaderboard. The one score it keeps is the player's own best per mode, as a
 * target to beat. Every theme is available from the start.
 *
 * No engine imports, no DOM beyond `indexedDB` itself, no UI.
 */
import { createLocalAdapter } from './local'
import type { PersistenceAdapter } from './adapter'

export type { PersistenceAdapter } from './adapter'
export { createLocalAdapter } from './local'
export { createMemoryAdapter } from './memory'

/**
 * The one factory the rest of the app (`main.ts`) calls to get "the"
 * persistence adapter — the local IndexedDB store, which self-heals to an
 * in-memory adapter if IndexedDB is unusable.
 */
export function createAdapter(): PersistenceAdapter {
  return createLocalAdapter()
}
