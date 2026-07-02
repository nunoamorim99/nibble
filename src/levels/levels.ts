/**
 * The first balanced level set. Eight levels, one difficulty curve, all on a
 * 20x20 grid for a consistent feel. Each introduces or escalates exactly one
 * axis of difficulty at a time (per `CLAUDE.md` balance principles): never
 * stack a fresh modifier with a big speed jump or dense obstacles in the same
 * level. Layouts are built from small local helpers so the shapes are
 * readable and symmetric, but `LEVELS` itself is plain data — the helpers
 * never run at engine time.
 */
import type { Vec2 } from '../engine'
import type { LevelConfig } from './schema'

/** A straight run of cells from `(x, y)`, `length` cells long, one axis at a time. */
function line(x: number, y: number, length: number, axis: 'x' | 'y'): Vec2[] {
  const cells: Vec2[] = []
  for (let i = 0; i < length; i++) {
    cells.push(axis === 'x' ? { x: x + i, y } : { x, y: y + i })
  }
  return cells
}

/** A filled rectangle, `width` x `height` cells, top-left at `(x, y)`. */
function rect(x: number, y: number, width: number, height: number): Vec2[] {
  const cells: Vec2[] = []
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      cells.push({ x: x + dx, y: y + dy })
    }
  }
  return cells
}

/** The hollow border of a `width` x `height` rectangle, top-left at `(x, y)`. */
function ring(x: number, y: number, width: number, height: number): Vec2[] {
  const cells: Vec2[] = []
  for (let dx = 0; dx < width; dx++) {
    cells.push({ x: x + dx, y })
    cells.push({ x: x + dx, y: y + height - 1 })
  }
  for (let dy = 1; dy < height - 1; dy++) {
    cells.push({ x, y: y + dy })
    cells.push({ x: x + width - 1, y: y + dy })
  }
  return cells
}

/** Remove every cell in `holes` from `cells` — used to punch gaps in a ring/line. */
function minus(cells: readonly Vec2[], holes: readonly Vec2[]): Vec2[] {
  return cells.filter(
    (c) => !holes.some((h) => h.x === c.x && h.y === c.y),
  )
}

/** A plus/cross shape centered at `(cx, cy)` with arms `armLen` cells long. */
function plus(cx: number, cy: number, armLen: number): Vec2[] {
  return [
    { x: cx, y: cy },
    ...line(cx + 1, cy, armLen, 'x'),
    ...line(cx - armLen, cy, armLen, 'x'),
    ...line(cx, cy + 1, armLen, 'y'),
    ...line(cx, cy - armLen, armLen, 'y'),
  ]
}

// --- Level 2: sparse corner pillars ----------------------------------------
// Four isolated 2x2 blocks, one per corner, well clear of the center where
// the snake spawns and of the board edge. Purely spatial — first obstacle
// exposure, everything else stays at classic feel.
const level2Obstacles: Vec2[] = [
  ...rect(2, 2, 2, 2),
  ...rect(16, 2, 2, 2),
  ...rect(2, 16, 2, 2),
  ...rect(16, 16, 2, 2),
]

// --- Level 3: wraparound + central cross -------------------------------------
// A single plus-shaped block, offset above the spawn row so it never touches
// the safety zone, teaches wrap: running off any edge re-enters the opposite
// side, and the cross forces a first "go around" decision.
const level3Cross: Vec2[] = [
  ...line(9, 4, 3, 'x'),
  ...line(10, 3, 1, 'y'), // {10,3}
  ...line(10, 5, 3, 'y'), // {10,5}..{10,7}
]

// --- Level 4: box-with-gaps arena -------------------------------------------
// A hollow ring around the interior with one gap centered in each side, so
// the arena is never a sealed room. Ring spans cols 4-15, rows 4-15; its
// vertical edges (cols 4 and 15) sit outside the spawn-safety columns
// (7-14), and its horizontal edges (rows 4 and 15) sit off the spawn row
// (10), so the shape never touches the safety zone.
const level4Ring = ring(4, 4, 12, 12)
const level4Gaps: Vec2[] = [
  { x: 9, y: 4 }, // top gap
  { x: 10, y: 4 },
  { x: 9, y: 15 }, // bottom gap
  { x: 10, y: 15 },
  { x: 4, y: 9 }, // left gap
  { x: 4, y: 10 },
  { x: 15, y: 9 }, // right gap
  { x: 15, y: 10 },
]
const level4Obstacles = minus(level4Ring, level4Gaps)

// --- Level 5: parallel lanes -------------------------------------------------
// Four vertical lane walls at cols 3, 8, 12, 17, evenly spread so every
// corridor between/around them is at least 3 cells wide (never a 1-wide
// squeeze a growing snake could seal itself into). Each lane has its own
// two-cell gap; the two lanes that fall inside the spawn-safety columns
// (7-14) — at cols 8 and 12 — place their gap at rows 9-10 specifically, so
// it covers the spawn row and the lane never blocks the safety zone.
// wallsKill stays true here — this level's trick is lane navigation, not
// wrap.
function laneWithGap(x: number, gapStart: number): Vec2[] {
  const full = line(x, 1, 18, 'y')
  const gap = line(x, gapStart, 2, 'y')
  return minus(full, gap)
}
const level5Obstacles: Vec2[] = [
  ...laneWithGap(3, 3),
  ...laneWithGap(8, 9),
  ...laneWithGap(12, 9),
  ...laneWithGap(17, 14),
]

// --- Level 6: wrap + scattered blocks ---------------------------------------
// wrapAround again, this time with irregularly scattered single/double
// blocks rather than one shape — tests wrap navigation around clutter
// instead of around one obstacle.
const level6Obstacles: Vec2[] = [
  { x: 3, y: 3 },
  { x: 4, y: 3 },
  { x: 16, y: 3 },
  { x: 15, y: 3 },
  { x: 3, y: 16 },
  { x: 4, y: 16 },
  { x: 16, y: 16 },
  { x: 15, y: 16 },
  { x: 2, y: 10 },
  { x: 17, y: 10 },
  { x: 10, y: 2 },
  { x: 10, y: 17 },
  { x: 6, y: 6 },
  { x: 13, y: 13 },
  { x: 6, y: 13 },
  { x: 13, y: 6 },
]

// --- Level 7: sparse maze ----------------------------------------------------
// Four L-shaped hooks arranged in rotational (pinwheel) symmetry, one per
// quadrant, well clear of each other and of the spawn row/columns. Each hook
// is a 5-cell arm plus a 3-cell arm meeting at a shared corner; the second
// arm's start/length is trimmed so the corner cell is only listed once (no
// duplicate obstacle cell).
const level7Obstacles: Vec2[] = [
  ...line(3, 4, 5, 'x'),
  ...line(3, 5, 3, 'y'), // starts one below the shared corner (3,4)
  ...line(16, 3, 4, 'y'),
  ...line(13, 6, 3, 'x'), // stops one short of the shared corner (16,6)
  ...line(12, 15, 5, 'x'),
  ...line(16, 12, 3, 'y'), // stops one short of the shared corner (16,15)
  ...line(3, 13, 3, 'y'), // stops one short of the shared corner (3,16)
  ...line(4, 16, 3, 'x'), // starts one right of the shared corner (3,16)
]

// --- Level 8 "Full Plate": denser symmetric layout --------------------------
// Four plus-shaped clusters, one per quadrant, each with 2-cell arms, plus a
// lone dot in each far corner for texture. All four clusters and dots are
// spaced well apart from each other and from the spawn zone, so density
// rises (10% of the grid) without any pocket pinching shut. This is still
// under the 25% cap with room to spare.
const level8Obstacles: Vec2[] = [
  ...plus(5, 5, 2),
  ...plus(14, 5, 2),
  ...plus(5, 14, 2),
  ...plus(14, 14, 2),
  { x: 2, y: 2 },
  { x: 17, y: 2 },
  { x: 2, y: 17 },
  { x: 17, y: 17 },
]

/**
 * Eight levels forming the first difficulty curve. Every level keeps a
 * 20x20 grid; difficulty rises through exactly one new axis at a time —
 * obstacles, then wrap, then denser layouts, then speed — never several at
 * once (per `CLAUDE.md`: don't stack modifiers early, give reaction headroom
 * when speed rises).
 */
export const LEVELS: readonly LevelConfig[] = [
  {
    id: 'level-1',
    name: 'First Bite',
    cols: 20,
    rows: 20,
    applesToAdvance: 5,
    speedMultiplier: 1.0,
    wallsKill: true,
    wrapAround: false,
    obstacles: [],
  },
  {
    id: 'level-2',
    name: 'Corner Pillars',
    cols: 20,
    rows: 20,
    applesToAdvance: 7,
    speedMultiplier: 1.05,
    wallsKill: true,
    wrapAround: false,
    obstacles: level2Obstacles,
  },
  {
    id: 'level-3',
    name: 'Around the Edge',
    cols: 20,
    rows: 20,
    applesToAdvance: 8,
    speedMultiplier: 1.1,
    wallsKill: false,
    wrapAround: true,
    obstacles: level3Cross,
  },
  {
    id: 'level-4',
    name: 'Open Arena',
    cols: 20,
    rows: 20,
    applesToAdvance: 9,
    speedMultiplier: 1.15,
    wallsKill: true,
    wrapAround: false,
    obstacles: level4Obstacles,
  },
  {
    id: 'level-5',
    name: 'Lane Runner',
    cols: 20,
    rows: 20,
    applesToAdvance: 10,
    speedMultiplier: 1.2,
    wallsKill: true,
    wrapAround: false,
    obstacles: level5Obstacles,
  },
  {
    id: 'level-6',
    name: 'Cluttered Loop',
    cols: 20,
    rows: 20,
    applesToAdvance: 11,
    speedMultiplier: 1.3,
    wallsKill: false,
    wrapAround: true,
    obstacles: level6Obstacles,
  },
  {
    id: 'level-7',
    name: 'Pinwheel Maze',
    cols: 20,
    rows: 20,
    applesToAdvance: 12,
    speedMultiplier: 1.35,
    wallsKill: true,
    wrapAround: false,
    obstacles: level7Obstacles,
  },
  {
    id: 'level-8',
    name: 'Full Plate',
    cols: 20,
    rows: 20,
    applesToAdvance: 14,
    speedMultiplier: 1.5,
    wallsKill: true,
    wrapAround: false,
    obstacles: level8Obstacles,
  },
]
