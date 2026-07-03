/**
 * Input controller — the ONLY place raw DOM input (keyboard, touch) is
 * handled. Turns are buffered as abstract `Direction` values and dequeued
 * one at a time by the fixed-tick loop via `takeTurn()`; pause/restart are
 * forwarded as callbacks. Nothing here reaches into engine internals, and no
 * key code or touch event ever crosses into `src/engine`.
 *
 * No DOM leaks outward either: callers get back a small controller with
 * `takeTurn()`, `pushTurn()`, and `dispose()`, nothing else. `pushTurn()` is
 * the same abstract-Direction entry point used by on-screen controls (e.g.
 * the shell's D-pad) — it shares the keyboard/swipe queue, dedupe, and cap.
 */
import type { Direction } from '../engine'

const MAX_QUEUED_TURNS = 3
const SWIPE_THRESHOLD_PX = 24

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

export interface InputController {
  /** Dequeue ONE buffered turn. The loop calls this once per tick. */
  takeTurn(): Direction | undefined
  /** Inject an abstract turn from on-screen controls (e.g. the D-pad); same dedupe + queue cap as keyboard/swipe turns. */
  pushTurn(dir: Direction): void
  /** Remove all listeners this controller attached. */
  dispose(): void
}

export function createInputController(opts: {
  swipeTarget: HTMLElement
  onPauseToggle(): void
  onRestart(): void
}): InputController {
  const { swipeTarget, onPauseToggle, onRestart } = opts

  let queue: Direction[] = []
  let touchStartX = 0
  let touchStartY = 0
  let touchActive = false

  function enqueue(dir: Direction): void {
    const last = queue[queue.length - 1]
    if (last === dir) return
    if (queue.length >= MAX_QUEUED_TURNS) return
    queue.push(dir)
  }

  function onKeyDown(event: KeyboardEvent): void {
    const dir = KEY_DIRECTIONS[event.code]
    if (dir) {
      event.preventDefault()
      enqueue(dir)
      return
    }
    if (event.code === 'KeyP' || event.code === 'Escape') {
      event.preventDefault()
      onPauseToggle()
      return
    }
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault()
      onRestart()
    }
  }

  function onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0]
    if (!touch) return
    touchActive = true
    touchStartX = touch.clientX
    touchStartY = touch.clientY
  }

  function onTouchEnd(event: TouchEvent): void {
    if (!touchActive) return
    touchActive = false
    event.preventDefault()

    const touch = event.changedTouches[0]
    if (!touch) return

    const dx = touch.clientX - touchStartX
    const dy = touch.clientY - touchStartY
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)

    if (absX < SWIPE_THRESHOLD_PX && absY < SWIPE_THRESHOLD_PX) {
      onRestart()
      return
    }

    if (absX > absY) {
      enqueue(dx > 0 ? 'right' : 'left')
    } else {
      enqueue(dy > 0 ? 'down' : 'up')
    }
  }

  function onTouchMove(event: TouchEvent): void {
    if (touchActive) event.preventDefault()
  }

  window.addEventListener('keydown', onKeyDown)
  swipeTarget.addEventListener('touchstart', onTouchStart, { passive: false })
  swipeTarget.addEventListener('touchmove', onTouchMove, { passive: false })
  swipeTarget.addEventListener('touchend', onTouchEnd, { passive: false })

  return {
    takeTurn() {
      return queue.shift()
    },
    pushTurn(dir) {
      enqueue(dir)
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      swipeTarget.removeEventListener('touchstart', onTouchStart)
      swipeTarget.removeEventListener('touchmove', onTouchMove)
      swipeTarget.removeEventListener('touchend', onTouchEnd)
      queue = []
    },
  }
}
