import {
  CLASSIC_CONFIG,
  applyTurn,
  createInitialState,
  step,
  ticksPerSecond,
  type GameState,
} from './engine'
import { createRenderer } from './render'
import {
  DEFAULT_THEME_ID,
  classicTheme,
  getThemeById,
  themeRegistry,
  type Theme,
} from './themes'
import { createLocalAdapter } from './data'
import { createInputController, createUiShell } from './ui'

const MODE_ID = 'classic'
const MAX_FRAME_MS = 250
const SETTING_THEME = 'theme'

const canvasEl = document.querySelector<HTMLCanvasElement>('#game')
if (!canvasEl) throw new Error('Canvas #game not found')
const canvas: HTMLCanvasElement = canvasEl

const renderer = createRenderer(canvas)
const storage = createLocalAdapter()

// Composition root: the engine forbids Math.random/Date.now inside update
// logic, so the one place a fresh seed may be drawn is here, at game creation.
function newGame(): GameState {
  const seed = (Math.random() * 0xffffffff) >>> 0
  return createInitialState({ ...CLASSIC_CONFIG, seed })
}

let highScore = 0
let activeTheme: Theme = classicTheme
let paused = false
let prev: GameState | null = null
let state = newGame()
let accumulator = 0
let lastTime = performance.now()

void storage.getHighScore(MODE_ID).then((saved) => {
  highScore = Math.max(highScore, saved)
})

function onRoundEnd(finished: GameState): void {
  if (finished.score > highScore) {
    highScore = finished.score
    void storage.setHighScore(MODE_ID, finished.score)
  }
  if (finished.score > 0) shell.promptScoreSubmit(finished.score)
}

function togglePause(): void {
  if (state.status !== 'running') return
  paused = !paused
  accumulator = 0
  shell.setPaused(paused)
}

function requestRestart(force: boolean): void {
  if (!force && state.status === 'running') return
  prev = null
  paused = false
  accumulator = 0
  state = newGame()
  shell.setPaused(false)
}

function setTheme(id: string, persist: boolean): void {
  const theme = getThemeById(id)
  if (!theme) return
  activeTheme = theme
  shell.setActiveTheme(id)
  if (persist) void storage.setSetting(SETTING_THEME, id)
}

const shell = createUiShell({
  adapter: storage,
  modeId: MODE_ID,
  themes: themeRegistry.map((theme) => ({ id: theme.id, name: theme.name })),
  activeThemeId: DEFAULT_THEME_ID,
  onThemeSelect: (id) => setTheme(id, true),
  onPauseToggle: togglePause,
  onRestart: () => requestRestart(true),
})

void storage.getSetting(SETTING_THEME).then((saved) => {
  if (saved) setTheme(saved, false)
})

const input = createInputController({
  swipeTarget: canvas,
  onPauseToggle: togglePause,
  onRestart: () => requestRestart(false),
})

// Responsive square canvas: match the CSS display size at device resolution.
// The renderer recomputes cell geometry from canvas.width/height every draw.
function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1
  const cssSize = canvas.clientWidth || canvas.width
  const pixelSize = Math.max(1, Math.round(cssSize * dpr))
  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize
    canvas.height = pixelSize
  }
}
new ResizeObserver(resizeCanvas).observe(canvas)
resizeCanvas()

function frame(now: number): void {
  const tickMs = 1000 / ticksPerSecond(state.config)
  const delta = now - lastTime
  lastTime = now

  if (!paused && state.status === 'running') {
    accumulator = Math.min(accumulator + delta, MAX_FRAME_MS)
    while (accumulator >= tickMs && state.status === 'running') {
      const queued = input.takeTurn()
      const turned = queued ? applyTurn(state, queued) : state
      prev = turned
      state = step(turned)
      if (state.status !== 'running') onRoundEnd(state)
      accumulator -= tickMs
    }
  }

  const alpha =
    !paused && state.status === 'running' ? Math.min(accumulator / tickMs, 1) : 1
  renderer.draw(prev, state, alpha, activeTheme, { highScore, paused })
  requestAnimationFrame(frame)
}

requestAnimationFrame((now) => {
  lastTime = now
  requestAnimationFrame(frame)
})
