import {
  CLASSIC_CONFIG,
  applyTurn,
  createInitialState,
  step,
  ticksPerSecond,
  type Direction,
  type GameState,
} from './engine'
import { createRenderer } from './render'
import { classicTheme } from './themes'
import { createLocalAdapter } from './data'

const MODE_ID = 'classic'
const MAX_QUEUED_TURNS = 3
const MAX_FRAME_MS = 250

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('Canvas #game not found')

const renderer = createRenderer(canvas)
const storage = createLocalAdapter()

// Composition root: the engine forbids Math.random/Date.now inside update
// logic, so the one place a fresh seed may be drawn is here, at game creation.
function newGame(): GameState {
  const seed = (Math.random() * 0xffffffff) >>> 0
  return createInitialState({ ...CLASSIC_CONFIG, seed })
}

let highScore = 0
let prev: GameState | null = null
let state = newGame()
let inputQueue: Direction[] = []
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
}

function restart(): void {
  prev = null
  inputQueue = []
  accumulator = 0
  state = newGame()
}

window.addEventListener('keydown', (event) => {
  const dir = KEY_DIRECTIONS[event.code]
  if (dir) {
    event.preventDefault()
    const lastQueued = inputQueue[inputQueue.length - 1]
    if (lastQueued !== dir && inputQueue.length < MAX_QUEUED_TURNS) {
      inputQueue.push(dir)
    }
    return
  }
  if ((event.code === 'Enter' || event.code === 'Space') && state.status !== 'running') {
    event.preventDefault()
    restart()
  }
})

function frame(now: number): void {
  const tickMs = 1000 / ticksPerSecond(state.config)
  accumulator = Math.min(accumulator + (now - lastTime), MAX_FRAME_MS)
  lastTime = now

  while (accumulator >= tickMs && state.status === 'running') {
    const queued = inputQueue.shift()
    const turned = queued ? applyTurn(state, queued) : state
    prev = turned
    state = step(turned)
    if (state.status !== 'running') onRoundEnd(state)
    accumulator -= tickMs
  }

  const alpha = state.status === 'running' ? Math.min(accumulator / tickMs, 1) : 1
  renderer.draw(prev, state, alpha, classicTheme, { highScore })
  requestAnimationFrame(frame)
}

requestAnimationFrame((now) => {
  lastTime = now
  requestAnimationFrame(frame)
})
