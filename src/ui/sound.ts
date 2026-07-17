/**
 * Sound module — pure WebAudio synthesis, no audio assets. Produces three
 * short Nokia-ish square/triangle blips: eat, gameover, levelclear.
 *
 * Lazy `AudioContext`: created (and resumed) on first `play()` after a user
 * gesture has occurred. If the browser keeps the context suspended (no
 * gesture yet, or autoplay policy), `play()` silently does nothing — it
 * never throws. Callers (main.ts) own whether sound is muted and whether to
 * persist that preference; this module only knows how to make noise or stay
 * quiet.
 */

export type SoundEffect = 'eat' | 'gameover' | 'levelclear'

export interface SoundPlayer {
  /** Play one effect. No-op while muted, while the context is unavailable/suspended, or (for 'eat') within the debounce window. */
  play(effect: SoundEffect): void
  /** Mute/unmute. Does not stop a tone already scheduled, but blocks future play() calls. */
  setMuted(muted: boolean): void
  /** Current mute state. */
  isMuted(): boolean
  /** Close the AudioContext and release resources. Safe to call even if never played. */
  dispose(): void
}

/** Overall output gain — kept quiet by design. */
const MASTER_GAIN = 0.08
/** Ignore repeated 'eat' triggers within this window (ms) so rapid ticks don't spam. */
const EAT_DEBOUNCE_MS = 40

/** A single scheduled tone: frequency, wave shape, start offset, duration. */
interface ToneStep {
  readonly freq: number
  readonly type: OscillatorType
  readonly startOffset: number
  readonly duration: number
}

/** Nokia-ish blip recipes per effect, expressed as tone steps relative to play() time. */
const EFFECTS: Record<SoundEffect, readonly ToneStep[]> = {
  // Short rising blip, ~60ms.
  eat: [{ freq: 660, type: 'square', startOffset: 0, duration: 0.06 }],

  // Three descending tones.
  gameover: [
    { freq: 392, type: 'triangle', startOffset: 0, duration: 0.14 },
    { freq: 330, type: 'triangle', startOffset: 0.14, duration: 0.14 },
    { freq: 262, type: 'triangle', startOffset: 0.28, duration: 0.2 },
  ],

  // Quick 4-note ascending jingle.
  levelclear: [
    { freq: 523, type: 'square', startOffset: 0, duration: 0.09 },
    { freq: 659, type: 'square', startOffset: 0.09, duration: 0.09 },
    { freq: 784, type: 'square', startOffset: 0.18, duration: 0.09 },
    { freq: 1047, type: 'square', startOffset: 0.27, duration: 0.14 },
  ],
}

export function createSoundPlayer(): SoundPlayer {
  let ctx: AudioContext | null = null
  let muted = false
  let disposed = false
  let lastEatAt = -Infinity

  function ensureContext(): AudioContext | null {
    if (disposed) return null
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      try {
        ctx = new Ctor()
      } catch {
        return null
      }
    }
    if (ctx.state === 'suspended') {
      // Must follow a user gesture; if the browser refuses, stay silent.
      void ctx.resume().catch(() => {
        /* ignore — will retry resume on next play() */
      })
    }
    return ctx
  }

  function scheduleTone(context: AudioContext, step: ToneStep, startAt: number): void {
    const oscillator = context.createOscillator()
    oscillator.type = step.type
    oscillator.frequency.value = step.freq

    const gainNode = context.createGain()
    const toneStart = startAt + step.startOffset
    const toneEnd = toneStart + step.duration

    // Quick attack, quick release to avoid clicks; hold near MASTER_GAIN.
    gainNode.gain.setValueAtTime(0, toneStart)
    gainNode.gain.linearRampToValueAtTime(MASTER_GAIN, toneStart + Math.min(0.01, step.duration / 4))
    gainNode.gain.setValueAtTime(MASTER_GAIN, Math.max(toneStart, toneEnd - Math.min(0.015, step.duration / 4)))
    gainNode.gain.linearRampToValueAtTime(0, toneEnd)

    oscillator.connect(gainNode)
    gainNode.connect(context.destination)

    oscillator.start(toneStart)
    oscillator.stop(toneEnd + 0.02)
  }

  return {
    play(effect) {
      if (disposed || muted) return

      if (effect === 'eat') {
        const now = performance.now()
        if (now - lastEatAt < EAT_DEBOUNCE_MS) return
        lastEatAt = now
      }

      const context = ensureContext()
      if (!context || context.state !== 'running') return

      const startAt = context.currentTime
      for (const step of EFFECTS[effect]) {
        scheduleTone(context, step, startAt)
      }
    },

    setMuted(next) {
      muted = next
    },

    isMuted() {
      return muted
    },

    dispose() {
      if (disposed) return
      disposed = true
      if (ctx) {
        void ctx.close().catch(() => {
          /* already closed or closing — ignore */
        })
        ctx = null
      }
    },
  }
}
