/**
 * Remote (global) leaderboard adapter — Phase 7.
 *
 * `createRemoteLeaderboardAdapter` is a DECORATOR over a `PersistenceAdapter`
 * (normally `createLocalAdapter()`): it satisfies the exact same interface,
 * so nothing outside `src/data/` ever needs to know a network call might be
 * involved. All non-leaderboard methods (scores, coins, unlocks, settings)
 * delegate 1:1 to `local` — this adapter's only behavior change is around
 * `getLeaderboard`/`submitScore`, and only when `config.enabled`.
 *
 * Local-first, offline-safe by construction:
 *   - `getLeaderboard` — when disabled, pure local read. When enabled, tries
 *     one GET against the configured PostgREST endpoint; ANY failure
 *     (network error, non-2xx, malformed JSON) falls back to
 *     `local.getLeaderboard` so a flaky/absent network never breaks the
 *     leaderboard screen.
 *   - `submitScore` — ALWAYS writes to `local` first and awaits it, so the
 *     score is never lost even if the remote call never fires or fails.
 *     When enabled, also POSTs to the remote table; failure there is
 *     swallowed (logged once per session, not once per call) rather than
 *     thrown, so the player-visible round-end flow never blocks on network.
 *
 * SECURITY NOTE: a client-submitted score is untrusted input (see the same
 * note on `PersistenceAdapter.submitScore` in `adapter.ts`). This module
 * does not and cannot validate scores — that has to happen server-side,
 * once a real backend exists. See `docs/REMOTE_LEADERBOARD.md` for the
 * server-side validation story (CHECK constraints, RLS, and the replay/
 * tick-trace validation that would be the actual anti-cheat fix).
 *
 * No engine/render/ui imports — adapter contract + this file's own request
 * shaping only.
 */
import type {
  LeaderboardEntry,
  LeaderboardPage,
  PersistenceAdapter,
} from './adapter'
import type { RemoteLeaderboardConfig } from './remote.config'

const DEFAULT_LEADERBOARD_LIMIT = 10
const DEFAULT_PAGE_LIMIT = 25

/** PostgREST row shape for the `scores` table (snake_case, per SQL schema). */
interface RemoteScoreRow {
  readonly mode_id: string
  readonly name: string
  readonly score: number
  readonly achieved_at: string
}

/** snake_case remote row -> camelCase `LeaderboardEntry`. */
function rowToEntry(row: RemoteScoreRow): LeaderboardEntry {
  return {
    modeId: row.mode_id,
    name: row.name,
    score: row.score,
    achievedAt: Date.parse(row.achieved_at),
  }
}

/** camelCase `LeaderboardEntry` -> snake_case row for the POST body. */
function entryToRow(entry: LeaderboardEntry): RemoteScoreRow {
  return {
    mode_id: entry.modeId,
    name: entry.name,
    score: entry.score,
    achieved_at: new Date(entry.achievedAt).toISOString(),
  }
}

function restHeaders(config: RemoteLeaderboardConfig): HeadersInit {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
  }
}

function leaderboardUrl(
  config: RemoteLeaderboardConfig,
  modeId: string,
  limit: number,
  offset = 0,
): string {
  const params = new URLSearchParams({
    mode_id: `eq.${modeId}`,
    select: 'mode_id,name,score,achieved_at',
    order: 'score.desc',
    limit: String(limit),
  })
  // PostgREST paginates with offset+limit; omit offset=0 to keep the
  // top-N (non-paged) URL byte-identical to before.
  if (offset > 0) params.set('offset', String(offset))
  return `${config.url}/rest/v1/${config.table}?${params.toString()}`
}

function submitUrl(config: RemoteLeaderboardConfig): string {
  return `${config.url}/rest/v1/${config.table}`
}

/**
 * Wrap `local` so `getLeaderboard`/`submitScore` also talk to the configured
 * remote (Supabase-shaped) backend when `config.enabled`, while every other
 * method passes straight through to `local`. Injecting `fetchImpl` keeps
 * this fully testable without a real network (see `tests/data/remote.test.ts`).
 */
export function createRemoteLeaderboardAdapter(
  local: PersistenceAdapter,
  config: RemoteLeaderboardConfig,
  fetchImpl: typeof fetch = fetch,
): PersistenceAdapter {
  // Logged at most once per adapter instance (i.e. once per session), not
  // once per failed call — a flaky/offline network shouldn't spam the
  // console every round.
  let warnedGetFailure = false
  let warnedSubmitFailure = false

  async function remoteGetLeaderboard(
    modeId: string,
    limit: number,
  ): Promise<readonly LeaderboardEntry[]> {
    try {
      const response = await fetchImpl(leaderboardUrl(config, modeId, limit), {
        method: 'GET',
        headers: restHeaders(config),
      })
      if (!response.ok) {
        throw new Error(`remote leaderboard GET failed: ${response.status}`)
      }
      const rows = (await response.json()) as readonly RemoteScoreRow[]
      return rows.map(rowToEntry)
    } catch (error) {
      if (!warnedGetFailure) {
        warnedGetFailure = true
        console.warn(
          '[data] remote leaderboard fetch failed; falling back to local leaderboard',
          error,
        )
      }
      return local.getLeaderboard(modeId, limit)
    }
  }

  async function remoteGetLeaderboardPage(
    modeId: string,
    limit: number,
    offset: number,
  ): Promise<LeaderboardPage> {
    try {
      const response = await fetchImpl(
        leaderboardUrl(config, modeId, limit, offset),
        { method: 'GET', headers: restHeaders(config) },
      )
      if (!response.ok) {
        throw new Error(`remote leaderboard GET failed: ${response.status}`)
      }
      const rows = (await response.json()) as readonly RemoteScoreRow[]
      // No exact server count here (that would need `Prefer: count=…`), so
      // infer "more pages exist" from a full page coming back.
      return {
        entries: rows.map(rowToEntry),
        source: 'remote',
        hasMore: rows.length >= limit,
      }
    } catch (error) {
      if (!warnedGetFailure) {
        warnedGetFailure = true
        console.warn(
          '[data] remote leaderboard fetch failed; falling back to local leaderboard',
          error,
        )
      }
      // Fall back to the local page — its own `source: 'local'` is what the
      // UI surfaces as "showing local scores".
      return local.getLeaderboardPage(modeId, { limit, offset })
    }
  }

  async function remoteSubmitScore(entry: LeaderboardEntry): Promise<void> {
    try {
      const response = await fetchImpl(submitUrl(config), {
        method: 'POST',
        headers: {
          ...restHeaders(config),
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(entryToRow(entry)),
      })
      if (!response.ok) {
        throw new Error(`remote leaderboard POST failed: ${response.status}`)
      }
    } catch (error) {
      if (!warnedSubmitFailure) {
        warnedSubmitFailure = true
        console.warn(
          '[data] remote leaderboard submit failed; score is saved locally only',
          error,
        )
      }
    }
  }

  return {
    // Scores/coins/unlocks/settings: 1:1 delegation to `local`. The remote
    // leaderboard is additive to submitScore/getLeaderboard only — nothing
    // else in the adapter surface changes behavior.
    getHighScore: (modeId) => local.getHighScore(modeId),
    setHighScore: (modeId, score) => local.setHighScore(modeId, score),
    getCoins: () => local.getCoins(),
    setCoins: (balance) => local.setCoins(balance),
    getUnlocks: () => local.getUnlocks(),
    addUnlock: (id) => local.addUnlock(id),
    getSetting: (key) => local.getSetting(key),
    setSetting: (key, value) => local.setSetting(key, value),

    async getLeaderboard(modeId, limit = DEFAULT_LEADERBOARD_LIMIT) {
      if (!config.enabled) return local.getLeaderboard(modeId, limit)
      return remoteGetLeaderboard(modeId, limit)
    },

    async getLeaderboardPage(modeId, options = {}) {
      const limit = options.limit ?? DEFAULT_PAGE_LIMIT
      const offset = options.offset ?? 0
      // Disabled → pure local page (source: 'local'); the UI shows the
      // "local scores" notice only when a remote was expected but failed,
      // which is the enabled path below.
      if (!config.enabled) return local.getLeaderboardPage(modeId, { limit, offset })
      return remoteGetLeaderboardPage(modeId, limit, offset)
    },

    async submitScore(entry) {
      // Local-first: always persisted, always awaited, regardless of the
      // remote outcome below.
      await local.submitScore(entry)
      if (!config.enabled) return
      await remoteSubmitScore(entry)
    },
  }
}
