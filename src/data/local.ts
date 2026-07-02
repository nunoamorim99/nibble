/**
 * Local `PersistenceAdapter` backed by IndexedDB.
 *
 * Hand-rolled promise wrapper around the native IndexedDB API — no npm
 * dependency, so the PWA stays zero-runtime-dep. If `indexedDB` is missing
 * or fails to open (private-mode Safari, disabled storage, non-browser
 * environments), every method transparently falls back to a
 * `createMemoryAdapter()` instance so the game never crashes over storage.
 *
 * `createLocalAdapter()` itself is synchronous — it hands back the adapter
 * object immediately, matching every other factory in this module. Opening
 * the database is unavoidably async, so that work happens lazily behind a
 * memoized promise that each method awaits before touching IndexedDB.
 *
 * Schema
 * ------
 * Database: "nibble", version `DB_VERSION` (bump + add an `onupgradeneeded`
 * branch below whenever the shape changes; never silently reinterpret old
 * data under the same version number).
 *
 *   - `kv` store — flat key/value records, keyed by a fixed string. Holds:
 *       - `highscore:<modeId>` -> number
 *       - `coins`              -> number
 *       - `unlocks`            -> string[] (cosmetic ids)
 *       - `setting:<key>`      -> string (opaque UI/app settings, e.g.
 *                                 the selected theme id)
 *
 * `setting:<key>` reuses the `kv` store under its own key namespace — no
 * new object store, so no `DB_VERSION` bump was needed to add it.
 *   - `leaderboard` store — one record per submitted entry, autoincrement
 *     primary key `id`, with an index on `modeId` for `getLeaderboard`
 *     lookups.
 *
 * No engine imports, no DOM beyond `indexedDB` itself, no UI.
 */
import type { LeaderboardEntry, PersistenceAdapter } from './adapter'
import { createMemoryAdapter } from './memory'

const DB_NAME = 'nibble'
const DB_VERSION = 1

const KV_STORE = 'kv'
const LEADERBOARD_STORE = 'leaderboard'
const LEADERBOARD_MODE_INDEX = 'modeId'

const COINS_KEY = 'coins'
const UNLOCKS_KEY = 'unlocks'
const highScoreKey = (modeId: string): string => `highscore:${modeId}`
// New key namespace within the existing `kv` store — see schema comment
// above. Adding this needed no `onupgradeneeded` branch and no `DB_VERSION`
// bump because it is not a new store, just new keys in an existing one.
const settingKey = (key: string): string => `setting:${key}`

const DEFAULT_LEADERBOARD_LIMIT = 10

/** Shape of a row in `leaderboard`; IndexedDB assigns `id` on insert. */
interface StoredLeaderboardEntry extends LeaderboardEntry {
  readonly id?: number
}

/** Wrap an `IDBRequest` in a promise settling on `success`/`error`. */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Wrap an `IDBTransaction` in a promise settling on `complete`/`error`/`abort`. */
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () =>
      reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

/** Open (and, if needed, create/upgrade) the "nibble" database. */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      // v0 -> v1: initial schema. Future migrations add
      // `if (event.oldVersion < N)` branches here rather than recreating
      // stores destructively.
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE)
      }
      if (!db.objectStoreNames.contains(LEADERBOARD_STORE)) {
        const leaderboardStore = db.createObjectStore(LEADERBOARD_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        })
        leaderboardStore.createIndex(LEADERBOARD_MODE_INDEX, 'modeId', {
          unique: false,
        })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error('IndexedDB open blocked by another connection'))
  })
}

/** Read one value from `kv` by key, or `undefined` if absent. */
async function kvGet<T>(
  db: IDBDatabase,
  key: string,
): Promise<T | undefined> {
  const tx = db.transaction(KV_STORE, 'readonly')
  const value = await requestToPromise<T | undefined>(
    tx.objectStore(KV_STORE).get(key),
  )
  await transactionDone(tx)
  return value
}

/** Write one value into `kv` under `key`. */
async function kvSet<T>(db: IDBDatabase, key: string, value: T): Promise<void> {
  const tx = db.transaction(KV_STORE, 'readwrite')
  tx.objectStore(KV_STORE).put(value, key)
  await transactionDone(tx)
}

async function getHighScoreFromDb(db: IDBDatabase, modeId: string): Promise<number> {
  const score = await kvGet<number>(db, highScoreKey(modeId))
  return score ?? 0
}

async function getCoinsFromDb(db: IDBDatabase): Promise<number> {
  const coins = await kvGet<number>(db, COINS_KEY)
  return coins ?? 0
}

async function getUnlocksFromDb(db: IDBDatabase): Promise<readonly string[]> {
  const unlocks = await kvGet<string[]>(db, UNLOCKS_KEY)
  return unlocks ?? []
}

async function addUnlockToDb(db: IDBDatabase, id: string): Promise<void> {
  const unlocks = await kvGet<string[]>(db, UNLOCKS_KEY)
  const set = new Set(unlocks ?? [])
  if (set.has(id)) return
  set.add(id)
  await kvSet(db, UNLOCKS_KEY, Array.from(set))
}

async function getSettingFromDb(
  db: IDBDatabase,
  key: string,
): Promise<string | null> {
  const value = await kvGet<string>(db, settingKey(key))
  return value ?? null
}

async function setSettingInDb(
  db: IDBDatabase,
  key: string,
  value: string,
): Promise<void> {
  await kvSet(db, settingKey(key), value)
}

async function getLeaderboardFromDb(
  db: IDBDatabase,
  modeId: string,
  limit: number,
): Promise<readonly LeaderboardEntry[]> {
  const tx = db.transaction(LEADERBOARD_STORE, 'readonly')
  const index = tx.objectStore(LEADERBOARD_STORE).index(LEADERBOARD_MODE_INDEX)
  const matches = await requestToPromise<StoredLeaderboardEntry[]>(
    index.getAll(modeId),
  )
  await transactionDone(tx)
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ modeId, name, score, achievedAt }) => ({
      modeId,
      name,
      score,
      achievedAt,
    }))
}

async function submitScoreToDb(
  db: IDBDatabase,
  entry: LeaderboardEntry,
): Promise<void> {
  // Untrusted input in the eventual remote case — see the note on
  // `PersistenceAdapter.submitScore` in `adapter.ts`. Locally there is no
  // server to validate against, so the entry is stored as given.
  const tx = db.transaction(LEADERBOARD_STORE, 'readwrite')
  tx.objectStore(LEADERBOARD_STORE).add(entry)
  await transactionDone(tx)
}

/** Either the open database, or the in-memory adapter it fell back to. */
type Backend =
  | { readonly kind: 'db'; readonly db: IDBDatabase }
  | { readonly kind: 'memory'; readonly adapter: PersistenceAdapter }

/**
 * Create the local, IndexedDB-backed adapter.
 *
 * Returns synchronously. The database connection opens lazily on first use
 * and is memoized; if `indexedDB` is missing or the open fails, every
 * method falls back (logged via `console.warn`, never thrown) to a single
 * shared `createMemoryAdapter()` instance so the game degrades to
 * "works for this tab session" instead of crashing.
 */
export function createLocalAdapter(): PersistenceAdapter {
  let dbPromise: Promise<IDBDatabase> | null = null
  // Set once IndexedDB has proven unusable; from then on every method
  // delegates to this single shared instance instead of retrying the DB.
  let fallback: PersistenceAdapter | null = null

  function fallBackTo(reason: unknown): PersistenceAdapter {
    if (!fallback) {
      console.warn(
        '[data] IndexedDB unavailable; falling back to in-memory persistence',
        reason,
      )
      fallback = createMemoryAdapter()
    }
    return fallback
  }

  /** Resolve where reads/writes should go this call, opening the database at most once. */
  function resolveBackend(): Promise<Backend> {
    if (fallback) return Promise.resolve({ kind: 'memory', adapter: fallback })
    if (typeof indexedDB === 'undefined') {
      const adapter = fallBackTo(
        new Error('indexedDB is not defined in this environment'),
      )
      return Promise.resolve({ kind: 'memory', adapter })
    }
    if (!dbPromise) {
      dbPromise = openDatabase().catch((error: unknown) => {
        fallBackTo(error)
        dbPromise = null
        throw error
      })
    }
    return dbPromise.then(
      (db): Backend => ({ kind: 'db', db }),
      (): Backend => ({ kind: 'memory', adapter: fallBackTo(null) }),
    )
  }

  return {
    async getHighScore(modeId) {
      const backend = await resolveBackend()
      if (backend.kind === 'memory') return backend.adapter.getHighScore(modeId)
      return getHighScoreFromDb(backend.db, modeId)
    },

    async setHighScore(modeId, score) {
      const backend = await resolveBackend()
      if (backend.kind === 'memory') {
        return backend.adapter.setHighScore(modeId, score)
      }
      await kvSet(backend.db, highScoreKey(modeId), score)
    },

    async getCoins() {
      const backend = await resolveBackend()
      if (backend.kind === 'memory') return backend.adapter.getCoins()
      return getCoinsFromDb(backend.db)
    },

    async setCoins(balance) {
      const backend = await resolveBackend()
      if (backend.kind === 'memory') return backend.adapter.setCoins(balance)
      await kvSet(backend.db, COINS_KEY, balance)
    },

    async getUnlocks() {
      const backend = await resolveBackend()
      if (backend.kind === 'memory') return backend.adapter.getUnlocks()
      return getUnlocksFromDb(backend.db)
    },

    async addUnlock(id) {
      const backend = await resolveBackend()
      if (backend.kind === 'memory') return backend.adapter.addUnlock(id)
      await addUnlockToDb(backend.db, id)
    },

    async getLeaderboard(modeId, limit = DEFAULT_LEADERBOARD_LIMIT) {
      const backend = await resolveBackend()
      if (backend.kind === 'memory') {
        return backend.adapter.getLeaderboard(modeId, limit)
      }
      return getLeaderboardFromDb(backend.db, modeId, limit)
    },

    async submitScore(entry) {
      const backend = await resolveBackend()
      if (backend.kind === 'memory') return backend.adapter.submitScore(entry)
      await submitScoreToDb(backend.db, entry)
    },

    async getSetting(key) {
      const backend = await resolveBackend()
      if (backend.kind === 'memory') return backend.adapter.getSetting(key)
      return getSettingFromDb(backend.db, key)
    },

    async setSetting(key, value) {
      const backend = await resolveBackend()
      if (backend.kind === 'memory') {
        return backend.adapter.setSetting(key, value)
      }
      await setSettingInDb(backend.db, key, value)
    },
  }
}
