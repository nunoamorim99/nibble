import { describe, it, expect } from 'vitest'
import { createPlayerRuntime } from '../../src/data/index'
import type { RemoteLeaderboardConfig } from '../../src/data/remote.config'
import type { PlayerAccountsConfig } from '../../src/data/player.config'

// Pass explicit configs rather than relying on ambient import.meta.env — vitest
// loads .env/.env.local, so the module-load defaults may be *enabled* on a
// machine that has the feature configured. Injecting disabled configs pins the
// behavior we want to assert.
const DISABLED_LEADERBOARD: RemoteLeaderboardConfig = {
  enabled: false,
  url: '',
  anonKey: '',
  table: 'scores',
}
const DISABLED_ACCOUNTS: PlayerAccountsConfig = {
  enabled: false,
  apiUrl: '',
  anonKey: '',
}

describe('createPlayerRuntime — disabled configs behave as before', () => {
  it('returns a working adapter, idle identity, null client, accounts off', async () => {
    const { adapter, identity, playerClient, accountsEnabled } = createPlayerRuntime(
      DISABLED_LEADERBOARD,
      DISABLED_ACCOUNTS,
    )

    expect(accountsEnabled).toBe(false)
    expect(playerClient).toBeNull()
    expect(identity.current()).toBeNull()
    expect(await identity.hydrate()).toBeNull()

    // The adapter round-trips coins/unlocks locally with no network involved.
    // (IndexedDB is absent in Node, so the local adapter transparently falls
    // back to in-memory — still a valid PersistenceAdapter, which is all we
    // assert here.)
    await adapter.setCoins(123)
    expect(await adapter.getCoins()).toBe(123)
    await adapter.addUnlock('theme:neon')
    expect(await adapter.getUnlocks()).toContain('theme:neon')
  })

  it('with accounts enabled, exposes a client and accountsEnabled true', () => {
    const enabledAccounts: PlayerAccountsConfig = {
      enabled: true,
      apiUrl: 'https://xyz.functions.supabase.co/player',
      anonKey: 'anon-key-123',
    }
    const { playerClient, accountsEnabled } = createPlayerRuntime(
      DISABLED_LEADERBOARD,
      enabledAccounts,
    )
    expect(accountsEnabled).toBe(true)
    expect(playerClient).not.toBeNull()
  })
})
