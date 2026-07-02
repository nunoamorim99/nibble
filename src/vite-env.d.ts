/// <reference types="vite/client" />

/**
 * App-specific `VITE_*` env vars, layered onto Vite's built-in
 * `ImportMetaEnv` (see `vite/client.d.ts`). All optional: an unset var is
 * `undefined`, never an error — see `src/data/remote.config.ts`, which
 * treats an absent URL/anon key as "remote leaderboard disabled".
 */
interface ImportMetaEnv {
  /** Supabase project URL for the optional global leaderboard (Phase 7). */
  readonly VITE_LEADERBOARD_URL?: string
  /** Supabase anon (public) API key for the optional global leaderboard. */
  readonly VITE_LEADERBOARD_ANON_KEY?: string
  /** PostgREST table name for leaderboard rows. Defaults to `'scores'`. */
  readonly VITE_LEADERBOARD_TABLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
