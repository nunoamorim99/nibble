/**
 * Player identity: the secret recovery CODE that keys a cross-device account,
 * the current-player holder (so a synchronous `getCode()` is available to the
 * sync adapter), and the pure `reconcile` used when local and server progress
 * meet on restore.
 *
 * Local-only, pure-ish: code generation uses `crypto.getRandomValues` (allowed
 * in the data layer — the engine determinism rule bans randomness only inside
 * engine update logic), current-player state persists through the injected
 * `PersistenceAdapter`'s settings kv, and `reconcile` is a pure function. No
 * DOM, no fetch, no engine/render/ui imports.
 */
import type { PersistenceAdapter } from './adapter'

/** The stored current player. `code` is the secret identity; `name` is a
 * cosmetic display label (duplicates across players are fine). */
export interface Player {
  readonly code: string
  readonly name: string
}

/** The syncable progress subset an account carries across devices. */
export interface Progress {
  readonly coins: number
  readonly unlocks: readonly string[]
}

/** Settings-kv key under which the current player is JSON-persisted. Distinct
 * namespace from the `SETTING_*` keys in main.ts — no collision. */
export const PLAYER_SETTING_KEY = 'player:current'

/**
 * Code format + charset.
 *  - `NIBBLE-XXXX-XXXX`, two 4-char groups.
 *  - Charset excludes visually ambiguous glyphs (0/O, 1/I/L) so a code read
 *    off a screen and typed on another device is unambiguous.
 *  - 8 chars over a 31-symbol alphabet ≈ 39.6 bits — ample for a "not
 *    guessable in bulk behind a rate-limited gatekeeper" secret.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // 31 symbols, no 0/O/1/I/L
const CODE_GROUPS = 2
const CODE_GROUP_LEN = 4
const CODE_LEN = CODE_GROUPS * CODE_GROUP_LEN
/** Largest multiple of 31 that fits in a byte is 248 (31*8); bytes >= 248 are
 * rejected so the modulo below is unbiased (uniform over the alphabet). */
const REJECTION_CEILING = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length

/** Minimal RNG surface we need — structurally compatible with the global
 * `crypto` object's `getRandomValues`, and trivially stubbable in tests.
 * Typed as accepting a `Uint8Array` and returning it (we only ever pass one). */
export interface Rng {
  getRandomValues(array: Uint8Array): Uint8Array
}

/** Regex a well-formed code matches. Exported for the restore-input validation
 * and tests. */
export const CODE_PATTERN = new RegExp(
  `^NIBBLE-[${CODE_ALPHABET}]{${CODE_GROUP_LEN}}-[${CODE_ALPHABET}]{${CODE_GROUP_LEN}}$`,
)

/**
 * Generate a fresh recovery code, e.g. `NIBBLE-7Q2K-9F4M`.
 *
 * Uniform over `CODE_ALPHABET` via rejection sampling: random bytes at or above
 * `REJECTION_CEILING` are discarded and redrawn, so no symbol is favored by
 * modulo bias. `rng` is injectable so tests can force specific/edge byte
 * sequences (e.g. a rejected byte followed by an accepted one) deterministically.
 *
 * NOTE: the server is the authoritative code generator (it guarantees table
 * uniqueness on create). This client generator exists for tests and a possible
 * future offline-create fallback.
 */
const cryptoRng: Rng = {
  // Cast at this single boundary: lib.dom types `getRandomValues` as generic
  // over `ArrayBufferView<ArrayBuffer>`, which a plain `Uint8Array` doesn't
  // structurally satisfy under strict settings. The runtime contract (fill the
  // passed typed array with random bytes) is exactly what we rely on.
  getRandomValues: (array) =>
    (crypto.getRandomValues as (a: Uint8Array) => Uint8Array)(array),
}

export function generatePlayerCode(rng: Rng = cryptoRng): string {
  const symbols: string[] = []
  // Draw one usable symbol at a time; on a rejected byte, draw again. A small
  // buffer amortizes syscalls without assuming how many redraws we'll need
  // (only ~8/256 of bytes are rejected, so 2×CODE_LEN almost always suffices
  // for a full code in a single fill; the outer loop refills if not).
  const buffer = new Uint8Array(CODE_LEN * 2)
  let bufferPos = buffer.length // force an initial fill

  while (symbols.length < CODE_LEN) {
    if (bufferPos >= buffer.length) {
      rng.getRandomValues(buffer)
      bufferPos = 0
    }
    const byte = buffer[bufferPos++]!
    if (byte >= REJECTION_CEILING) continue // reject to keep the distribution uniform
    symbols.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]!)
  }

  const groups: string[] = []
  for (let i = 0; i < CODE_GROUPS; i++) {
    groups.push(symbols.slice(i * CODE_GROUP_LEN, (i + 1) * CODE_GROUP_LEN).join(''))
  }
  return `NIBBLE-${groups.join('-')}`
}

/** Normalize a user-entered code (trim + uppercase). Does not validate format;
 * pair with `CODE_PATTERN`. */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase()
}

/**
 * Pure reconcile of local vs. server progress when they meet on restore.
 *
 * Policy (product decision): keep the HIGHER coin balance and the UNION of
 * unlocks — never rob the player of progress earned on either device. Coins
 * deliberately do NOT sum across devices (that would let someone farm coins on
 * N devices and stack them); `max` is the anti-abuse-friendly choice for a
 * cosmetic-only economy. Unlocks dedupe via a Set.
 */
export function reconcile(local: Progress, server: Progress): Progress {
  return {
    coins: Math.max(local.coins, server.coins),
    unlocks: Array.from(new Set([...local.unlocks, ...server.unlocks])),
  }
}

/** The current-player holder. `code()` is synchronous so the sync adapter can
 * ask on every call (accounts can be swapped at runtime via restore). */
export interface Identity {
  /** In-memory current player, or null if none / not hydrated yet. */
  current(): Player | null
  /** Convenience: `current()?.code ?? null`, passed to the sync adapter. */
  code(): string | null
  /** Load the persisted player into memory (call once at boot). Returns it. */
  hydrate(): Promise<Player | null>
  /** Set (and persist) the current player, or clear it with `null`. */
  set(player: Player | null): Promise<void>
}

/**
 * Create the current-player holder backed by `adapter`'s settings kv. State is
 * kept in memory (for synchronous `code()`) and mirrored to storage as JSON
 * under `PLAYER_SETTING_KEY`.
 */
export function createIdentity(adapter: PersistenceAdapter): Identity {
  let player: Player | null = null

  function parse(raw: string | null): Player | null {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as unknown
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as Player).code === 'string' &&
        typeof (parsed as Player).name === 'string'
      ) {
        return { code: (parsed as Player).code, name: (parsed as Player).name }
      }
    } catch {
      // Malformed JSON → treat as "no player", never throw at boot.
    }
    return null
  }

  return {
    current: () => player,
    code: () => player?.code ?? null,

    async hydrate() {
      player = parse(await adapter.getSetting(PLAYER_SETTING_KEY))
      return player
    },

    async set(next) {
      player = next
      if (next === null) {
        // No delete on the adapter contract; store an empty string, which
        // `parse` treats as "no player".
        await adapter.setSetting(PLAYER_SETTING_KEY, '')
        return
      }
      await adapter.setSetting(PLAYER_SETTING_KEY, JSON.stringify(next))
    },
  }
}
