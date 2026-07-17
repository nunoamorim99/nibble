/**
 * In-memory `PersistenceAdapter`. Backs two use cases:
 *  - the fallback when `indexedDB` is unavailable (private browsing, older
 *    browsers, non-browser test runners) so the game degrades to
 *    "works for this tab session" instead of crashing;
 *  - a fast, dependency-free adapter for unit tests elsewhere in the repo.
 *
 * State lives only for the lifetime of the object — nothing survives a
 * reload. No IndexedDB, no DOM.
 */
import type { PersistenceAdapter } from './adapter'

/** Create a fresh, isolated in-memory adapter. */
export function createMemoryAdapter(): PersistenceAdapter {
  const highScores = new Map<string, number>()
  const settings = new Map<string, string>()

  return {
    async getHighScore(modeId) {
      return highScores.get(modeId) ?? 0
    },

    async setHighScore(modeId, score) {
      highScores.set(modeId, score)
    },

    async getSetting(key) {
      return settings.get(key) ?? null
    },

    async setSetting(key, value) {
      settings.set(key, value)
    },
  }
}
