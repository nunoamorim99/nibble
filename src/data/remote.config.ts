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

export const DEFAULT_TABLE = 'scores'

/** Just the env vars this module reads, so the resolver is testable without
 * touching Vite's real `import.meta.env`. */
export interface LeaderboardEnv {
  readonly VITE_LEADERBOARD_URL?: string
  readonly VITE_LEADERBOARD_ANON_KEY?: string
  readonly VITE_LEADERBOARD_TABLE?: string
}

/**
 * Normalize a build-time env var to a trimmed string, treating "absent" and
 * "present but blank" identically.
 *
 * This matters because of how the values arrive. In CI (see
 * `.github/workflows/deploy-pages.yml`) these come from GitHub Actions
 * `vars`/`secrets`; an *unset* Actions variable expands to an EMPTY STRING,
 * not `undefined`. Vite then statically inlines that `''` into the bundle.
 * So a plain `?? DEFAULT` guard is not enough — `'' ?? 'scores'` is `''`,
 * because `??` only substitutes on `null`/`undefined`. Trimming to `''` here
 * lets `resolveConfig` apply real defaults / disable cleanly regardless of
 * whether the var was unset or set-but-blank.
 */
function readEnv(value: string | undefined): string {
  return (value ?? '').trim()
}

/**
 * Pure config resolver over a plain env object. Extracted from `readConfig`
 * so the empty-string / whitespace / defaulting behavior can be unit-tested
 * directly (see `tests/data/remote.config.test.ts`) without a real build.
 *
 * `table` falls back to `DEFAULT_TABLE` when blank — an empty table name
 * would otherwise produce requests to `/rest/v1/?...` (no table), which
 * Supabase rejects with 401 and which silently degrades the whole feature to
 * local-only. That exact misconfiguration shipped once (the CI `vars`
 * variable for the table was unset → inlined as `''`), so this is a
 * regression guard, not a hypothetical. See `readEnv` for why the previous
 * `?? DEFAULT_TABLE` did not catch it.
 *
 * Enabled only when BOTH the URL and anon key are present and non-empty —
 * a partially-configured deployment stays disabled (and thus safely local)
 * rather than attempting half-formed requests.
 */
export function resolveConfig(env: LeaderboardEnv): RemoteLeaderboardConfig {
  const url = readEnv(env.VITE_LEADERBOARD_URL)
  const anonKey = readEnv(env.VITE_LEADERBOARD_ANON_KEY)
  const table = readEnv(env.VITE_LEADERBOARD_TABLE) || DEFAULT_TABLE

  return {
    enabled: Boolean(url) && Boolean(anonKey),
    url,
    anonKey,
    table,
  }
}

/**
 * Read config from Vite-injected env vars, resolved once at module load.
 * All the interesting logic lives in `resolveConfig`; this just feeds it the
 * real `import.meta.env` (guarded for non-Vite contexts like tests).
 */
export const REMOTE_LEADERBOARD: RemoteLeaderboardConfig = resolveConfig(
  (import.meta.env ?? {}) as LeaderboardEnv,
)
