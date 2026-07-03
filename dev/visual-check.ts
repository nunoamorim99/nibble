/**
 * Dev-only visual harness — NOT part of the production build. Renders one
 * static, hand-built mock `GameState` into a labeled canvas per registered
 * theme (using the real `createRenderer` + `themeRegistry`, nothing
 * reimplemented), so obstacle/food/snake shape and color changes can be
 * eyeballed across every theme at once. Pure display: no game loop, no
 * `step`/`applyTurn` calls, no engine decisions — the state below is a plain
 * object literal, not a played-out session. Reachable at
 * `/dev/visual-check.html` from the Vite dev server; never linked from
 * `index.html` and never referenced by `src/main.ts`.
 */
import type { GameConfig, GameState } from '../src/engine'
import { createRenderer } from '../src/render'
import { themeRegistry } from '../src/themes'

/** Render each theme at both ends of the cell-size range called out in the review brief. */
const CELL_SIZES_PX = [16, 24] as const

const GRID_COLS = 12
const GRID_ROWS = 12

/**
 * A plausible, hand-built config: a handful of obstacles clustered near the
 * food so the new shape/color treatment gets a real stress test, not just
 * isolated cells with nothing nearby to confuse them with.
 */
const MOCK_CONFIG: GameConfig = {
  cols: GRID_COLS,
  rows: GRID_ROWS,
  baseTicksPerSecond: 8,
  speedMultiplier: 1,
  wallsKill: true,
  wrapAround: false,
  obstacles: [
    { x: 8, y: 3 },
    { x: 9, y: 3 },
    { x: 8, y: 4 },
    { x: 3, y: 8 },
  ],
  applesToAdvance: null,
  growthPerFood: 3,
  pointsPerFood: 10,
  seed: 1,
}

/**
 * A length-5 snake with one corner bend (head moving up, then a turn), so
 * sprite themes exercise a corner tile and token themes show the body fill
 * bending — not just a straight line. Head first, tail last, per the engine
 * contract.
 */
const MOCK_STATE: GameState = {
  config: MOCK_CONFIG,
  tick: 42,
  snake: [
    { x: 5, y: 5 },
    { x: 5, y: 6 },
    { x: 5, y: 7 },
    { x: 6, y: 7 },
    { x: 7, y: 7 },
  ],
  direction: 'up',
  nextDirection: 'up',
  pendingGrowth: 0,
  food: { x: 9, y: 5 },
  score: 40,
  applesEaten: 4,
  status: 'running',
  deathCause: null,
  rngState: 1,
}

function createLabel(text: string): HTMLElement {
  const label = document.createElement('div')
  label.textContent = text
  label.style.font = '12px ui-monospace, monospace'
  label.style.color = '#e8e8e8'
  label.style.marginBottom = '4px'
  return label
}

function createCard(theme: (typeof themeRegistry)[number], cellSizePx: number): HTMLElement {
  const card = document.createElement('div')
  card.style.display = 'flex'
  card.style.flexDirection = 'column'
  card.style.alignItems = 'center'

  const canvas = document.createElement('canvas')
  canvas.width = cellSizePx * GRID_COLS
  canvas.height = cellSizePx * GRID_ROWS
  canvas.style.width = `${canvas.width}px`
  canvas.style.height = `${canvas.height}px`
  canvas.style.imageRendering = 'pixelated'
  canvas.style.border = '1px solid #444'

  card.appendChild(createLabel(`${theme.name} (${theme.id}) — ${cellSizePx}px cells`))
  card.appendChild(canvas)

  const renderer = createRenderer(canvas)
  // One-shot draw of the static mock state: no previous tick, no
  // interpolation progress, no HUD overrides — the harness only ever shows
  // the authoritative `next` snapshot.
  renderer.draw(null, MOCK_STATE, 1, theme, {})

  return card
}

function mount(): void {
  const root = document.querySelector<HTMLDivElement>('#visual-check-root')
  if (!root) throw new Error('#visual-check-root not found')

  const heading = document.createElement('p')
  heading.textContent =
    `Static mock state — grid ${GRID_COLS}x${GRID_ROWS}, snake with a corner, ` +
    `${MOCK_CONFIG.obstacles.length} obstacles, 1 food. Drawn once per theme (no game loop).`
  heading.style.font = '13px ui-monospace, monospace'
  heading.style.color = '#aaa'
  root.appendChild(heading)

  for (const cellSizePx of CELL_SIZES_PX) {
    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.flexWrap = 'wrap'
    row.style.gap = '16px'
    row.style.marginBottom = '24px'

    for (const theme of themeRegistry) {
      row.appendChild(createCard(theme, cellSizePx))
    }

    root.appendChild(row)
  }
}

mount()
