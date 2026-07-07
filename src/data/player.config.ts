/**
 * Config for the optional player-accounts / cross-device-progress feature.
 *
 * Shaped for a Supabase Edge Function gatekeeper (`${apiUrl}` = the function's
 * base URL), but nothing outside `player-sync.ts` needs to know that; this is
 * a plain data object read once at module load, mirroring `remote.config.ts`.
 *
 * Disabled by default: with no env vars set, `enabled` is `false`, no account
 * prompt appears, and `createPlayerRuntime()` (see `index.ts`) hands back the
 * plain (leaderboard-or-local) adapter — the game is fully local-first exactly
 * as before an operator opts in.
 *
 * The anon key is intentionally the SAME `VITE_LEADERBOARD_ANON_KEY` the
 * leaderboard uses: it's the same Supabase project, so the same publishable
 * key is what authorizes the client to reach the Functions gateway. The Edge
 * Function itself holds the `service_role` key server-side and is the only
 * thing that can touch the `players` table (RLS denies anon) — see
 * `docs/PLAYER_ACCOUNTS.md`.
 *
 * Data only: no fetch, no adapter logic, no engine/render/ui imports.
 */

/** Shape of the player-accounts config, independent of how it's read. */
export interface PlayerAccountsConfig {
  /** Whether the account feature should attempt any network call, and whether
   * the first-run welcome/profile UI is offered at all. */
  readonly enabled: boolean
  /** Edge Function base URL, e.g. `https://xyz.functions.supabase.co/player`.
   * Empty when disabled. */
  readonly apiUrl: string
  /** Supabase anon (public) API key — shared with the leaderboard. Empty when
   * disabled. Never a service key. */
  readonly anonKey: string
}

/** Just the env vars this module reads, so the resolver is testable without
 * touching Vite's real `import.meta.env`. `VITE_LEADERBOARD_ANON_KEY` is
 * deliberately shared with the leaderboard config. */
export interface PlayerAccountsEnv {
  readonly VITE_PLAYER_API_URL?: string
  readonly VITE_LEADERBOARD_ANON_KEY?: string
}

/**
 * Normalize a build-time env var to a trimmed string, treating "absent" and
 * "present but blank" identically. Same rationale as `remote.config.ts`'s
 * `readEnv`: an unset GitHub Actions `vars`/`secrets` value inlines as `''`,
 * not `undefined`, so `Boolean('')` (false) is the check that actually gates.
 */
function readEnv(value: string | undefined): string {
  return (value ?? '').trim()
}

/**
 * Pure config resolver over a plain env object, so the enabled-gating can be
 * unit-tested without a real build.
 *
 * Enabled only when BOTH the Edge Function URL and the anon key are present
 * and non-blank — a partially-configured deployment stays disabled (and thus
 * safely local, no account prompt) rather than attempting half-formed
 * requests. Matches `remote.config.ts`'s both-required rule.
 */
export function resolvePlayerConfig(env: PlayerAccountsEnv): PlayerAccountsConfig {
  const apiUrl = readEnv(env.VITE_PLAYER_API_URL)
  const anonKey = readEnv(env.VITE_LEADERBOARD_ANON_KEY)

  return {
    enabled: Boolean(apiUrl) && Boolean(anonKey),
    apiUrl,
    anonKey,
  }
}

/**
 * Read config from Vite-injected env vars, resolved once at module load.
 * All the interesting logic lives in `resolvePlayerConfig`; this just feeds it
 * the real `import.meta.env` (guarded for non-Vite contexts like tests).
 */
export const PLAYER_ACCOUNTS: PlayerAccountsConfig = resolvePlayerConfig(
  (import.meta.env ?? {}) as PlayerAccountsEnv,
)
