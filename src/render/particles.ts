/**
 * Eat-particle bursts — a purely cosmetic, renderer-internal effect. Spawned
 * when a draw call observes `applesEaten` tick up between `prev` and `next`;
 * driven by a wall-clock timestamp used ONLY for animation timing (never for
 * any game decision). Decides nothing about scoring, growth, or collision —
 * it only reads the already-eaten food's last known cell to know where to
 * burst.
 */
import type { Vec2 } from '../engine'

/** One flying particle: origin + velocity (cells/ms) + spawn time. */
interface Particle {
  readonly originX: number
  readonly originY: number
  readonly vx: number
  readonly vy: number
  readonly color: string
  readonly spawnedAt: number
}

/** How long a burst particle lives, in ms. */
const PARTICLE_LIFETIME_MS = 400
/** Particles spawned per eaten apple. */
const PARTICLES_PER_BURST = 10
/** Particle speed range, in grid cells per ms (kept tiny — this is a subtle flourish). */
const MIN_SPEED = 0.0015
const MAX_SPEED = 0.004
/** Particle dot radius, as a fraction of one cell's rendered size. */
const PARTICLE_RADIUS_FRACTION = 0.06

/** Maps a (possibly fractional) grid-cell coordinate to a device-pixel point. */
export type CellToPixel = (cellX: number, cellY: number) => { readonly x: number; readonly y: number }

/** Mutable, renderer-instance-scoped burst state (never shared across renderers). */
export interface ParticleSystem {
  /** Spawn a burst of particles centered on `cell`, colored from `palette`. */
  spawnBurst(cell: Vec2, palette: readonly string[], now: number): void
  /** Draw and prune all live particles for the current frame's `now`. */
  draw(ctx: CanvasRenderingContext2D, now: number, cellSizePx: number, toPixel: CellToPixel): void
  /** Discard every live particle (used when reduced motion is preferred). */
  clear(): void
}

/** Create a fresh, empty particle system for one renderer instance. */
export function createParticleSystem(): ParticleSystem {
  let particles: Particle[] = []

  return {
    spawnBurst(cell, palette, now) {
      const colors = palette.length > 0 ? palette : ['#ffffff']
      const next: Particle[] = []
      for (let i = 0; i < PARTICLES_PER_BURST; i++) {
        const angle = (Math.PI * 2 * i) / PARTICLES_PER_BURST + (Math.random() - 0.5) * 0.4
        const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED)
        next.push({
          originX: cell.x + 0.5,
          originY: cell.y + 0.5,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: colors[i % colors.length],
          spawnedAt: now,
        })
      }
      particles = particles.concat(next)
    },

    draw(ctx, now, cellSizePx, toPixel) {
      if (particles.length === 0) return

      particles = particles.filter((particle) => now - particle.spawnedAt < PARTICLE_LIFETIME_MS)

      const radius = Math.max(0.5, cellSizePx * PARTICLE_RADIUS_FRACTION)

      for (const particle of particles) {
        const age = now - particle.spawnedAt
        const lifeFraction = Math.min(1, Math.max(0, age / PARTICLE_LIFETIME_MS))
        const cellX = particle.originX + particle.vx * age
        const cellY = particle.originY + particle.vy * age

        const point = toPixel(cellX, cellY)
        const alpha = 1 - lifeFraction

        ctx.globalAlpha = alpha
        ctx.fillStyle = particle.color
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },

    clear() {
      particles = []
    },
  }
}
