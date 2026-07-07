/**
 * Player-account sync — decorator + Edge Function client for cross-device
 * progress.
 *
 * `createPlayerSyncAdapter` is a DECORATOR over a `PersistenceAdapter` (the
 * local, or local+leaderboard, adapter). It satisfies the exact same
 * interface, so nothing outside `src/data/` knows a network call might be
 * involved — the same contract the leaderboard decorator (`remote.ts`) follows.
 *
 * Local-first, offline-safe by construction:
 *   - Reads (getCoins, getUnlocks, getHighScore, the leaderboard reads,
 *     getSetting) and `setHighScore`/`setSetting` pass straight through to
 *     `inner`. It does NOT
 *     pull the account on every read — a pull is an explicit event owned by
 *     the caller (boot with a known code, restore, profile-open), matching the
 *     leaderboard's fetch-only-when-its-screen-opens philosophy.
 *   - `setCoins`/`addUnlock` ALWAYS write `inner` first and await it, then
 *     best-effort push the full {coins, unlocks} snapshot to the Edge Function
 *     when a player code is present. Push failure is swallowed (warned once per
 *     session), never thrown — earning/spending never blocks on the network.
 *   - `submitScore` keeps its existing behavior (inner → leaderboard → local)
 *     and additionally POSTs the score to the account when a code is present.
 *
 * When accounts are disabled OR no player code is set (anonymous play), every
 * method is a transparent pass-through and NO network call is made.
 *
 * SECURITY: the coin balance is client-*earnable* and therefore not perfectly
 * cheat-proof. The Edge Function is the authority — it clamps values and can
 * enforce monotonic coins server-side (see `docs/PLAYER_ACCOUNTS.md`). This
 * module only shapes requests; it validates nothing itself.
 *
 * No engine/render/ui imports — adapter contract + request shaping only.
 */
import type { PersistenceAdapter } from './adapter'
import type { PlayerAccountsConfig } from './player.config'

/** One of the account's own scores, as returned by the Edge Function. */
export interface PlayerScore {
  readonly modeId: string
  readonly score: number
  readonly achievedAt: number
}

/** The full account snapshot the Edge Function returns for `get`. */
export interface PlayerAccount {
  readonly code: string
  readonly name: string
  readonly coins: number
  readonly unlocks: readonly string[]
  readonly scores: readonly PlayerScore[]
}

/** Result of the `create` action — no scores yet on a brand-new account. */
export interface CreatedAccount {
  readonly code: string
  readonly name: string
  readonly coins: number
  readonly unlocks: readonly string[]
}

/** Authoritative `{coins, unlocks}` the server returns after a `sync` (it may
 * have clamped/merged the client's values). */
export interface SyncedProgress {
  readonly coins: number
  readonly unlocks: readonly string[]
}

/**
 * Thin client over the Edge Function gatekeeper. One action-dispatched POST per
 * call. `fetchImpl` is injectable so the whole thing is testable with no real
 * network (see `tests/data/player-sync.test.ts`).
 *
 * Every method returns a typed result or `null`/throws on failure per its
 * doc — callers (the decorator, and the UI flows in main.ts) decide how to
 * degrade. The client is intentionally UI-agnostic.
 */
export interface PlayerClient {
  /** Create a new account for `name`; the server generates the authoritative
   * code. Throws on network/HTTP failure. */
  create(name: string): Promise<CreatedAccount>
  /** Fetch an account by code, or `null` if the code is unknown (404).
   * Throws on other failures. */
  get(code: string): Promise<PlayerAccount | null>
  /** Push the full progress snapshot; returns the server's authoritative
   * values. Throws on failure (the decorator swallows it). */
  sync(code: string, coins: number, unlocks: readonly string[]): Promise<SyncedProgress>
  /** Attach a score to the account. Throws on failure (callers swallow). */
  submitScore(
    code: string,
    modeId: string,
    score: number,
    achievedAtISO: string,
  ): Promise<void>
}

function headers(config: PlayerAccountsConfig): HeadersInit {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    'Content-Type': 'application/json',
  }
}

async function postAction(
  config: PlayerAccountsConfig,
  fetchImpl: typeof fetch,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchImpl(config.apiUrl, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(body),
  })
}

/**
 * Build the Edge Function client. Shared as ONE instance across the decorator
 * and the UI flows so any per-session state stays unified.
 */
export function createPlayerClient(
  config: PlayerAccountsConfig,
  fetchImpl: typeof fetch = fetch,
): PlayerClient {
  return {
    async create(name) {
      const res = await postAction(config, fetchImpl, { action: 'create', name })
      if (!res.ok) throw new Error(`player create failed: ${res.status}`)
      return (await res.json()) as CreatedAccount
    },

    async get(code) {
      const res = await postAction(config, fetchImpl, { action: 'get', code })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`player get failed: ${res.status}`)
      return (await res.json()) as PlayerAccount
    },

    async sync(code, coins, unlocks) {
      const res = await postAction(config, fetchImpl, {
        action: 'sync',
        code,
        coins,
        unlocks,
      })
      if (!res.ok) throw new Error(`player sync failed: ${res.status}`)
      return (await res.json()) as SyncedProgress
    },

    async submitScore(code, modeId, score, achievedAtISO) {
      const res = await postAction(config, fetchImpl, {
        action: 'submitScore',
        code,
        modeId,
        score,
        achievedAt: achievedAtISO,
      })
      if (!res.ok) throw new Error(`player submitScore failed: ${res.status}`)
    },
  }
}

/**
 * Wrap `inner` so coin/unlock writes also push to the account, and scores are
 * additionally attached to the account — but only when `config.enabled` AND a
 * player code is currently set (`getCode()` non-null). Everything else is a 1:1
 * pass-through.
 *
 * `getCode` is an accessor (not a snapshot) because the current account can be
 * swapped at runtime by a restore; the decorator asks on every call.
 */
export function createPlayerSyncAdapter(
  inner: PersistenceAdapter,
  config: PlayerAccountsConfig,
  getCode: () => string | null,
  client: PlayerClient,
): PersistenceAdapter {
  // Warned at most once per session, like the leaderboard decorator — a flaky
  // network shouldn't spam the console on every coin change.
  let warnedSyncFailure = false
  let warnedScoreFailure = false

  function activeCode(): string | null {
    return config.enabled ? getCode() : null
  }

  async function pushSnapshot(code: string): Promise<void> {
    try {
      const [coins, unlocks] = await Promise.all([inner.getCoins(), inner.getUnlocks()])
      await client.sync(code, coins, unlocks)
    } catch (error) {
      if (!warnedSyncFailure) {
        warnedSyncFailure = true
        console.warn(
          '[data] player sync failed; progress is saved locally only',
          error,
        )
      }
    }
  }

  return {
    // Reads + non-synced writes: 1:1 pass-through.
    getHighScore: (modeId) => inner.getHighScore(modeId),
    setHighScore: (modeId, score) => inner.setHighScore(modeId, score),
    getCoins: () => inner.getCoins(),
    getUnlocks: () => inner.getUnlocks(),
    getSetting: (key) => inner.getSetting(key),
    setSetting: (key, value) => inner.setSetting(key, value),
    getLeaderboard: (modeId, limit) => inner.getLeaderboard(modeId, limit),
    getLeaderboardPage: (modeId, options) => inner.getLeaderboardPage(modeId, options),

    async setCoins(balance) {
      await inner.setCoins(balance)
      const code = activeCode()
      if (code) await pushSnapshot(code)
    },

    async addUnlock(id) {
      await inner.addUnlock(id)
      const code = activeCode()
      if (code) await pushSnapshot(code)
    },

    async submitScore(entry) {
      // Inner keeps its full behavior (leaderboard → local); the account POST
      // is additive and independently failure-tolerant.
      await inner.submitScore(entry)
      const code = activeCode()
      if (!code) return
      try {
        await client.submitScore(
          code,
          entry.modeId,
          entry.score,
          new Date(entry.achievedAt).toISOString(),
        )
      } catch (error) {
        if (!warnedScoreFailure) {
          warnedScoreFailure = true
          console.warn(
            '[data] player score submit failed; score is saved locally only',
            error,
          )
        }
      }
    },
  }
}
