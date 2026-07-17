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
 *       - `setting:<key>`      -> string (opaque UI/app settings, e.g.
 *                                 the selected theme id)
 *
 * `setting:<key>` reuses the `kv` store under its own key namespace — no
 * separate object store.
 *
 * Version history
 * ---------------
 *  - v1: `kv` store + a `leaderboard` store (one row per submitted score,
 *    indexed by `modeId`), from when the game had a shared leaderboard.
 *  - v2: `leaderboard` store dropped. The game is offline-only and keeps just
 *    a personal best per mode, which lives in `kv` under `highscore:<modeId>`.
 *    Upgrading players keep their high scores; their old leaderboard rows are
 *    deleted with the store. The now-unused `coins`/`unlocks`/`setting:player:current`
 *    keys are left in `kv` — they are inert, and deleting them would cost a
 *    migration pass for no behavioral gain.
 *
 * No engine imports, no DOM beyond `indexedDB` itself, no UI.
 */
import type { PersistenceAdapter } from './adapter'
import { createMemoryAdapter } from './memory'

const DB_NAME = 'nibble'
const DB_VERSION = 2

const KV_STORE = 'kv'
/** Dropped in v2; named here only so the upgrade can delete it. */
const LEGACY_LEADERBOARD_STORE = 'leaderboard'

const highScoreKey = (modeId: string): string => `highscore:${modeId}`
// Key namespace within the existing `kv` store — see schema comment above.
const settingKey = (key: string): string => `setting:${key}`

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
      // v0 -> v1: initial schema.
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE)
      }
      // v1 -> v2: the leaderboard is gone. Drop the store if this database was
      // created back when it existed; `kv` (and every high score in it) stays.
      if (db.objectStoreNames.contains(LEGACY_LEADERBOARD_STORE)) {
        db.deleteObjectStore(LEGACY_LEADERBOARD_STORE)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error('IndexedDB open blocked by another connection'))
  })
}

/** Read one value from `kv` by key, or `undefined` if absent. */
async function kvGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
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

async function getHighScoreFromDb(
  db: IDBDatabase,
  modeId: string,
): Promise<number> {
  const score = await kvGet<number>(db, highScoreKey(modeId))
  return score ?? 0
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
