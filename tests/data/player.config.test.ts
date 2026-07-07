import { describe, it, expect } from 'vitest'
import { resolvePlayerConfig } from '../../src/data/player.config'

const API = 'https://xyz.functions.supabase.co/player'
const KEY = 'anon-key-123'

describe('resolvePlayerConfig — enabled gating', () => {
  it('is disabled when no env vars are set', () => {
    const config = resolvePlayerConfig({})
    expect(config.enabled).toBe(false)
    expect(config.apiUrl).toBe('')
    expect(config.anonKey).toBe('')
  })

  it('is disabled when only the API URL is set (partial config)', () => {
    const config = resolvePlayerConfig({ VITE_PLAYER_API_URL: API })
    expect(config.enabled).toBe(false)
  })

  it('is disabled when only the anon key is set (partial config)', () => {
    const config = resolvePlayerConfig({ VITE_LEADERBOARD_ANON_KEY: KEY })
    expect(config.enabled).toBe(false)
  })

  // Same CI trap the leaderboard config guards: an unset Actions var inlines
  // as '' (empty string), not undefined; Boolean('') === false must disable.
  it('is disabled when the vars are blank / whitespace (unset CI vars)', () => {
    const config = resolvePlayerConfig({
      VITE_PLAYER_API_URL: '   ',
      VITE_LEADERBOARD_ANON_KEY: '',
    })
    expect(config.enabled).toBe(false)
  })

  it('is enabled and trims both values when present', () => {
    const config = resolvePlayerConfig({
      VITE_PLAYER_API_URL: `  ${API}  `,
      VITE_LEADERBOARD_ANON_KEY: ` ${KEY} `,
    })
    expect(config.enabled).toBe(true)
    expect(config.apiUrl).toBe(API)
    expect(config.anonKey).toBe(KEY)
  })
})
