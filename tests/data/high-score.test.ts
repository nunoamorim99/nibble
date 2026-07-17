/**
 * Personal best per mode — the only score Nibble keeps.
 *
 * Classic and Levels each record their own best; a run in one mode must never
 * overwrite the other's. `main.ts` derives the storage key from the active
 * mode (see `modeKey`), so these tests pin the adapter contract that keying
 * relies on: distinct `modeId`s are independent buckets, and the adapter
 * stores exactly what it is given (the caller decides what "beats" what).
 */
import { describe, expect, it } from 'vitest'
import { createMemoryAdapter } from '../../src/data'

const CLASSIC = 'classic'
const LEVELS = 'levels'

describe('high score — per-mode isolation', () => {
  it('reports 0 for a mode with no recorded score', async () => {
    const adapter = createMemoryAdapter()
    expect(await adapter.getHighScore(CLASSIC)).toBe(0)
    expect(await adapter.getHighScore(LEVELS)).toBe(0)
  })

  it('keeps Classic and Levels bests in separate buckets', async () => {
    const adapter = createMemoryAdapter()

    await adapter.setHighScore(CLASSIC, 340)
    await adapter.setHighScore(LEVELS, 120)

    expect(await adapter.getHighScore(CLASSIC)).toBe(340)
    expect(await adapter.getHighScore(LEVELS)).toBe(120)
  })

  it('a Levels run does not clobber a higher Classic best', async () => {
    const adapter = createMemoryAdapter()
    await adapter.setHighScore(CLASSIC, 340)

    // A weaker Levels run lands afterwards.
    await adapter.setHighScore(LEVELS, 20)

    expect(await adapter.getHighScore(CLASSIC)).toBe(340)
  })

  it('stores exactly what it is given — comparison is the caller\'s job', async () => {
    const adapter = createMemoryAdapter()
    await adapter.setHighScore(CLASSIC, 340)

    // The adapter does not compare; main.ts only calls this when the score wins.
    await adapter.setHighScore(CLASSIC, 10)

    expect(await adapter.getHighScore(CLASSIC)).toBe(10)
  })
})

describe('high score — the beat-your-best rule main.ts applies', () => {
  /** Mirrors `onRoundEnd`: write only when the round beat the stored best. */
  async function recordIfBest(
    adapter: ReturnType<typeof createMemoryAdapter>,
    modeId: string,
    score: number,
  ): Promise<number> {
    const best = await adapter.getHighScore(modeId)
    if (score > best) {
      await adapter.setHighScore(modeId, score)
      return score
    }
    return best
  }

  it('records a first score, then only improvements', async () => {
    const adapter = createMemoryAdapter()

    expect(await recordIfBest(adapter, CLASSIC, 50)).toBe(50)
    // A worse round leaves the best alone.
    expect(await recordIfBest(adapter, CLASSIC, 30)).toBe(50)
    // A better one replaces it.
    expect(await recordIfBest(adapter, CLASSIC, 90)).toBe(90)
    expect(await adapter.getHighScore(CLASSIC)).toBe(90)
  })

  it('an equal score does not count as a new best', async () => {
    const adapter = createMemoryAdapter()
    await recordIfBest(adapter, CLASSIC, 50)
    expect(await recordIfBest(adapter, CLASSIC, 50)).toBe(50)
  })

  it('tracks each mode independently across interleaved rounds', async () => {
    const adapter = createMemoryAdapter()

    await recordIfBest(adapter, CLASSIC, 100)
    await recordIfBest(adapter, LEVELS, 40)
    await recordIfBest(adapter, CLASSIC, 60) // worse; classic stays 100
    await recordIfBest(adapter, LEVELS, 75) // better; levels rises

    expect(await adapter.getHighScore(CLASSIC)).toBe(100)
    expect(await adapter.getHighScore(LEVELS)).toBe(75)
  })
})
