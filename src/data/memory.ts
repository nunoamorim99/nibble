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
import type { LeaderboardEntry, PersistenceAdapter } from './adapter'

const DEFAULT_LEADERBOARD_LIMIT = 10
const DEFAULT_PAGE_LIMIT = 25

/** Create a fresh, isolated in-memory adapter. */
export function createMemoryAdapter(): PersistenceAdapter {
  const highScores = new Map<string, number>()
  const unlocks = new Set<string>()
  const leaderboard: LeaderboardEntry[] = []
  const settings = new Map<string, string>()
  let coins = 0

  return {
    async getHighScore(modeId) {
      return highScores.get(modeId) ?? 0
    },

    async setHighScore(modeId, score) {
      highScores.set(modeId, score)
    },

    async getCoins() {
      return coins
    },

    async setCoins(balance) {
      coins = balance
    },

    async getUnlocks() {
      return Array.from(unlocks)
    },

    async addUnlock(id) {
      unlocks.add(id)
    },

    async getLeaderboard(modeId, limit = DEFAULT_LEADERBOARD_LIMIT) {
      return leaderboard
        .filter((entry) => entry.modeId === modeId)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
    },

    async getLeaderboardPage(modeId, options = {}) {
      const limit = options.limit ?? DEFAULT_PAGE_LIMIT
      const offset = options.offset ?? 0
      const ranked = leaderboard
        .filter((entry) => entry.modeId === modeId)
        .sort((a, b) => b.score - a.score)
      const entries = ranked.slice(offset, offset + limit)
      // In-memory always has the full set, so `hasMore` is exact here.
      return { entries, source: 'local', hasMore: offset + limit < ranked.length }
    },

    async submitScore(entry) {
      leaderboard.push(entry)
    },

    async getSetting(key) {
      return settings.get(key) ?? null
    },

    async setSetting(key, value) {
      settings.set(key, value)
    },
  }
}
