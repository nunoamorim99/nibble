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
import {
  CODE_PATTERN,
  SHOP_CATALOG,
  createPlayerRuntime,
  grantCoinsForScore,
  isThemeUnlocked,
  normalizeCode,
  purchaseItem,
  reconcile,
} from './data'
import {
  createInputController,
  createSoundPlayer,
  createUiShell,
  type AccountActionResult,
  type PlayerScoreView,
  type ShopItemView,
  type ThemeOption,
} from './ui'

const MODE_ID = 'classic'
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
// Player-accounts runtime: `storage` is the composed adapter (local →
// leaderboard → player-sync). `identity`/`playerClient`/`accountsEnabled` drive
// the optional cross-device account. When accounts are disabled these are inert
// and `storage` behaves exactly like the old `createAdapter()`.
const { adapter: storage, identity, playerClient, accountsEnabled } = createPlayerRuntime()
const sound = createSoundPlayer()

let highScore = 0
let coins = 0
let unlocks: readonly string[] = []
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

void storage.getHighScore(MODE_ID).then((saved) => {
  highScore = Math.max(highScore, saved)
})

function currentLevelNumber(): number {
  return mode.kind === 'level' ? mode.index + 1 : 0
}

function hasNextLevel(): boolean {
  return mode.kind === 'level' && mode.index + 1 < LEVELS.length
}

function onRoundEnd(finished: GameState): void {
  if (mode.kind === 'classic') {
    if (finished.score > highScore) {
      highScore = finished.score
      void storage.setHighScore(MODE_ID, finished.score)
    }
    if (finished.score > 0) shell.promptScoreSubmit(finished.score)
  } else if (finished.status === 'won') {
    const nextIndex = mode.index + 1
    if (nextIndex < LEVELS.length && nextIndex > highestLevelUnlocked) {
      highestLevelUnlocked = nextIndex
      void storage.setSetting(SETTING_LEVEL_PROGRESS, String(nextIndex))
    }
  }
  void grantCoinsForScore(storage, finished.score).then((balance) => {
    coins = balance
    shell.setCoins(balance)
  })
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
  requestRestart(true)
}

function setTheme(id: string, persist: boolean): void {
  const theme = getThemeById(id)
  if (!theme) return
  activeTheme = theme
  shell.setActiveTheme(id)
  if (persist) void storage.setSetting(SETTING_THEME, id)
}

function themeOptions(): readonly ThemeOption[] {
  return themeRegistry.map((theme) => ({
    id: theme.id,
    name: theme.name,
    locked: !isThemeUnlocked(theme.id, unlocks),
  }))
}

function shopItemViews(): readonly ShopItemView[] {
  return SHOP_CATALOG.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    owned: unlocks.includes(item.id),
  }))
}

async function refreshEconomy(): Promise<void> {
  const [balance, owned] = await Promise.all([storage.getCoins(), storage.getUnlocks()])
  coins = balance
  unlocks = owned
  shell.setCoins(coins)
  shell.updateThemes(themeOptions())
  shell.updateShop(shopItemViews())
}

// --- player accounts (optional) ---------------------------------------
// All the networking lives behind `playerClient`; the shell only fires these
// callbacks and renders their results, so the UI layer never touches fetch.

// Serializes account adoption so a second create/restore can't interleave with
// an in-flight one (belt-and-suspenders beyond the modal/disabled-button UI).
let adoptInFlight: Promise<void> = Promise.resolve()

/** Merge a fetched account into local storage (max coins / union unlocks),
 * then push the merged result up ONCE so devices converge, and refresh the UI.
 *
 * Ordering matters and is deliberate:
 *  1. Clear the current identity so the local writes below do NOT trigger the
 *     sync decorator's per-write push (which would target a stale account and
 *     fire N times for N unlocks).
 *  2. Write the reconciled coins/unlocks locally (no network).
 *  3. Set the new identity, then push the merged snapshot exactly once via the
 *     client. The server's own max/union merge makes this converge safely even
 *     if a concurrent device also pushed.
 * Reconcile is `max(coins)` + `union(unlocks)`, so this never lowers coins or
 * drops an unlock — a concurrent local write at worst gets re-merged, never lost.
 */
function adoptAccount(account: {
  name: string
  code: string
  coins: number
  unlocks: readonly string[]
}): Promise<void> {
  const run = async () => {
    const localCoins = await storage.getCoins()
    const localUnlocks = await storage.getUnlocks()
    const merged = reconcile(
      { coins: localCoins, unlocks: localUnlocks },
      { coins: account.coins, unlocks: account.unlocks },
    )
    // 1. Detach any current account so the writes below don't per-write push.
    await identity.set(null)
    // 2. Apply merged progress locally (no code set → decorator stays quiet).
    await storage.setCoins(merged.coins)
    for (const id of merged.unlocks) await storage.addUnlock(id)
    // 3. Bind the new identity and push the merged snapshot exactly once.
    await identity.set({ code: account.code, name: account.name })
    if (playerClient) {
      try {
        await playerClient.sync(account.code, merged.coins, merged.unlocks)
      } catch {
        // Offline: local is authoritative; the next coin/unlock change re-pushes.
      }
    }
    shell.setPlayer({ name: account.name, code: account.code })
    await refreshEconomy()
  }
  adoptInFlight = adoptInFlight.then(run, run)
  return adoptInFlight
}

function handleCreatePlayer(name: string): Promise<AccountActionResult> {
  if (!playerClient) return Promise.resolve({ ok: false, reason: 'network' })
  return playerClient
    .create(name)
    .then(async (created) => {
      // Seed the new account with whatever local (anonymous) progress exists.
      await adoptAccount({ ...created })
      return { ok: true as const, name: created.name }
    })
    .catch((): AccountActionResult => ({ ok: false, reason: 'network' }))
}

function handleRestorePlayer(code: string): Promise<AccountActionResult> {
  if (!playerClient) return Promise.resolve({ ok: false, reason: 'network' })
  const normalized = normalizeCode(code)
  if (!CODE_PATTERN.test(normalized)) {
    return Promise.resolve({ ok: false, reason: 'invalid' })
  }
  return playerClient
    .get(normalized)
    .then(async (account): Promise<AccountActionResult> => {
      if (!account) return { ok: false, reason: 'not-found' }
      await adoptAccount({
        name: account.name,
        code: account.code,
        coins: account.coins,
        unlocks: account.unlocks,
      })
      return { ok: true, name: account.name }
    })
    .catch((): AccountActionResult => ({ ok: false, reason: 'network' }))
}

function handleProfileOpen(): Promise<readonly PlayerScoreView[]> {
  const code = identity.code()
  if (!playerClient || !code) return Promise.resolve([])
  return playerClient
    .get(code)
    .then((account) =>
      account
        ? account.scores.map((s) => ({ modeId: s.modeId, score: s.score }))
        : [],
    )
    .catch(() => [])
}

function handlePurchase(itemId: string): void {
  void purchaseItem(storage, itemId).then((result) => {
    if (result.ok) {
      sound.play('purchase')
      void refreshEconomy()
    }
  })
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
  adapter: storage,
  modeId: MODE_ID,
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
  shopItems: shopItemViews(),
  onThemeSelect: (id) => {
    if (!isThemeUnlocked(id, unlocks)) return
    setTheme(id, true)
  },
  onPurchase: handlePurchase,
  onMuteToggle: toggleMute,
  onDirection: (dir) => input.pushTurn(dir),
  onTouchControlsToggle: toggleTouchControls,
  onPauseToggle: togglePause,
  onRestart: () => requestRestart(true),
  accountsEnabled,
  onCreatePlayer: handleCreatePlayer,
  onRestorePlayer: handleRestorePlayer,
  onProfileOpen: handleProfileOpen,
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
void refreshEconomy()

// Account boot gate: hydrate the stored player, then either pull their account
// (merging into local + refreshing) or, on very first run with accounts
// enabled and no player yet, show the one-time welcome. Best-effort — any
// failure leaves the game fully playable on local data.
if (accountsEnabled) {
  void identity.hydrate().then((player) => {
    if (player) {
      shell.setPlayer({ name: player.name, code: player.code })
      if (playerClient) {
        void playerClient
          .get(player.code)
          .then((account) => {
            if (account) return adoptAccount(account)
          })
          .catch(() => {
            /* offline: keep local; the sync decorator retries on next write */
          })
      }
    } else {
      shell.showWelcome()
    }
  })
}

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
    highScore: mode.kind === 'classic' ? highScore : undefined,
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
