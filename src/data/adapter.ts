/**
 * The persistence adapter contract. Every consumer — UI, game shell — talks to
 * storage ONLY through this interface. That is the repo's core persistence
 * invariant: swapping the local IndexedDB implementation for another backend
 * means writing a new adapter that satisfies this same shape, not touching any
 * caller.
 *
 * Scope note: Nibble is a fully offline, single-device game. There are no
 * accounts, no coins, and no shared leaderboard — the only score kept is the
 * player's personal best per mode, which is what `getHighScore`/`setHighScore`
 * hold. Everything else the app persists (selected theme, mode, level
 * progress, sound and touch-pad preferences) is an opaque string setting.
 *
 * This file is data/contract only. No IndexedDB, no DOM, no engine imports.
 */

/**
 * The full persistence surface: personal best per mode, plus free-form
 * settings. All methods are async so a different storage implementation stays
 * a drop-in — no caller assumes storage is synchronous.
 */
export interface PersistenceAdapter {
  /** Best score recorded for `modeId`, or 0 if none yet. */
  getHighScore(modeId: string): Promise<number>
  /** Overwrite the stored high score for `modeId`. Callers decide whether a
   * new score beats the old one before calling this — the adapter does not
   * compare, it just stores. */
  setHighScore(modeId: string, score: number): Promise<void>

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
