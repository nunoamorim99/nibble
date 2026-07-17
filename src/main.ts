import {
  CLASSIC_CONFIG,
  applyTurn,
  createInitialState,
  step,
  ticksPerSecond,
  type GameState,
} from './engine'
import { createRenderer, type Hud } from './render'
import {
  DEFAULT_THEME_ID,
  classicTheme,
  getThemeById,
  themeRegistry,
  type Theme,
} from './themes'
import { LEVELS, levelToGameConfig } from './levels'
import { createAdapter } from './data'
import {
  createInputController,
  createSoundPlayer,
  createUiShell,
  type ThemeOption,
} from './ui'

const MODE_CLASSIC = 'classic'
const MODE_LEVELS = 'levels'
const MAX_FRAME_MS = 250
const SETTING_THEME = 'theme'
const SETTING_MODE = 'mode'
const SETTING_LEVEL_PROGRESS = 'levels:highest'
const SETTING_MUTED = 'muted'
const SETTING_TOUCH_CONTROLS = 'touch-controls'

type GameMode = { readonly kind: 'classic' } | { readonly kind: 'level'; readonly index: number }

const canvasEl = document.querySelector<HTMLCanvasElement>('#game')
if (!canvasEl) throw new Error('Canvas #game not found')
const canvas: HTMLCanvasElement = canvasEl

const renderer = createRenderer(canvas)
// Offline-only, single-device storage: the local IndexedDB adapter (which
// self-heals to in-memory if IndexedDB is unusable).
const storage = createAdapter()
const sound = createSoundPlayer()

// Personal best for the mode currently being played — the only score the game
// keeps, shown in the HUD as the number to beat. Keyed per mode (see
// `modeKey`), so a level run never overwrites the classic best.
let highScore = 0
let activeTheme: Theme = classicTheme
let mode: GameMode = { kind: 'classic' }
let highestLevelUnlocked = 0
let paused = false
// On-screen D-pad default: visible on coarse-pointer (touch) devices, hidden
// on desktop; the persisted setting overrides this at boot.
let touchControls = window.matchMedia('(pointer: coarse)').matches
// Ready gate: a fresh round holds still until the player's first turn input,
// so opening the page (or advancing a level) never runs the snake unattended.
let awaitingStart = true
let prev: GameState | null = null
let accumulator = 0
let lastTime = performance.now()

// Composition root: the engine forbids Math.random/Date.now inside update
// logic, so the one place a fresh seed may be drawn is here, at game creation.
function newGame(): GameState {
  const seed = (Math.random() * 0xffffffff) >>> 0
  if (mode.kind === 'level' && LEVELS.length > 0) {
    const level = LEVELS[Math.min(mode.index, LEVELS.length - 1)]
    return createInitialState(levelToGameConfig(level, seed))
  }
  return createInitialState({ ...CLASSIC_CONFIG, seed })
}

let state = newGame()

/** Storage key for the active mode's personal best. Classic and Levels keep
 * separate bests — they are different challenges, so one must not overwrite
 * the other. */
function modeKey(): string {
  return mode.kind === 'level' ? MODE_LEVELS : MODE_CLASSIC
}

/** Load the active mode's best into `highScore` (0 when none recorded yet). */
function loadHighScore(): Promise<void> {
  const key = modeKey()
  return storage.getHighScore(key).then((saved) => {
    // Ignore a late resolve for a mode the player already switched away from.
    if (key === modeKey()) highScore = saved
  })
}

void loadHighScore()

function currentLevelNumber(): number {
  return mode.kind === 'level' ? mode.index + 1 : 0
}

function hasNextLevel(): boolean {
  return mode.kind === 'level' && mode.index + 1 < LEVELS.length
}

function onRoundEnd(finished: GameState): void {
  // A new personal best for whichever mode was played — the game's only score.
  if (finished.score > highScore) {
    highScore = finished.score
    void storage.setHighScore(modeKey(), finished.score)
  }
  if (mode.kind === 'level' && finished.status === 'won') {
    const nextIndex = mode.index + 1
    if (nextIndex < LEVELS.length && nextIndex > highestLevelUnlocked) {
      highestLevelUnlocked = nextIndex
      void storage.setSetting(SETTING_LEVEL_PROGRESS, String(nextIndex))
    }
  }
  sound.play(finished.status === 'won' ? 'levelclear' : 'gameover')
}

function toggleMute(): void {
  const muted = !sound.isMuted()
  sound.setMuted(muted)
  shell.setMuted(muted)
  void storage.setSetting(SETTING_MUTED, muted ? 'true' : 'false')
}

function toggleTouchControls(): void {
  touchControls = !touchControls
  shell.setTouchControls(touchControls)
  void storage.setSetting(SETTING_TOUCH_CONTROLS, touchControls ? 'on' : 'off')
}

function togglePause(): void {
  if (awaitingStart || state.status !== 'running') return
  paused = !paused
  accumulator = 0
  shell.setPaused(paused)
}

function updateLevelInfo(): void {
  shell.setLevelInfo(
    mode.kind === 'level' ? `LV ${currentLevelNumber()}/${LEVELS.length}` : null,
  )
}

function requestRestart(force: boolean): void {
  if (!force && state.status === 'running') return
  // A won level advances to the next one; everything else replays.
  if (mode.kind === 'level' && state.status === 'won' && hasNextLevel()) {
    mode = { kind: 'level', index: mode.index + 1 }
  }
  prev = null
  paused = false
  awaitingStart = true
  accumulator = 0
  state = newGame()
  shell.setPaused(false)
  updateLevelInfo()
}

function setMode(id: string, persist: boolean): void {
  const wantLevels = id === MODE_LEVELS
  if (wantLevels === (mode.kind === 'level')) {
    shell.setActiveMode(id)
    return
  }
  mode = wantLevels ? { kind: 'level', index: highestLevelUnlocked } : { kind: 'classic' }
  shell.setActiveMode(wantLevels ? MODE_LEVELS : MODE_CLASSIC)
  if (persist) void storage.setSetting(SETTING_MODE, wantLevels ? MODE_LEVELS : MODE_CLASSIC)
  // Each mode has its own best; show the one for the mode we just entered.
  highScore = 0
  void loadHighScore()
  requestRestart(true)
}

function setTheme(id: string, persist: boolean): void {
  const theme = getThemeById(id)
  if (!theme) return
  activeTheme = theme
  shell.setActiveTheme(id)
  if (persist) void storage.setSetting(SETTING_THEME, id)
}

/** Every theme is available from the start — there is nothing to unlock. */
function themeOptions(): readonly ThemeOption[] {
  return themeRegistry.map((theme) => ({ id: theme.id, name: theme.name }))
}

// Menu flow: opening the menu mid-run pauses; closing it resumes only what
// the menu itself paused. Picking a mode always starts a fresh run.
let pausedByMenu = false

function handlePlay(id: string): void {
  pausedByMenu = false
  const wantLevels = id === MODE_LEVELS
  if (wantLevels === (mode.kind === 'level')) {
    requestRestart(true)
    return
  }
  setMode(id, true)
}

function handleMenuOpen(): void {
  if (state.status === 'running' && !paused && !awaitingStart) {
    togglePause()
    pausedByMenu = true
  }
}

function handleMenuClose(): void {
  if (pausedByMenu && paused) togglePause()
  pausedByMenu = false
}

const shell = createUiShell({
  modes: [
    { id: MODE_CLASSIC, name: 'Classic' },
    { id: MODE_LEVELS, name: 'Levels' },
  ],
  activeModeId: MODE_CLASSIC,
  onPlay: handlePlay,
  onMenuOpen: handleMenuOpen,
  onMenuClose: handleMenuClose,
  themes: themeOptions(),
  activeThemeId: DEFAULT_THEME_ID,
  onThemeSelect: (id) => setTheme(id, true),
  onMuteToggle: toggleMute,
  onDirection: (dir) => input.pushTurn(dir),
  onTouchControlsToggle: toggleTouchControls,
  onPauseToggle: togglePause,
  onRestart: () => requestRestart(true),
})

void storage.getSetting(SETTING_MUTED).then((saved) => {
  const muted = saved === 'true'
  sound.setMuted(muted)
  shell.setMuted(muted)
})

void storage.getSetting(SETTING_TOUCH_CONTROLS).then((saved) => {
  if (saved === 'on') touchControls = true
  else if (saved === 'off') touchControls = false
  shell.setTouchControls(touchControls)
})

void storage.getSetting(SETTING_THEME).then((saved) => {
  if (saved) setTheme(saved, false)
})

void Promise.all([
  storage.getSetting(SETTING_MODE),
  storage.getSetting(SETTING_LEVEL_PROGRESS),
]).then(([savedMode, savedProgress]) => {
  const parsed = Number.parseInt(savedProgress ?? '', 10)
  if (Number.isFinite(parsed) && LEVELS.length > 0) {
    highestLevelUnlocked = Math.min(Math.max(parsed, 0), LEVELS.length - 1)
  }
  if (savedMode === MODE_LEVELS) setMode(MODE_LEVELS, false)
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

function buildHud(): Hud {
  const levelLabel =
    mode.kind === 'level' && state.config.applesToAdvance !== null
      ? `LEVEL ${currentLevelNumber()}  APPLES ${state.applesEaten}/${state.config.applesToAdvance}`
      : undefined

  let overlayTitle: string | undefined
  let overlayHint: string | undefined
  if (mode.kind === 'level') {
    if (state.status === 'won') {
      overlayTitle = hasNextLevel()
        ? `LEVEL ${currentLevelNumber()} CLEAR`
        : 'ALL LEVELS CLEAR'
      overlayHint = hasNextLevel()
        ? `Press Enter for Level ${currentLevelNumber() + 1}`
        : 'Press Enter to replay'
    } else if (state.status === 'gameover') {
      overlayHint = 'Press Enter to retry'
    }
  }

  const waiting = awaitingStart && state.status === 'running'
  if (waiting) {
    overlayTitle = 'READY'
    overlayHint = 'Press an arrow key or swipe to start'
  }

  return {
    // Both modes keep their own best, so both show one to beat.
    highScore,
    paused: paused || waiting,
    levelLabel,
    overlayTitle,
    overlayHint,
  }
}

function frame(now: number): void {
  const tickMs = 1000 / ticksPerSecond(state.config)
  const delta = now - lastTime
  lastTime = now

  if (awaitingStart && state.status === 'running') {
    const queued = input.takeTurn()
    if (queued) {
      awaitingStart = false
      state = applyTurn(state, queued)
    }
  }

  if (!paused && !awaitingStart && state.status === 'running') {
    accumulator = Math.min(accumulator + delta, MAX_FRAME_MS)
    while (accumulator >= tickMs && state.status === 'running') {
      const queued = input.takeTurn()
      const turned = queued ? applyTurn(state, queued) : state
      prev = turned
      state = step(turned)
      if (state.applesEaten > turned.applesEaten) sound.play('eat')
      if (state.status !== 'running') onRoundEnd(state)
      accumulator -= tickMs
    }
  }

  const alpha =
    !paused && !awaitingStart && state.status === 'running'
      ? Math.min(accumulator / tickMs, 1)
      : 1
  renderer.draw(prev, state, alpha, activeTheme, buildHud())
  requestAnimationFrame(frame)
}

requestAnimationFrame((now) => {
  lastTime = now
  requestAnimationFrame(frame)
})
