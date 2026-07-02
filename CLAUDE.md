# CLAUDE.md — Snake Game

Project memory and working rules for this repository. Read this fully before making any change.

## What we're building

A Nokia-style Snake game for the web, installable as a PWA, built as a learning project to understand game-loop and game-state logic from scratch. Later phases add a level mode, selectable themes, a cosmetic economy (coins → skins/themes), and eventually a native wrapper. See `PROJECT_PLAN.md` for the phased roadmap.

## Tech stack

- Language: **TypeScript**
- Build/dev server: **Vite**
- Rendering: **HTML5 Canvas** (2D context)
- PWA: **vite-plugin-pwa** (Workbox service worker + web manifest)
- Persistence: **IndexedDB**, behind a thin adapter
- Tests: **Vitest** (unit tests target the pure engine)
- Art (Phase 3+): snake skins and food sprites are **code-generated spritesheets** (TypeScript + `sharp`, with SVG as the source for detailed art) — Claude Code owns the whole pipeline, no image model. **Higgsfield** is used only for scenic **backgrounds** on illustrated themes. Classic and early themes use no image assets at all. See `docs/THEMES.md`.

Node 20+ recommended.

## Architecture — five decoupled layers

The whole feature set (modes, themes, skins, levels, economy) stays manageable only because these layers do not reach into each other's internals. **This is the most important rule in the repo.**

1. **Engine** (`src/engine/`) — PURE game logic: grid, snake, tick/update, collision, food, scoring, and the mode/level rule engine. No canvas, no DOM, no `window`, no `document`. No `Date.now()` or `Math.random()` buried inside update logic — inject time and a seedable RNG so updates are deterministic and testable. Given `(state, input, config)`, `update` returns the next state. This is the part being learned; keep it small and testable.
2. **Renderer** (`src/render/`) — reads immutable engine state + the active theme and draws to the canvas. Contains **zero** game rules. If a rule lives in the renderer, it's a bug.
3. **Themes** (`src/themes/`) — data only. A theme = tokens (grid colors, snake-skin sprite refs, food/coin sprites, background, cell style, optional sounds). Swapping a theme is swapping a data object.
4. **Content / levels** (`src/levels/`) — data only. Each level or challenge is a config object: grid size, obstacle layout, apples-to-advance, and modifier flags (`speedMultiplier`, `wallsKill`, `wrapAround`, `obstacleSet`). The engine READS these flags; it never hardcodes a mode.
5. **Persistence & economy** (`src/data/`) — IndexedDB behind one adapter interface. High scores, coin balance, unlocked cosmetics, leaderboard. Swappable for a remote backend later without touching the game.

Dependency direction points inward: `render → engine` (read-only), `ui → engine + data`, `data → nothing game-specific`. **The engine depends on nothing above it.**

## Target folder structure

```
snake-game/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ CLAUDE.md
├─ PROJECT_PLAN.md
├─ .claude/
│  └─ agents/            # the 8 project subagents
├─ public/
│  ├─ manifest.webmanifest
│  └─ icons/
├─ src/
│  ├─ main.ts
│  ├─ engine/            # PURE logic — grid, snake, state, collision, food, modes
│  ├─ render/            # canvas rendering only
│  ├─ themes/            # theme data + registry
│  ├─ levels/            # level/challenge config + schema
│  ├─ data/              # IndexedDB adapter, scores, economy config, leaderboard adapter
│  └─ ui/                # menus, mode/theme select, shop, leaderboard, settings
├─ assets/
│  └─ sprites/           # generated art per theme (Phase 3+)
└─ tests/
   └─ engine/            # Vitest unit tests + PLAYTEST.md
```

## Core conventions

- **Grid**: integer cells `{ x, y }`, origin top-left. Directions are unit vectors; forbid instant 180° reversals.
- **Tick**: one fixed logical tick advances state; the renderer may interpolate between ticks but state is the source of truth. Speed = base ticks/sec × `level.speedMultiplier`.
- **Modes & challenges** are modifier flags in level config, never `if (mode === ...)` branches in the engine.
- **Food spawn** must never land on the snake or an obstacle. Use the injected RNG.
- **Economy** numbers (points-per-coin, item prices, spawn rates) live in `src/data/economy.config.ts`. Baseline: points → coins conversion. **Unlocks are cosmetic only — never gameplay advantages.**
- **Persistence** always goes through the single adapter interface.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm run preview` — preview the built PWA
- `npm run test` — Vitest

## Agents (in `.claude/agents/`)

| Agent | Use it for |
|---|---|
| `game-engine` | Core logic: loop, movement, collision, food, mode/level rule engine |
| `renderer-themes` | Canvas drawing + theme system (tokens, sprites, animation) |
| `ui-shell` | Menus, shop, leaderboard/settings screens, routing, PWA shell |
| `persistence-economy` | IndexedDB, high scores, coins, unlocks, leaderboard adapter |
| `level-designer` | Level/challenge config data + difficulty balance |
| `art-pipeline` | Generate + process art via Higgsfield MCP for richer themes |
| `qa-tester` | Write/run engine unit tests; maintain playtest checklist |
| `reviewer` | Read-only architecture review before commits |

Prefer starting a phase in plan mode and finishing with a `reviewer` pass.

## Definition of done (every change)

- Engine changes ship with matching unit tests.
- No game logic leaked into the renderer.
- A new theme or level is **data added**, engine untouched.
- Persistence stays behind the adapter.
- `reviewer` run before committing structural changes.
