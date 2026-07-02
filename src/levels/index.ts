/**
 * Levels — data only. Each level or challenge is a config object: grid size,
 * obstacle layout, apples-to-advance, and modifier flags (speedMultiplier,
 * wallsKill, wrapAround). The engine READS these flags via
 * `levelToGameConfig`; it never hardcodes a mode.
 */
export type { LevelConfig } from './schema'
export { levelToGameConfig, validateLevel } from './schema'
export { LEVELS } from './levels'
