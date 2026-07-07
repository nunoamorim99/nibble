/**
 * The persistence adapter contract. Every consumer — UI, economy, future
 * remote sync — talks to storage ONLY through this interface. That is the
 * repo's core persistence invariant: swapping the local IndexedDB
 * implementation for a remote backend (Phase 7) means writing a new adapter
 * that satisfies this same shape, not touching any caller.
 *
 * This file is data/contract only. No IndexedDB, no DOM, no engine imports.
 */

/**
 * One submitted result for a leaderboard. `achievedAt` is a Unix ms
 * timestamp (caller-supplied, e.g. `Date.now()` — this layer never reaches
 * for the clock itself; see engine convention on injected time).
 */
export interface LeaderboardEntry {
  /** Which mode/level this score was achieved under. */
  readonly modeId: string
  /** Display name of the player. Local-only today; may come from an
   * authenticated identity once a remote backend exists. */
  readonly name: string
  readonly score: number
  readonly achievedAt: number
}

/**
 * Where a leaderboard read's rows actually came from.
 *  - `'remote'`: served by the global (Supabase) backend.
 *  - `'local'`: served by on-device storage — either because no remote is
 *    configured, or because a remote read failed and the adapter fell back.
 *    The UI uses this to show a "showing local scores" notice instead of
 *    silently presenting device-only data as if it were the global board.
 */
export type LeaderboardSource = 'remote' | 'local'

/**
 * One page of leaderboard rows plus provenance and whether more rows likely
 * exist. `hasMore` is a best-effort hint for infinite scroll: it is `true`
 * when the store returned a full `limit`-sized page (so another page is worth
 * requesting) and `false` once a short/empty page comes back.
 */
export interface LeaderboardPage {
  readonly entries: readonly LeaderboardEntry[]
  readonly source: LeaderboardSource
  readonly hasMore: boolean
}

/** Options for a paged leaderboard read. Both default implementation-defined. */
export interface LeaderboardPageOptions {
  /** Max rows to return for this page. */
  readonly limit?: number
  /** How many top rows to skip before this page (for infinite scroll). */
  readonly offset?: number
}

/**
 * The full persistence surface: high scores, coin balance, cosmetic
 * unlocks, and a leaderboard. All methods are async so a remote
 * implementation (Phase 7) is a drop-in — no caller ever assumes storage is
 * local or synchronous.
 */
export interface PersistenceAdapter {
  /** Best score recorded for `modeId`, or 0 if none yet. */
  getHighScore(modeId: string): Promise<number>
  /** Overwrite the stored high score for `modeId`. Callers decide whether a
   * new score beats the old one before calling this — the adapter does not
   * compare, it just stores. */
  setHighScore(modeId: string, score: number): Promise<void>

  /** Current coin balance. */
  getCoins(): Promise<number>
  /** Overwrite the coin balance. Economy math (points→coins conversion,
   * prices) lives in `src/data/economy.config.ts`, never here — this is
   * just the store. */
  setCoins(balance: number): Promise<void>

  /** All unlocked cosmetic ids (themes, skins). Order is not guaranteed. */
  getUnlocks(): Promise<readonly string[]>
  /** Grant a cosmetic unlock. Idempotent — adding an id already present is a
   * no-op. Unlocks are cosmetic only; nothing behind this call may affect
   * gameplay. */
  addUnlock(id: string): Promise<void>

  /**
   * Top entries for `modeId`, best score first, limited to `limit` (default
   * implementation-defined, typically 10).
   */
  getLeaderboard(
    modeId: string,
    limit?: number,
  ): Promise<readonly LeaderboardEntry[]>

  /**
   * One page of leaderboard rows for `modeId`, best score first, for the
   * dedicated scrollable leaderboard screen (infinite scroll). Returns the
   * rows plus `source` (remote vs. local fallback) and a `hasMore` hint.
   *
   * This is additive to `getLeaderboard`: that method stays the simple
   * "top N entries" read used elsewhere; this one adds `offset` paging and
   * provenance for the leaderboard page.
   */
  getLeaderboardPage(
    modeId: string,
    options?: LeaderboardPageOptions,
  ): Promise<LeaderboardPage>
  /**
   * Submit one leaderboard entry.
   *
   * SECURITY NOTE (Phase 7 remote backend): a client-submitted score is
   * untrusted input. The local adapter has no server to validate against,
   * so it stores whatever it is given. When a remote adapter replaces this
   * one, server-side validation (e.g. replay/tick-count plausibility
   * checks, rate limiting, auth binding `name` to an account) must slot in
   * on the server side of that adapter's `submitScore` — never trust a
   * client-reported score as-is.
   */
  submitScore(entry: LeaderboardEntry): Promise<void>

  /**
   * Free-form UI/app settings (e.g. the selected theme id). Values are
   * opaque strings — callers JSON-encode structured values themselves
   * before calling `setSetting` and decode after `getSetting`. Returns
   * `null` if `key` has never been set.
   */
  getSetting(key: string): Promise<string | null>
  /** Store an opaque string value under `key`. Overwrites any prior value. */
  setSetting(key: string, value: string): Promise<void>
}
