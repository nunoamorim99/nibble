/**
 * UI layer contract.
 *
 * Owns: menus, mode/theme select, shop, leaderboard/settings screens,
 * screen routing, and the PWA shell (app shell + canvas host).
 *
 * Talks to the engine only via clean start/stop/pause/read-state
 * interfaces — never reaches into engine internals. In-game input is
 * forwarded to the engine as abstract commands (up/down/left/right/pause),
 * never raw key/touch events. Talks to persistence and the economy only
 * via the `src/data` adapter — never touches storage directly.
 */
export { createInputController } from './input'
export type { InputController } from './input'

export { createUiShell } from './shell'
export type { ModeOption, PadDirection, ShopItemView, ThemeOption, UiShell } from './shell'

export { createSoundPlayer } from './sound'
export type { SoundEffect, SoundPlayer } from './sound'
