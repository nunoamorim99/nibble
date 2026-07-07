import { describe, it, expect } from 'vitest'
import { createMemoryAdapter } from '../../src/data/memory'
import {
  CODE_PATTERN,
  PLAYER_SETTING_KEY,
  createIdentity,
  generatePlayerCode,
  normalizeCode,
  reconcile,
  type Rng,
} from '../../src/data/identity'

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

describe('generatePlayerCode — format & charset', () => {
  it('matches NIBBLE-XXXX-XXXX and only uses the safe alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePlayerCode()
      expect(code).toMatch(CODE_PATTERN)
      // Every non-delimiter char is in the alphabet (no 0/O/1/I/L).
      const body = code.replace('NIBBLE-', '').replace('-', '')
      for (const ch of body) expect(CODE_ALPHABET).toContain(ch)
    }
  })

  it('excludes visually ambiguous glyphs 0 O 1 I L', () => {
    for (const bad of ['0', 'O', '1', 'I', 'L']) {
      expect(CODE_ALPHABET).not.toContain(bad)
    }
    const many = Array.from({ length: 500 }, () => generatePlayerCode()).join('')
    for (const bad of ['0', 'O', '1', 'I', 'L']) {
      // The delimiters spell NIBBLE which contains none of these; body is clean.
      expect(many.replace(/NIBBLE-/g, '').replace(/-/g, '')).not.toContain(bad)
    }
  })

  it('produces no collisions across many draws (uniqueness sanity)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 10_000; i++) seen.add(generatePlayerCode())
    // 39.6 bits of entropy over 10k draws: a collision would be astronomically
    // unlikely, so any repeat signals a generator bug.
    expect(seen.size).toBe(10_000)
  })
})

describe('generatePlayerCode — rejection sampling (unbiased)', () => {
  it('redraws bytes >= 248 instead of using a biased modulo', () => {
    // Feed a byte sequence whose FIRST value (255) must be rejected; if the
    // generator naively did 255 % 31 it would emit CODE_ALPHABET[8]. With
    // rejection sampling it skips 255 and consumes the next byte (0 → index 0).
    const bytes = [255, 0, 0, 0, 0, 0, 0, 0, 0] // one rejected, rest → 'index 0'
    let pos = 0
    const stubRng: Rng = {
      getRandomValues<T extends Uint8Array>(array: T): T {
        for (let i = 0; i < array.length; i++) {
          array[i] = bytes[pos++ % bytes.length]!
        }
        return array
      },
    }
    const code = generatePlayerCode(stubRng)
    expect(code).toMatch(CODE_PATTERN)
    // 255 was rejected; every accepted byte here is 0 → alphabet[0] === '2'.
    expect(code).toBe('NIBBLE-2222-2222')
    // Sanity: the biased result (alphabet[255 % 31] = alphabet[8]) must NOT appear first.
    expect(code[7]).not.toBe(CODE_ALPHABET[255 % CODE_ALPHABET.length])
  })
})

describe('normalizeCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeCode('  nibble-7q2k-9f4m  ')).toBe('NIBBLE-7Q2K-9F4M')
  })
})

describe('reconcile — max coins + union unlocks', () => {
  it('keeps the higher coin balance (server higher)', () => {
    const merged = reconcile({ coins: 100, unlocks: [] }, { coins: 900, unlocks: [] })
    expect(merged.coins).toBe(900)
  })

  it('keeps the higher coin balance (local higher)', () => {
    const merged = reconcile({ coins: 900, unlocks: [] }, { coins: 100, unlocks: [] })
    expect(merged.coins).toBe(900)
  })

  it('unions and dedupes unlocks', () => {
    const merged = reconcile(
      { coins: 0, unlocks: ['theme:neon', 'theme:cartoon'] },
      { coins: 0, unlocks: ['theme:cartoon', 'theme:mono-plus'] },
    )
    expect([...merged.unlocks].sort()).toEqual([
      'theme:cartoon',
      'theme:mono-plus',
      'theme:neon',
    ])
  })

  it('handles empty sides', () => {
    expect(reconcile({ coins: 0, unlocks: [] }, { coins: 0, unlocks: [] })).toEqual({
      coins: 0,
      unlocks: [],
    })
    const fromServer = reconcile(
      { coins: 0, unlocks: [] },
      { coins: 50, unlocks: ['theme:neon'] },
    )
    expect(fromServer).toEqual({ coins: 50, unlocks: ['theme:neon'] })
  })
})

describe('createIdentity — current-player storage', () => {
  it('round-trips a player through the adapter settings kv', async () => {
    const adapter = createMemoryAdapter()
    const identity = createIdentity(adapter)

    expect(identity.current()).toBeNull()
    expect(identity.code()).toBeNull()

    await identity.set({ code: 'NIBBLE-7Q2K-9F4M', name: 'Nuno' })
    expect(identity.current()).toEqual({ code: 'NIBBLE-7Q2K-9F4M', name: 'Nuno' })
    expect(identity.code()).toBe('NIBBLE-7Q2K-9F4M')

    // A fresh identity over the same adapter hydrates the persisted value.
    const reopened = createIdentity(adapter)
    expect(await reopened.hydrate()).toEqual({ code: 'NIBBLE-7Q2K-9F4M', name: 'Nuno' })
    expect(reopened.code()).toBe('NIBBLE-7Q2K-9F4M')
  })

  it('hydrate returns null when nothing is stored', async () => {
    const identity = createIdentity(createMemoryAdapter())
    expect(await identity.hydrate()).toBeNull()
  })

  it('clearing sets it back to null', async () => {
    const adapter = createMemoryAdapter()
    const identity = createIdentity(adapter)
    await identity.set({ code: 'NIBBLE-AAAA-BBBB', name: 'X' })
    await identity.set(null)
    expect(identity.current()).toBeNull()
    expect(await createIdentity(adapter).hydrate()).toBeNull()
  })

  it('treats malformed stored JSON as no player (never throws)', async () => {
    const adapter = createMemoryAdapter()
    await adapter.setSetting(PLAYER_SETTING_KEY, '{not valid json')
    const identity = createIdentity(adapter)
    expect(await identity.hydrate()).toBeNull()
  })

  it('treats a well-formed-but-wrong-shape record as no player', async () => {
    const adapter = createMemoryAdapter()
    await adapter.setSetting(PLAYER_SETTING_KEY, JSON.stringify({ code: 123 }))
    const identity = createIdentity(adapter)
    expect(await identity.hydrate()).toBeNull()
  })
})
