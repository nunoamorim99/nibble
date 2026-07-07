import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMemoryAdapter } from '../../src/data/memory'
import { createRemoteLeaderboardAdapter } from '../../src/data/remote'
import type { RemoteLeaderboardConfig } from '../../src/data/remote.config'
import type { LeaderboardEntry } from '../../src/data/adapter'

const DISABLED_CONFIG: RemoteLeaderboardConfig = {
  enabled: false,
  url: '',
  anonKey: '',
  table: 'scores',
}

const ENABLED_CONFIG: RemoteLeaderboardConfig = {
  enabled: true,
  url: 'https://xyz.supabase.co',
  anonKey: 'anon-key-123',
  table: 'scores',
}

function jsonResponse(body: unknown, init: { readonly ok?: boolean; readonly status?: number } = {}): Response {
  const ok = init.ok ?? true
  const status = init.status ?? (ok ? 200 : 500)
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

const SAMPLE_ENTRY: LeaderboardEntry = {
  modeId: 'classic',
  name: 'ABC',
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

describe('createRemoteLeaderboardAdapter — disabled config', () => {
  it('getLeaderboard never calls fetch and reads from local', async () => {
    const local = createMemoryAdapter()
    await local.submitScore(SAMPLE_ENTRY)
    const fetchImpl = vi.fn()

    const adapter = createRemoteLeaderboardAdapter(local, DISABLED_CONFIG, fetchImpl)
    const result = await adapter.getLeaderboard('classic')

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result).toEqual([SAMPLE_ENTRY])
  })

  it('submitScore never calls fetch and writes only to local', async () => {
    const local = createMemoryAdapter()
    const fetchImpl = vi.fn()

    const adapter = createRemoteLeaderboardAdapter(local, DISABLED_CONFIG, fetchImpl)
    await adapter.submitScore(SAMPLE_ENTRY)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await local.getLeaderboard('classic')).toEqual([SAMPLE_ENTRY])
  })
})

describe('createRemoteLeaderboardAdapter — enabled, getLeaderboard', () => {
  it('maps snake_case rows to camelCase entries, preserving order', async () => {
    const local = createMemoryAdapter()
    const rows = [
      { mode_id: 'classic', name: 'AAA', score: 300, achieved_at: '2026-02-01T00:00:00.000Z' },
      { mode_id: 'classic', name: 'BBB', score: 200, achieved_at: '2026-02-02T00:00:00.000Z' },
      { mode_id: 'classic', name: 'CCC', score: 100, achieved_at: '2026-02-03T00:00:00.000Z' },
    ]
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(rows))

    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)
    const result = await adapter.getLeaderboard('classic', 3)

    expect(result).toEqual([
      { modeId: 'classic', name: 'AAA', score: 300, achievedAt: Date.parse(rows[0]!.achieved_at) },
      { modeId: 'classic', name: 'BBB', score: 200, achievedAt: Date.parse(rows[1]!.achieved_at) },
      { modeId: 'classic', name: 'CCC', score: 100, achievedAt: Date.parse(rows[2]!.achieved_at) },
    ])

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toContain(`${ENABLED_CONFIG.url}/rest/v1/${ENABLED_CONFIG.table}`)
    expect(String(url)).toContain('mode_id=eq.classic')
    expect(String(url)).toContain('order=score.desc')
    expect(String(url)).toContain('limit=3')
    const headers = (init ?? {}).headers as Record<string, string>
    expect(headers['apikey']).toBe(ENABLED_CONFIG.anonKey)
    expect(headers['Authorization']).toBe(`Bearer ${ENABLED_CONFIG.anonKey}`)
  })

  it('falls back to local when the response is non-2xx', async () => {
    const local = createMemoryAdapter()
    await local.submitScore(SAMPLE_ENTRY)
    const fetchImpl = vi.fn(async () => jsonResponse([], { ok: false, status: 500 }))

    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)
    const result = await adapter.getLeaderboard('classic')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result).toEqual([SAMPLE_ENTRY])
  })

  it('falls back to local when fetch throws (network error)', async () => {
    const local = createMemoryAdapter()
    await local.submitScore(SAMPLE_ENTRY)
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })

    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)
    const result = await adapter.getLeaderboard('classic')

    expect(result).toEqual([SAMPLE_ENTRY])
  })

  it('falls back to local when the response body is not valid JSON', async () => {
    const local = createMemoryAdapter()
    await local.submitScore(SAMPLE_ENTRY)
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json')
      },
    }) as unknown as Response)

    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)
    const result = await adapter.getLeaderboard('classic')

    expect(result).toEqual([SAMPLE_ENTRY])
  })
})

describe('createRemoteLeaderboardAdapter — enabled, submitScore', () => {
  it('writes to local even when the remote POST fails', async () => {
    const local = createMemoryAdapter()
    const fetchImpl = vi.fn(async () => jsonResponse(null, { ok: false, status: 500 }))

    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)
    await adapter.submitScore(SAMPLE_ENTRY)

    expect(await local.getLeaderboard('classic')).toEqual([SAMPLE_ENTRY])
  })

  it('writes to local even when fetch throws', async () => {
    const local = createMemoryAdapter()
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })

    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)
    await adapter.submitScore(SAMPLE_ENTRY)

    expect(await local.getLeaderboard('classic')).toEqual([SAMPLE_ENTRY])
  })

  it('POSTs the correct url, headers, and snake_case body when enabled', async () => {
    const local = createMemoryAdapter()
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(null))

    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)
    await adapter.submitScore(SAMPLE_ENTRY)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${ENABLED_CONFIG.url}/rest/v1/${ENABLED_CONFIG.table}`)

    const requestInit = init ?? {}
    expect(requestInit.method).toBe('POST')
    const headers = requestInit.headers as Record<string, string>
    expect(headers['apikey']).toBe(ENABLED_CONFIG.anonKey)
    expect(headers['Authorization']).toBe(`Bearer ${ENABLED_CONFIG.anonKey}`)
    expect(headers['Prefer']).toBe('return=minimal')

    const body = JSON.parse(requestInit.body as string)
    expect(body).toEqual({
      mode_id: SAMPLE_ENTRY.modeId,
      name: SAMPLE_ENTRY.name,
      score: SAMPLE_ENTRY.score,
      achieved_at: new Date(SAMPLE_ENTRY.achievedAt).toISOString(),
    })
  })

  it('does not call fetch a second time (and does not warn twice) across repeated remote failures', async () => {
    const local = createMemoryAdapter()
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })

    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)
    await adapter.submitScore(SAMPLE_ENTRY)
    await adapter.submitScore({ ...SAMPLE_ENTRY, score: 5 })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    // One warning for the whole session, not one per failed call.
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})

describe('createRemoteLeaderboardAdapter — delegation', () => {
  it('getCoins/setCoins pass straight through to local, disabled or enabled', async () => {
    for (const config of [DISABLED_CONFIG, ENABLED_CONFIG]) {
      const local = createMemoryAdapter()
      const fetchImpl = vi.fn()
      const adapter = createRemoteLeaderboardAdapter(local, config, fetchImpl)

      await adapter.setCoins(42)
      expect(await adapter.getCoins()).toBe(42)
      expect(await local.getCoins()).toBe(42)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('getSetting/setSetting pass straight through to local', async () => {
    const local = createMemoryAdapter()
    const fetchImpl = vi.fn()
    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)

    await adapter.setSetting('theme', 'neon')
    expect(await adapter.getSetting('theme')).toBe('neon')
    expect(await local.getSetting('theme')).toBe('neon')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('getHighScore/setHighScore and getUnlocks/addUnlock pass straight through to local', async () => {
    const local = createMemoryAdapter()
    const fetchImpl = vi.fn()
    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)

    await adapter.setHighScore('classic', 999)
    expect(await adapter.getHighScore('classic')).toBe(999)
    expect(await local.getHighScore('classic')).toBe(999)

    await adapter.addUnlock('theme:neon')
    expect(await adapter.getUnlocks()).toEqual(['theme:neon'])
    expect(await local.getUnlocks()).toEqual(['theme:neon'])

    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('createRemoteLeaderboardAdapter — getLeaderboardPage', () => {
  const rowsFor = (count: number, base = 0) =>
    Array.from({ length: count }, (_, i) => ({
      mode_id: 'classic',
      name: `P${base + i}`,
      score: 1000 - (base + i),
      achieved_at: '2026-02-01T00:00:00.000Z',
    }))

  it('disabled config reads the local page and reports source: local without fetching', async () => {
    const local = createMemoryAdapter()
    await local.submitScore(SAMPLE_ENTRY)
    const fetchImpl = vi.fn()

    const adapter = createRemoteLeaderboardAdapter(local, DISABLED_CONFIG, fetchImpl)
    const page = await adapter.getLeaderboardPage('classic')

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(page.source).toBe('local')
    expect(page.entries).toEqual([SAMPLE_ENTRY])
    expect(page.hasMore).toBe(false)
  })

  it('enabled: builds a URL with the offset param and reports source: remote', async () => {
    const local = createMemoryAdapter()
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(rowsFor(25)))

    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)
    const page = await adapter.getLeaderboardPage('classic', { limit: 25, offset: 25 })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url] = fetchImpl.mock.calls[0]!
    expect(String(url)).toContain(`${ENABLED_CONFIG.url}/rest/v1/${ENABLED_CONFIG.table}`)
    expect(String(url)).toContain('offset=25')
    expect(String(url)).toContain('limit=25')
    expect(String(url)).toContain('order=score.desc')
    expect(page.source).toBe('remote')
    expect(page.entries).toHaveLength(25)
  })

  it('offset=0 omits the offset param (keeps the first-page URL clean)', async () => {
    const local = createMemoryAdapter()
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(rowsFor(5)))

    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)
    await adapter.getLeaderboardPage('classic', { limit: 25, offset: 0 })

    const [url] = fetchImpl.mock.calls[0]!
    expect(String(url)).not.toContain('offset=')
  })

  it('hasMore is true when a full page returns, false on a short page', async () => {
    const local = createMemoryAdapter()
    const full = vi.fn<typeof fetch>(async () => jsonResponse(rowsFor(25)))
    const short = vi.fn<typeof fetch>(async () => jsonResponse(rowsFor(7)))

    const fullAdapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, full)
    expect((await fullAdapter.getLeaderboardPage('classic', { limit: 25 })).hasMore).toBe(true)

    const shortAdapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, short)
    expect((await shortAdapter.getLeaderboardPage('classic', { limit: 25 })).hasMore).toBe(false)
  })

  it('falls back to the local page (source: local) when the remote GET fails', async () => {
    const local = createMemoryAdapter()
    await local.submitScore(SAMPLE_ENTRY)
    const fetchImpl = vi.fn(async () => jsonResponse([], { ok: false, status: 401 }))

    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)
    const page = await adapter.getLeaderboardPage('classic')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(page.source).toBe('local')
    expect(page.entries).toEqual([SAMPLE_ENTRY])
  })

  it('falls back to the local page (source: local) when fetch throws', async () => {
    const local = createMemoryAdapter()
    await local.submitScore(SAMPLE_ENTRY)
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })

    const adapter = createRemoteLeaderboardAdapter(local, ENABLED_CONFIG, fetchImpl)
    const page = await adapter.getLeaderboardPage('classic')

    expect(page.source).toBe('local')
    expect(page.entries).toEqual([SAMPLE_ENTRY])
  })
})
