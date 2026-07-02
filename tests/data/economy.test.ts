import { describe, it, expect } from 'vitest'
import { createMemoryAdapter } from '../../src/data/memory'
import {
  coinsForScore,
  isThemeUnlocked,
  getShopItem,
  purchaseItem,
  grantCoinsForScore,
} from '../../src/data/economy'
import { ECONOMY, SHOP_CATALOG } from '../../src/data/economy.config'

describe('coinsForScore', () => {
  it('converts using the configured pointsPerCoin rate', () => {
    expect(coinsForScore(ECONOMY.pointsPerCoin)).toBe(1)
    expect(coinsForScore(ECONOMY.pointsPerCoin * 5)).toBe(5)
  })

  it('floors partial conversions', () => {
    expect(coinsForScore(ECONOMY.pointsPerCoin - 1)).toBe(0)
    expect(coinsForScore(ECONOMY.pointsPerCoin + 1)).toBe(1)
    expect(coinsForScore(ECONOMY.pointsPerCoin * 2 - 1)).toBe(1)
  })

  it('returns 0 for a score of 0', () => {
    expect(coinsForScore(0)).toBe(0)
  })

  it('returns 0 for negative scores rather than a negative coin count', () => {
    expect(coinsForScore(-1)).toBe(0)
    expect(coinsForScore(-1000)).toBe(0)
  })
})

describe('isThemeUnlocked', () => {
  it('is always true for classic, which has no catalog entry', () => {
    expect(isThemeUnlocked('classic', [])).toBe(true)
    expect(isThemeUnlocked('classic', ['theme:mono-plus'])).toBe(true)
  })

  it('is false for a catalog theme until its item id is present', () => {
    expect(isThemeUnlocked('mono-plus', [])).toBe(false)
    expect(isThemeUnlocked('mono-plus', ['theme:first-color'])).toBe(false)
  })

  it('is true for a catalog theme once its item id is unlocked', () => {
    expect(isThemeUnlocked('mono-plus', ['theme:mono-plus'])).toBe(true)
  })
})

describe('getShopItem', () => {
  it('returns the matching catalog entry by id', () => {
    const item = getShopItem('theme:mono-plus')
    expect(item).toEqual(SHOP_CATALOG[0])
  })

  it('returns undefined for an id not in the catalog', () => {
    expect(getShopItem('theme:classic')).toBeUndefined()
    expect(getShopItem('nope')).toBeUndefined()
  })
})

describe('purchaseItem', () => {
  it('rejects an unknown item id', async () => {
    const adapter = createMemoryAdapter()
    const result = await purchaseItem(adapter, 'theme:does-not-exist')
    expect(result).toEqual({ ok: false, reason: 'unknown-item' })
    expect(await adapter.getCoins()).toBe(0)
    expect(await adapter.getUnlocks()).toEqual([])
  })

  it('rejects a purchase of an item already owned', async () => {
    const adapter = createMemoryAdapter()
    await adapter.setCoins(1000)
    await adapter.addUnlock('theme:mono-plus')

    const result = await purchaseItem(adapter, 'theme:mono-plus')
    expect(result).toEqual({ ok: false, reason: 'already-owned' })
    // Balance untouched by the rejected purchase.
    expect(await adapter.getCoins()).toBe(1000)
  })

  it('rejects a purchase when coins are insufficient, leaving balance untouched', async () => {
    const item = SHOP_CATALOG[0]!
    const adapter = createMemoryAdapter()
    await adapter.setCoins(item.price - 1)

    const result = await purchaseItem(adapter, item.id)
    expect(result).toEqual({ ok: false, reason: 'insufficient-coins' })
    expect(await adapter.getCoins()).toBe(item.price - 1)
    expect(await adapter.getUnlocks()).toEqual([])
  })

  it('on the happy path decrements the balance exactly and records the unlock', async () => {
    const item = SHOP_CATALOG[0]!
    const adapter = createMemoryAdapter()
    await adapter.setCoins(item.price + 25)

    const result = await purchaseItem(adapter, item.id)
    expect(result).toEqual({ ok: true, newBalance: 25 })
    expect(await adapter.getCoins()).toBe(25)
    expect(await adapter.getUnlocks()).toEqual([item.id])
  })

  it('a subsequent purchase of the same item returns already-owned', async () => {
    const item = SHOP_CATALOG[0]!
    const adapter = createMemoryAdapter()
    await adapter.setCoins(item.price * 2)

    const first = await purchaseItem(adapter, item.id)
    expect(first.ok).toBe(true)

    const second = await purchaseItem(adapter, item.id)
    expect(second).toEqual({ ok: false, reason: 'already-owned' })
    // Balance reflects only the first purchase, not a double-charge.
    expect(await adapter.getCoins()).toBe(item.price)
  })
})

describe('grantCoinsForScore', () => {
  it('adds the converted coin amount to the balance and returns the new balance', async () => {
    const adapter = createMemoryAdapter()
    await adapter.setCoins(10)

    const newBalance = await grantCoinsForScore(adapter, ECONOMY.pointsPerCoin * 3)
    expect(newBalance).toBe(13)
    expect(await adapter.getCoins()).toBe(13)
  })

  it('adds 0 and leaves the balance unchanged when score is below pointsPerCoin', async () => {
    const adapter = createMemoryAdapter()
    await adapter.setCoins(7)

    const newBalance = await grantCoinsForScore(adapter, ECONOMY.pointsPerCoin - 1)
    expect(newBalance).toBe(7)
    expect(await adapter.getCoins()).toBe(7)
  })
})
