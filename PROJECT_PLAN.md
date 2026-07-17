# PROJECT_PLAN.md — Snake Game Roadmap

Web-first, installable PWA, built as a learning project. Each phase has a **definition of done (DoD)** — don't advance until it's met. Suggested agent owners are noted per phase.

**Scope note (current):** Nibble is offline-only and front-end-only — a static build on GitHub Pages with no backend. The coin economy + shop (old Phase 4) and the global leaderboard + accounts (old Phase 7) were **built and then removed** when the Supabase project behind them was retired; both are marked below and live on in git history. Themes are all unlocked from the start, and the only score kept is the player's on-device personal best per mode.

## Phase 0 — Foundations
Scaffold only, no gameplay.
- Vite + TypeScript + vite-plugin-pwa project.
- Folder structure per `CLAUDE.md`; empty stubs for `engine` / `render` / `themes` / `levels` / `data` / `ui`.
- Vitest wired up with one trivial passing test.
- **DoD:** `npm run dev` serves a blank canvas page; `npm run test` passes; tree matches `CLAUDE.md`.
- Owners: `ui-shell` (PWA/config), `persistence` (data stubs).

## Phase 1 — Classic MVP
- Fixed-tick game loop, grid, snake movement, growth, food, self/wall collision, score, game over.
- Deterministic engine (seeded RNG + injected time).
- Local high score.
- **DoD:** classic mode fully playable with keyboard; engine unit tests cover movement, growth, collision, and food-spawn safety.
- Owners: `game-engine`, `renderer-themes` (basic classic draw), `qa-tester`.

## Phase 2 — Polish core + PWA
- Keyboard + touch/swipe input, pause, responsive canvas.
- Full PWA: manifest, service worker, offline caching, installable from Chrome, maskable icons.
- Personal best per mode in IndexedDB. (A local top-10 leaderboard shipped here originally and was removed with the online features; the personal best is what remains.)
- **DoD:** installs and runs offline on desktop + mobile; the high score persists across sessions.
- Owners: `ui-shell`, `persistence`.

## Phase 3 — Theme system
- Theme architecture (data tokens + registry); classic theme + one richer theme.
- Theme-select UI.
- Introduce `art-pipeline` + Higgsfield for the richer theme's art.
- **DoD:** switching themes is a data swap; classic uses no image assets; no game logic touched.
- Owners: `renderer-themes`, `art-pipeline`, `ui-shell`.

## Phase 4 — Economy + shop — ~~shipped, then REMOVED~~
Coins, purchases, and the shop UI were built and later removed along with the backend; every theme is now free from the start. Kept here for history — see git log. **Do not rebuild without an explicit decision.**

## Phase 5 — Level mode + challenges
- `LevelConfig` schema + engine reading modifier flags.
- Obstacle system; modifiers: `speedMultiplier`, `wallsKill`, `wrapAround`, `obstacleSet`.
- A first set of balanced levels.
- **DoD:** level mode advances on apples-to-advance; challenges work purely via flags (no new engine branch per mode); balance principles from `CLAUDE.md` respected.
- Owners: `game-engine` (flag support), `level-designer` (content/balance), `qa-tester`.

## Phase 6 — Content + juice
- More themes/skins via Higgsfield, sound, small animations/particles, accessibility pass.
- **DoD:** at least 3 themes + several skins; feels responsive; passes the `tests/PLAYTEST.md` checklist.
- Owners: `art-pipeline`, `renderer-themes`, `ui-shell`.

## ~~Phase 7 (optional) — Global leaderboard~~ — shipped, then REMOVED
A Supabase-backed global board and code-based cross-device accounts were built, then removed when that project was retired. The game keeps only an on-device personal best. Kept here for history — see git log. **Do not rebuild without an explicit decision.**

## Phase 7 — Native app
- Wrap the finished PWA with Capacitor for iOS/Android; reuse the web code.
- **DoD:** builds and runs on a device/emulator from the same codebase.
- Owners: `ui-shell`.

## Working rules
- Kick off each phase in **plan mode**; finish each phase with a `reviewer` pass before committing.
- Never advance a phase with failing tests or game logic leaked into the renderer.
