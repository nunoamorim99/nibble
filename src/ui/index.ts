/**
 * UI layer contract.
 *
 * Owns: menus, mode/theme select, settings screens, screen routing, and the
 * PWA shell (app shell + canvas host).
 *
 * Nibble is offline-only and single-device. This layer talks to the engine
 * only via clean start/stop/pause/read-state interfaces — never reaches into
 * engine internals. In-game input is forwarded to the engine as abstract
 * commands (up/down/left/right/pause), never raw key/touch events. It holds
 * no reference to persistence at all: `main.ts` owns reading/writing via the
 * `src/data` adapter and pushes display state into the shell as plain data.
 */
export { createInputController } from './input'
export type { InputController } from './input'

export { createUiShell } from './shell'
export type { ModeOption, PadDirection, ThemeOption, UiShell } from './shell'

export { createSoundPlayer } from './sound'
export type { SoundEffect, SoundPlayer } from './sound'
