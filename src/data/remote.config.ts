/**
 * Config for the optional remote (global) leaderboard — Phase 7.
 *
 * Shaped for Supabase's PostgREST endpoint (`/rest/v1/<table>`), but nothing
 * outside `remote.ts` needs to know that; this is a plain data object read
 * once at module load.
 *
 * Disabled by default: with no env vars set, `enabled` is `false` and
 * `createAdapter()` (see `index.ts`) hands back the plain local adapter, so
 * the game is fully local-first/offline until an operator opts in.
 *
 * Data only: no fetch, no adapter logic, no engine/render/ui imports.
 */

/** Shape of the remote-leaderboard config, independent of how it's read. */
export interface RemoteLeaderboardConfig {
  /** Whether the remote adapter should attempt any network call at all. */
  readonly enabled: boolean
  /** Supabase project URL, e.g. `https://xyz.supabase.co`. Empty when disabled. */
  readonly url: string
  /** Supabase anon (public) API key. Empty when disabled. Never a service key. */
  readonly anonKey: string
  /** PostgREST table name holding leaderboard rows. Defaults to `'scores'`. */
  readonly table: string
}

const DEFAULT_TABLE = 'scores'

/**
 * Read config from Vite-injected env vars (`VITE_LEADERBOARD_URL`,
 * `VITE_LEADERBOARD_ANON_KEY`, `VITE_LEADERBOARD_TABLE`). Every access is
 * optional-chained with a nullish fallback, so an environment where none of
 * these are defined (the default, and every environment today) resolves to
 * a fully-disabled config rather than throwing.
 *
 * Enabled only when BOTH the URL and anon key are present and non-empty —
 * a partially-configured deployment stays disabled (and thus safely local)
 * rather than attempting half-formed requests.
 */
function readConfig(): RemoteLeaderboardConfig {
  const url = import.meta.env?.VITE_LEADERBOARD_URL ?? ''
  const anonKey = import.meta.env?.VITE_LEADERBOARD_ANON_KEY ?? ''
  const table = import.meta.env?.VITE_LEADERBOARD_TABLE ?? DEFAULT_TABLE

  return {
    enabled: Boolean(url) && Boolean(anonKey),
    url,
    anonKey,
    table,
  }
}

/** The active remote-leaderboard config, resolved once at module load. */
export const REMOTE_LEADERBOARD: RemoteLeaderboardConfig = readConfig()
