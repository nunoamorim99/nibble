import { describe, it, expect } from 'vitest'
import { createPlayerRuntime } from '../../src/data/index'

// In the Node test runner no VITE_* vars are set, so PLAYER_ACCOUNTS and
// REMOTE_LEADERBOARD both resolve disabled. createPlayerRuntime() must then
// behave exactly like the old local-only setup: a working adapter, an idle
// identity, no client, accounts off. (IndexedDB is absent in Node, so the
// local adapter transparently falls back to in-memory — still a valid
// PersistenceAdapter, which is all we assert here.)
describe('createPlayerRuntime — disabled (no env) behaves as before', () => {
  it('returns a working adapter, idle identity, null client, accounts off', async () => {
    const { adapter, identity, playerClient, accountsEnabled } = createPlayerRuntime()

    expect(accountsEnabled).toBe(false)
    expect(playerClient).toBeNull()
    expect(identity.current()).toBeNull()
    expect(await identity.hydrate()).toBeNull()

    // The adapter round-trips coins/unlocks locally with no network involved.
    await adapter.setCoins(123)
    expect(await adapter.getCoins()).toBe(123)
    await adapter.addUnlock('theme:neon')
    expect(await adapter.getUnlocks()).toContain('theme:neon')
  })
})
