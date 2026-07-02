/**
 * Sprite support for skin-based themes (ladder rung 5+): lazy-loading and
 * caching a theme's spritesheet image + part map, and resolving which named
 * sprite part belongs on each snake segment from display-only geometry
 * (neighbor cell offsets, facing direction). Contains no game rules — it only
 * reads already-computed `Vec2` positions and decides which tile to draw.
 */
import type { Direction, Vec2 } from '../engine'
import type { ThemeSprites } from '../themes'

/** The pinned part-map shape produced by the art pipeline (`sheet.json`). */
export interface SpriteMap {
  /** Tile size in source pixels; every part is a `tile`×`tile` square. */
  readonly tile: number
  /** Part name -> `[col, row]` tile coordinates on the sheet. */
  readonly parts: Readonly<Record<string, readonly [number, number]>>
}

/** One theme's loaded sprite assets, ready to draw. */
export interface LoadedSprites {
  readonly image: HTMLImageElement
  readonly map: SpriteMap
  readonly pixelated: boolean
}

/** Cache entry lifecycle: pending fetch/decode, ready to draw, or failed permanently. */
type SpriteCacheEntry =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly sprites: LoadedSprites }
  | { readonly status: 'failed' }

/** All 16 pinned part keys the art pipeline guarantees on every sheet. */
export type PartKey =
  | 'head-up'
  | 'head-right'
  | 'head-down'
  | 'head-left'
  | 'body-h'
  | 'body-v'
  | 'corner-ne'
  | 'corner-nw'
  | 'corner-se'
  | 'corner-sw'
  | 'tail-up'
  | 'tail-right'
  | 'tail-down'
  | 'tail-left'
  | 'food'

/**
 * Load (once) and cache a theme's spritesheet image + part map, keyed by the
 * theme's stable id so switching themes and back never re-fetches. Returns
 * `undefined` while still loading or if loading failed — callers fall back to
 * the token-driven pipeline in both cases, so a missing/broken sheet never
 * blocks a draw.
 */
export function createSpriteCache() {
  const cache = new Map<string, SpriteCacheEntry>()

  function get(themeId: string, sprites: ThemeSprites): LoadedSprites | undefined {
    const existing = cache.get(themeId)
    if (existing) return existing.status === 'ready' ? existing.sprites : undefined

    cache.set(themeId, { status: 'loading' })
    void load(sprites)
      .then((loaded) => {
        cache.set(themeId, { status: 'ready', sprites: loaded })
      })
      .catch(() => {
        cache.set(themeId, { status: 'failed' })
      })
    return undefined
  }

  return { get }
}

async function load(sprites: ThemeSprites): Promise<LoadedSprites> {
  const [image, map] = await Promise.all([loadImage(sprites.sheetUrl), loadMap(sprites.mapUrl)])
  return { image, map, pixelated: sprites.pixelated === true }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load sprite sheet image: ${url}`))
    image.src = url
  })
}

async function loadMap(url: string): Promise<SpriteMap> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch sprite map: ${url}`)
  const data = (await response.json()) as SpriteMap
  if (typeof data.tile !== 'number' || !data.parts) {
    throw new Error(`Malformed sprite map: ${url}`)
  }
  return data
}

/** Source-pixel rect on the sheet for a given part, or `undefined` if the sheet lacks it. */
export function partSourceRect(
  map: SpriteMap,
  part: PartKey,
): { readonly sx: number; readonly sy: number; readonly size: number } | undefined {
  const coords = map.parts[part]
  if (!coords) return undefined
  const [col, row] = coords
  return { sx: col * map.tile, sy: row * map.tile, size: map.tile }
}

/**
 * Unit offset from `from` to `to`, unwrapping a wrap-around jump. A wrap
 * shows up as a raw offset with magnitude > 1 on an axis (the neighbor is on
 * the opposite edge of the board); in that case the *intended* direction of
 * travel is the opposite sign of the raw offset, so we invert that axis to
 * recover the unit direction the segment logically travels, purely for
 * choosing which sprite tile looks continuous across the seam.
 */
function unwrappedUnitOffset(from: Vec2, to: Vec2): Vec2 {
  const rawX = to.x - from.x
  const rawY = to.y - from.y
  const x = Math.abs(rawX) > 1 ? -Math.sign(rawX) : Math.sign(rawX)
  const y = Math.abs(rawY) > 1 ? -Math.sign(rawY) : Math.sign(rawY)
  return { x, y }
}

/** Map a unit direction vector back to a `Direction` name, defaulting to `'right'` for a zero vector. */
function directionFromUnitVector(vector: Vec2): Direction {
  if (vector.x === 1) return 'right'
  if (vector.x === -1) return 'left'
  if (vector.y === 1) return 'down'
  if (vector.y === -1) return 'up'
  return 'right'
}

/** `corner-<ne|nw|se|sw>` part name for the two cardinal sides a corner segment opens toward. */
function cornerPart(sideA: Vec2, sideB: Vec2): PartKey {
  const north = sideA.y === -1 || sideB.y === -1
  const south = sideA.y === 1 || sideB.y === 1
  const east = sideA.x === 1 || sideB.x === 1
  const west = sideA.x === -1 || sideB.x === -1
  if (north && east) return 'corner-ne'
  if (north && west) return 'corner-nw'
  if (south && east) return 'corner-se'
  return 'corner-sw' // south && west (the only remaining combination for two perpendicular sides)
}

/**
 * Resolve which sprite part belongs on one snake segment, from display-only
 * geometry: the segment's index in the body, its cell, its immediate
 * neighbors toward the head and tail (if any), and the snake's committed
 * facing direction (for the head only). Every input here is already-computed
 * positional data — no collision/growth/scoring decisions are made.
 */
export function resolveSegmentPart(
  index: number,
  length: number,
  cell: Vec2,
  towardHeadNeighbor: Vec2 | undefined,
  towardTailNeighbor: Vec2 | undefined,
  facing: Direction,
): PartKey {
  if (index === 0) return `head-${facing}` as PartKey

  if (index === length - 1) {
    // Tail part is named by the direction FROM the tail cell TOWARD its one
    // body neighbor (the segment closer to the head).
    const neighbor = towardHeadNeighbor
    if (!neighbor) return 'tail-up'
    const unit = unwrappedUnitOffset(cell, neighbor)
    return `tail-${directionFromUnitVector(unit)}` as PartKey
  }

  // Middle segment: has both neighbors. Straight if they're opposite each
  // other along one axis, otherwise a corner named by the two open sides.
  if (!towardHeadNeighbor || !towardTailNeighbor) return 'body-h'

  const toHead = unwrappedUnitOffset(cell, towardHeadNeighbor)
  const toTail = unwrappedUnitOffset(cell, towardTailNeighbor)

  const isHorizontalStraight = toHead.x !== 0 && toTail.x !== 0 && toHead.y === 0 && toTail.y === 0
  const isVerticalStraight = toHead.y !== 0 && toTail.y !== 0 && toHead.x === 0 && toTail.x === 0
  if (isHorizontalStraight) return 'body-h'
  if (isVerticalStraight) return 'body-v'

  return cornerPart(toHead, toTail)
}
