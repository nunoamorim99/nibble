/**
 * Renderer — reads immutable engine state plus the active theme and draws to
 * the canvas. Contains ZERO game rules; it may interpolate between ticks, but
 * engine state is the single source of truth.
 */

export type { Renderer, Hud } from './renderer'
export { createRenderer } from './renderer'
