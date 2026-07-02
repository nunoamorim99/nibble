/**
 * Lazy-loads and caches a theme's scenic `colors.backgroundImage`, keyed by
 * URL. While loading, or if the image fails to load, callers get
 * `undefined` back and should fall back to the gradient/flat background —
 * no flicker of a blank frame either way.
 */

type ImageCacheEntry =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly image: HTMLImageElement }
  | { readonly status: 'failed' }

/** Create a fresh, empty background-image cache for one renderer instance. */
export function createBackgroundImageCache() {
  const cache = new Map<string, ImageCacheEntry>()

  function get(url: string): HTMLImageElement | undefined {
    const existing = cache.get(url)
    if (existing) return existing.status === 'ready' ? existing.image : undefined

    cache.set(url, { status: 'loading' })
    const image = new Image()
    image.onload = () => cache.set(url, { status: 'ready', image })
    image.onerror = () => cache.set(url, { status: 'failed' })
    image.src = url
    return undefined
  }

  return { get }
}
