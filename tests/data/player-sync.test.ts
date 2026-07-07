import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMemoryAdapter } from '../../src/data/memory'
import {
  createPlayerClient,
  createPlayerSyncAdapter,
} from '../../src/data/player-sync'
import type { PlayerAccountsConfig } from '../../src/data/player.config'
import type { LeaderboardEntry } from '../../src/data/adapter'

const DISABLED: PlayerAccountsConfig = { enabled: false, apiUrl: '', anonKey: '' }
const ENABLED: PlayerAccountsConfig = {
  enabled: true,
  apiUrl: 'https://xyz.functions.supabase.co/player',
  anonKey: 'anon-key-123',
}

function jsonResponse(
  body: unknown,
  init: { readonly ok?: boolean; readonly status?: number } = {},
): Response {
  const ok = init.ok ?? true
  const status = init.status ?? (ok ? 200 : 500)
  return { ok, status, json: async () => body } as unknown as Response
}

const ENTRY: LeaderboardEntry = {
  modeId: 'classic',
  name: 'Nuno',
  score: 120,
  achievedAt: Date.parse('2026-01-01T00:00:00.000Z'),
}

let warnSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warnSpy.mockRestore()
})

const withCode = (code: string) => () => code
const noCode = () => null

describe('createPlayerSyncAdapter — disabled / no code → no network', () => {
  it('disabled config: setCoins/addUnlock/submitScore never fetch, write only local', async () => {
    const inner = createMemoryAdapter()
    const fetchImpl = vi.fn()
    const client = createPlayerClient(ENABLED, fetchImpl as unknown as typeof fetch)
    const adapter = createPlayerSyncAdapter(inner, DISABLED, withCode('NIBBLE-AAAA-BBBB'), client)

    await adapter.setCoins(50)
    await adapter.addUnlock('theme:neon')
    await adapter.submitScore(ENTRY)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await inner.getCoins()).toBe(50)
    expect(await inner.getUnlocks()).toEqual(['theme:neon'])
    expect(await inner.getLeaderboard('classic')).toEqual([ENTRY])
  })

  it('enabled but NO code (anonymous play): never fetches', async () => {
    const inner = createMemoryAdapter()
    const fetchImpl = vi.fn()
    const client = createPlayerClient(ENABLED, fetchImpl as unknown as typeof fetch)
    const adapter = createPlayerSyncAdapter(inner, ENABLED, noCode, client)

    await adapter.setCoins(50)
    await adapter.addUnlock('theme:neon')
    await adapter.submitScore(ENTRY)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await inner.getCoins()).toBe(50)
  })

  it('reads never fetch, even enabled with a code', async () => {
    const inner = createMemoryAdapter()
    await inner.setCoins(30)
    const fetchImpl = vi.fn()
    const client = createPlayerClient(ENABLED, fetchImpl as unknown as typeof fetch)
    const adapter = createPlayerSyncAdapter(inner, ENABLED, withCode('NIBBLE-AAAA-BBBB'), client)

    expect(await adapter.getCoins()).toBe(30)
    expect(await adapter.getUnlocks()).toEqual([])
    await adapter.getLeaderboardPage('classic')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('createPlayerSyncAdapter — enabled + code → local-first push', () => {
  it('setCoins writes local first, then POSTs a sync snapshot with the right body', async () => {
    const inner = createMemoryAdapter()
    await inner.addUnlock('theme:neon')
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ coins: 200, unlocks: ['theme:neon'] }))
    const client = createPlayerClient(ENABLED, fetchImpl)
    const adapter = createPlayerSyncAdapter(inner, ENABLED, withCode('NIBBLE-7Q2K-9F4M'), client)

    await adapter.setCoins(200)

    expect(await inner.getCoins()).toBe(200) // local written first
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(ENABLED.apiUrl)
    const requestInit = init ?? {}
    expect(requestInit.method).toBe('POST')
    const h = requestInit.headers as Record<string, string>
    expect(h['apikey']).toBe(ENABLED.anonKey)
    expect(h['Authorization']).toBe(`Bearer ${ENABLED.anonKey}`)
    const body = JSON.parse(requestInit.body as string)
    expect(body).toEqual({
      action: 'sync',
      code: 'NIBBLE-7Q2K-9F4M',
      coins: 200,
      unlocks: ['theme:neon'],
    })
  })

  it('addUnlock writes local first, then POSTs sync including the new unlock', async () => {
    const inner = createMemoryAdapter()
    await inner.setCoins(10)
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ coins: 10, unlocks: ['theme:cartoon'] }))
    const client = createPlayerClient(ENABLED, fetchImpl)
    const adapter = createPlayerSyncAdapter(inner, ENABLED, withCode('NIBBLE-7Q2K-9F4M'), client)

    await adapter.addUnlock('theme:cartoon')

    expect(await inner.getUnlocks()).toEqual(['theme:cartoon'])
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] ?? {}).body as string)
    expect(body).toEqual({
      action: 'sync',
      code: 'NIBBLE-7Q2K-9F4M',
      coins: 10,
      unlocks: ['theme:cartoon'],
    })
  })

  it('submitScore calls inner AND POSTs a submitScore action', async () => {
    const inner = createMemoryAdapter()
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }))
    const client = createPlayerClient(ENABLED, fetchImpl)
    const adapter = createPlayerSyncAdapter(inner, ENABLED, withCode('NIBBLE-7Q2K-9F4M'), client)

    await adapter.submitScore(ENTRY)

    expect(await inner.getLeaderboard('classic')).toEqual([ENTRY]) // inner still ran
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] ?? {}).body as string)
    expect(body).toEqual({
      action: 'submitScore',
      code: 'NIBBLE-7Q2K-9F4M',
      modeId: 'classic',
      score: 120,
      achievedAt: new Date(ENTRY.achievedAt).toISOString(),
    })
  })
})

describe('createPlayerSyncAdapter — local-first on failure, warn once', () => {
  it('setCoins keeps the local write when the sync POST fails, warns once', async () => {
    const inner = createMemoryAdapter()
    const fetchImpl = vi.fn(async () => jsonResponse(null, { ok: false, status: 500 }))
    const client = createPlayerClient(ENABLED, fetchImpl as unknown as typeof fetch)
    const adapter = createPlayerSyncAdapter(inner, ENABLED, withCode('NIBBLE-7Q2K-9F4M'), client)

    await adapter.setCoins(500)
    await adapter.setCoins(600)

    expect(await inner.getCoins()).toBe(600) // never lost despite remote failure
    expect(warnSpy).toHaveBeenCalledTimes(1) // once per session, not per call
  })

  it('setCoins keeps the local write when fetch throws', async () => {
    const inner = createMemoryAdapter()
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })
    const client = createPlayerClient(ENABLED, fetchImpl as unknown as typeof fetch)
    const adapter = createPlayerSyncAdapter(inner, ENABLED, withCode('NIBBLE-7Q2K-9F4M'), client)

    await adapter.setCoins(77)
    expect(await inner.getCoins()).toBe(77)
  })

  it('submitScore keeps inner behavior when the account POST fails', async () => {
    const inner = createMemoryAdapter()
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })
    const client = createPlayerClient(ENABLED, fetchImpl as unknown as typeof fetch)
    const adapter = createPlayerSyncAdapter(inner, ENABLED, withCode('NIBBLE-7Q2K-9F4M'), client)

    await adapter.submitScore(ENTRY)
    expect(await inner.getLeaderboard('classic')).toEqual([ENTRY])
  })
})

describe('createPlayerClient — request shapes', () => {
  it('create POSTs {action:create,name} and returns the account', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ code: 'NIBBLE-7Q2K-9F4M', name: 'Nuno', coins: 0, unlocks: [] }),
    )
    const client = createPlayerClient(ENABLED, fetchImpl)
    const created = await client.create('Nuno')

    expect(created.code).toBe('NIBBLE-7Q2K-9F4M')
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] ?? {}).body as string)
    expect(body).toEqual({ action: 'create', name: 'Nuno' })
  })

  it('get returns null on 404, the account on 200', async () => {
    const missing = createPlayerClient(ENABLED, (async () => jsonResponse(null, { ok: false, status: 404 })) as unknown as typeof fetch)
    expect(await missing.get('NIBBLE-XXXX-YYYY')).toBeNull()

    const found = createPlayerClient(
      ENABLED,
      (async () => jsonResponse({ code: 'NIBBLE-7Q2K-9F4M', name: 'Nuno', coins: 5, unlocks: [], scores: [] })) as unknown as typeof fetch,
    )
    const acct = await found.get('NIBBLE-7Q2K-9F4M')
    expect(acct?.coins).toBe(5)
  })

  it('create throws on a non-2xx that is not 404', async () => {
    const client = createPlayerClient(ENABLED, (async () => jsonResponse(null, { ok: false, status: 500 })) as unknown as typeof fetch)
    await expect(client.create('Nuno')).rejects.toThrow()
  })
})
