import { describe, it, expect } from 'vitest'
import { createMemoryAdapter } from '../../src/data/memory'
import type { LeaderboardEntry, PersistenceAdapter } from '../../src/data/adapter'

// The IndexedDB-backed local adapter falls back to the in-memory adapter when
// `indexedDB` is absent (as it is in the Node test runner), and its
// getLeaderboardPage delegates to the memory implementation in that case. So
// exercising createMemoryAdapter here covers the pagination logic both
// adapters share. (createLocalAdapter is not imported to avoid pulling the
// IndexedDB wrapper into a non-browser environment.)

function entry(name: string, score: number, modeId = 'classic'): LeaderboardEntry {
  return { modeId, name, score, achievedAt: Date.parse('2026-01-01T00:00:00.000Z') }
}

async function seed(adapter: PersistenceAdapter, count: number): Promise<void> {
  // Insert in ascending score so we also prove the adapter re-sorts desc.
  for (let i = 0; i < count; i++) {
    await adapter.submitScore(entry(`P${i}`, i))
  }
}

describe('getLeaderboardPage — memory adapter pagination', () => {
  it('returns the top window sorted by score desc', async () => {
    const adapter = createMemoryAdapter()
    await seed(adapter, 30)

    const page = await adapter.getLeaderboardPage('classic', { limit: 10, offset: 0 })
    expect(page.entries.map((e) => e.score)).toEqual([29, 28, 27, 26, 25, 24, 23, 22, 21, 20])
    expect(page.source).toBe('local')
    expect(page.hasMore).toBe(true)
  })

  it('applies offset to fetch the next window without overlap', async () => {
    const adapter = createMemoryAdapter()
    await seed(adapter, 30)

    const first = await adapter.getLeaderboardPage('classic', { limit: 10, offset: 0 })
    const second = await adapter.getLeaderboardPage('classic', { limit: 10, offset: 10 })
    const third = await adapter.getLeaderboardPage('classic', { limit: 10, offset: 20 })

    expect(second.entries.map((e) => e.score)).toEqual([19, 18, 17, 16, 15, 14, 13, 12, 11, 10])
    expect(third.entries.map((e) => e.score)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0])

    // No score appears in two pages.
    const all = [...first.entries, ...second.entries, ...third.entries].map((e) => e.score)
    expect(new Set(all).size).toBe(all.length)
  })

  it('hasMore is false on the last (short) page', async () => {
    const adapter = createMemoryAdapter()
    await seed(adapter, 25)

    const last = await adapter.getLeaderboardPage('classic', { limit: 10, offset: 20 })
    expect(last.entries).toHaveLength(5)
    expect(last.hasMore).toBe(false)
  })

  it('hasMore is false when a full page exactly empties the set', async () => {
    const adapter = createMemoryAdapter()
    await seed(adapter, 20)

    const page = await adapter.getLeaderboardPage('classic', { limit: 10, offset: 10 })
    expect(page.entries).toHaveLength(10)
    expect(page.hasMore).toBe(false)
  })

  it('returns an empty page past the end', async () => {
    const adapter = createMemoryAdapter()
    await seed(adapter, 5)

    const page = await adapter.getLeaderboardPage('classic', { limit: 10, offset: 10 })
    expect(page.entries).toEqual([])
    expect(page.hasMore).toBe(false)
  })

  it('empty store yields an empty first page', async () => {
    const adapter = createMemoryAdapter()
    const page = await adapter.getLeaderboardPage('classic')
    expect(page.entries).toEqual([])
    expect(page.hasMore).toBe(false)
    expect(page.source).toBe('local')
  })

  it('filters by modeId', async () => {
    const adapter = createMemoryAdapter()
    await adapter.submitScore(entry('A', 10, 'classic'))
    await adapter.submitScore(entry('B', 99, 'levels'))
    await adapter.submitScore(entry('C', 20, 'classic'))

    const page = await adapter.getLeaderboardPage('classic', { limit: 10 })
    expect(page.entries.map((e) => e.name)).toEqual(['C', 'A'])
  })

  it('defaults limit when options are omitted', async () => {
    const adapter = createMemoryAdapter()
    await seed(adapter, 40)
    const page = await adapter.getLeaderboardPage('classic')
    // Default page size is 25 (see DEFAULT_PAGE_LIMIT).
    expect(page.entries).toHaveLength(25)
    expect(page.hasMore).toBe(true)
  })
})
