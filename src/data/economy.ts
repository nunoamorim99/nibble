/**
 * Economy logic: points -> coins conversion, cosmetic-unlock checks, and
 * shop purchase orchestration against a `PersistenceAdapter`. All tuning
 * numbers (conversion rate, prices) come from `economy.config.ts` — nothing
 * here is a hardcoded number.
 *
 * Unlocks are cosmetic only. `purchaseItem` records an id via
 * `adapter.addUnlock`; nothing in this module can affect gameplay.
 *
 * No engine/render/ui imports — adapter contract + economy config only.
 */
import type { PersistenceAdapter } from './adapter'
import { ECONOMY, SHOP_CATALOG, type ShopItem } from './economy.config'

/**
 * Convert a score to a coin count using the baseline points -> coins model:
 * every `ECONOMY.pointsPerCoin` points is worth 1 coin, rounded down.
 * Negative scores never yield negative coins.
 */
export function coinsForScore(score: number): number {
  return Math.floor(Math.max(0, score) / ECONOMY.pointsPerCoin)
}

/**
 * Whether `themeId` is available for use. Themes with no catalog entry
 * (e.g. `classic`, the free default) are always unlocked. Catalog themes
 * require their shop item id to be present in `unlocks`.
 */
export function isThemeUnlocked(
  themeId: string,
  unlocks: readonly string[],
): boolean {
  const item = SHOP_CATALOG.find((entry) => entry.themeId === themeId)
  if (!item) return true
  return unlocks.includes(item.id)
}

/** Look up a shop item by its id, or `undefined` if it isn't in the catalog. */
export function getShopItem(itemId: string): ShopItem | undefined {
  return SHOP_CATALOG.find((entry) => entry.id === itemId)
}

/** Outcome of a `purchaseItem` call. */
export type PurchaseResult =
  | { readonly ok: true; readonly newBalance: number }
  | {
      readonly ok: false
      readonly reason: 'unknown-item' | 'already-owned' | 'insufficient-coins'
    }

/**
 * Attempt to purchase `itemId` through `adapter`. Validates, in order: the
 * item exists in the catalog; it isn't already unlocked; the current coin
 * balance covers the price. On success, decrements the balance by exactly
 * the item's price and records the unlock — cosmetic only, never a gameplay
 * effect.
 *
 * SECURITY NOTE (Phase 7 remote backend): once a remote adapter replaces the
 * local one, this same validation order (item exists -> not owned -> can
 * afford) must be re-run server-side against the account's authoritative
 * balance/unlocks — a client call into this function is not proof of
 * payment on a network-backed adapter.
 */
export async function purchaseItem(
  adapter: PersistenceAdapter,
  itemId: string,
): Promise<PurchaseResult> {
  const item = getShopItem(itemId)
  if (!item) {
    return { ok: false, reason: 'unknown-item' }
  }

  const unlocks = await adapter.getUnlocks()
  if (unlocks.includes(item.id)) {
    return { ok: false, reason: 'already-owned' }
  }

  const balance = await adapter.getCoins()
  if (balance < item.price) {
    return { ok: false, reason: 'insufficient-coins' }
  }

  const newBalance = balance - item.price
  await adapter.setCoins(newBalance)
  await adapter.addUnlock(item.id)
  return { ok: true, newBalance }
}

/**
 * Convert `score` to coins (`coinsForScore`) and add them to the balance
 * held by `adapter`. Returns the resulting (new) balance. When the score
 * converts to 0 coins, this still reads and returns the current balance
 * unchanged without writing.
 */
export async function grantCoinsForScore(
  adapter: PersistenceAdapter,
  score: number,
): Promise<number> {
  const earned = coinsForScore(score)
  const balance = await adapter.getCoins()
  if (earned === 0) return balance

  const newBalance = balance + earned
  await adapter.setCoins(newBalance)
  return newBalance
}
