import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TABLE,
  resolveConfig,
  type LeaderboardEnv,
} from '../../src/data/remote.config'

const URL = 'https://xyz.supabase.co'
const KEY = 'anon-key-123'

describe('resolveConfig — table defaulting', () => {
  it('uses DEFAULT_TABLE when the table var is absent (undefined)', () => {
    const config = resolveConfig({
      VITE_LEADERBOARD_URL: URL,
      VITE_LEADERBOARD_ANON_KEY: KEY,
    })
    expect(config.table).toBe(DEFAULT_TABLE)
  })

  // The exact production bug: an unset GitHub Actions `vars` value is inlined
  // by Vite as '' (empty string), NOT undefined. `'' ?? 'scores'` is '', so
  // the old code shipped an empty table -> requests to `/rest/v1/?...` -> 401
  // -> silent fallback to an empty local board.
  it('uses DEFAULT_TABLE when the table var is an empty string', () => {
    const config = resolveConfig({
      VITE_LEADERBOARD_URL: URL,
      VITE_LEADERBOARD_ANON_KEY: KEY,
      VITE_LEADERBOARD_TABLE: '',
    })
    expect(config.table).toBe(DEFAULT_TABLE)
    expect(config.table).not.toBe('')
  })

  it('uses DEFAULT_TABLE when the table var is whitespace only', () => {
    const config = resolveConfig({
      VITE_LEADERBOARD_URL: URL,
      VITE_LEADERBOARD_ANON_KEY: KEY,
      VITE_LEADERBOARD_TABLE: '   ',
    })
    expect(config.table).toBe(DEFAULT_TABLE)
  })

  it('honors an explicit non-blank table name (trimmed)', () => {
    const config = resolveConfig({
      VITE_LEADERBOARD_URL: URL,
      VITE_LEADERBOARD_ANON_KEY: KEY,
      VITE_LEADERBOARD_TABLE: '  leaderboard_v2  ',
    })
    expect(config.table).toBe('leaderboard_v2')
  })
})

describe('resolveConfig — enabled gating', () => {
  it('is disabled when no env vars are set', () => {
    const config = resolveConfig({})
    expect(config.enabled).toBe(false)
    // Even disabled, table is a usable default so URL-building never breaks.
    expect(config.table).toBe(DEFAULT_TABLE)
  })

  it('is disabled when only the URL is set (partial config)', () => {
    const config = resolveConfig({ VITE_LEADERBOARD_URL: URL })
    expect(config.enabled).toBe(false)
  })

  it('is disabled when only the anon key is set (partial config)', () => {
    const config = resolveConfig({ VITE_LEADERBOARD_ANON_KEY: KEY })
    expect(config.enabled).toBe(false)
  })

  it('is disabled when URL/key are blank strings (unset CI vars)', () => {
    const config = resolveConfig({
      VITE_LEADERBOARD_URL: '',
      VITE_LEADERBOARD_ANON_KEY: '   ',
    })
    expect(config.enabled).toBe(false)
  })

  it('is enabled and trims url/key when both are present', () => {
    const config = resolveConfig({
      VITE_LEADERBOARD_URL: `  ${URL}  `,
      VITE_LEADERBOARD_ANON_KEY: ` ${KEY} `,
    })
    expect(config.enabled).toBe(true)
    expect(config.url).toBe(URL)
    expect(config.anonKey).toBe(KEY)
  })
})

// Guards the shape the URL builder in remote.ts depends on: with a resolved
// config, `${url}/rest/v1/${table}` must never be `.../rest/v1/` (empty
// table), which is what produced the 401 in production.
describe('resolveConfig — URL builder never loses the table segment', () => {
  const cases: ReadonlyArray<readonly [string, LeaderboardEnv]> = [
    ['absent table', { VITE_LEADERBOARD_URL: URL, VITE_LEADERBOARD_ANON_KEY: KEY }],
    ['empty table', { VITE_LEADERBOARD_URL: URL, VITE_LEADERBOARD_ANON_KEY: KEY, VITE_LEADERBOARD_TABLE: '' }],
  ]
  for (const [label, env] of cases) {
    it(`produces /rest/v1/<table> not /rest/v1/ for ${label}`, () => {
      const { url, table } = resolveConfig(env)
      const built = `${url}/rest/v1/${table}`
      expect(built).toBe(`${URL}/rest/v1/${DEFAULT_TABLE}`)
      expect(built.endsWith('/rest/v1/')).toBe(false)
    })
  }
})
