# PLAYTEST.md — Manual Playtest Checklist

This is the manual companion to the automated Vitest suite. Automated tests
cover the pure engine (deterministic given a seeded RNG and injected time);
this checklist covers everything that only a human on a real device can
judge — feel, latency, difficulty pacing, visual/theme correctness, and
install/offline behavior.

**Status: Phase 1 (Classic MVP) in progress.** The pure engine (`src/engine/`)
now exists and has automated coverage (movement, growth, 180° reversal guard,
self/wall/obstacle collision, food spawn safety, win conditions). The
renderer, keyboard input wiring, and `main.ts` game loop are landing next —
once they do, classic mode becomes playable end-to-end for the first time.
Themes, levels/challenges, and the PWA shell (sections 2–4 below) are still
out of scope until their respective phases. Do not check anything off until
the corresponding feature actually exists and has been played on the real
build (dev server or preview), not inferred from passing unit tests — unit
tests prove the engine's logic, not how the game feels or behaves end-to-end.

How to use this file: when a phase adds playable functionality, come back
here, play the build on real hardware (not just dev-server-on-desktop), and
check off items honestly. Add notes (device, browser, what felt off) next to
any item that's borderline. Leave items unchecked if untested or if behavior
is questionable — do not check a box "on faith."

---

## 1. Game feel & input latency

_Status: Phase 1 target — classic mode (keyboard only) once the renderer and
`main.ts` loop land. Touch/swipe and pause are Phase 2; leave those items
unchecked until then._

### Keyboard steering

- [ ] Arrow keys change direction with no perceptible lag between keypress and the snake visibly turning
- [ ] WASD changes direction with no perceptible lag (if wired up alongside arrow keys)
- [ ] Direction changes queued between ticks are applied on the very next tick, not dropped
- [ ] Rapid, repeated key presses don't desync the snake from visible input (no missed or double-applied turns)
- [ ] Holding a direction key doesn't repeat-fire extra turns via OS key-repeat
- [ ] Forbidden 180° reversal (e.g. pressing left while moving right) is silently ignored — does not crash, does not kill the snake, does not visibly stutter
- [ ] Queuing a legal turn opposite to an already-buffered turn (e.g. moving right, tapping up then down before the next tick) resolves the way it feels like it should to a player, not just the way the engine defines it as "legal"
- [ ] Touch/swipe input (mobile) — **not in scope for Phase 1**, confirm it is simply absent/inert rather than half-wired or crashing on mobile browsers

### Movement & growth readability

- [ ] Snake movement is visually smooth at the target tick rate (no stutter/jank) at `baseTicksPerSecond = 8` (classic default)
- [ ] Growth on eating feels immediate and readable — the apple disappears and the snake visibly lengthens without a confusing delay
- [ ] The next food pellet appears somewhere clearly visible and never appears to spawn on/under the snake

### Game over & restart flow

- [ ] Game-over moment (wall collision, in classic mode) is clearly telegraphed, not jarring or confusing
- [ ] Game-over moment (self collision) is clearly telegraphed, not jarring or confusing
- [ ] A game-over overlay/screen appears showing at least the final score
- [ ] The game-over overlay clearly indicates how to restart (button and/or a documented key)
- [ ] Restarting starts a brand-new session: score resets to 0, snake resets to the initial length-3 centered state, a fresh food cell appears
- [ ] Restarting quickly in succession (e.g. spamming the restart action) never leaves the game in a stuck or double-initialized state
- [ ] There is no way to keep controlling the snake or trigger a "turn" after game-over but before restart

### High score persistence

- [ ] Beating the previous high score updates the displayed high score in the same session
- [ ] The high score is visible somewhere during play or at minimum on the game-over screen
- [ ] Reloading the page (hard refresh) preserves the high score from the previous session
- [ ] Closing and reopening the browser tab/window preserves the high score
- [ ] A new session that does *not* beat the high score leaves the stored high score unchanged after reload
- [ ] Clearing site data (or first-ever load) starts high score at 0/empty rather than crashing or showing `undefined`/`NaN`

### Deferred to Phase 2

- [ ] Touch/swipe input (mobile) changes direction with no perceptible lag (superseded by the "not in scope" check above once Phase 2 lands touch support)
- [ ] Pause/resume doesn't lose or duplicate a tick

## 2. Difficulty curve & level mode

_Status: Phase 5 (level mode + challenges) has landed — `src/levels/` now
supplies 8 configs (`LEVELS`, all 20×20) via `levelToGameConfig`, and
`main.ts`/the UI mode panel switch between Classic and Levels, track
highest-unlocked progress, and drive the LEVEL CLEAR / retry / advance flow.
Automated tests (`tests/levels/levels.test.ts`) already prove the level data
validates, the difficulty curve is non-decreasing, and the engine integration
(spawn safety, `applesToAdvance` win) works through the level pipeline — this
section is for everything only a human playing the real build can judge:
feel, pacing, and that the UI wiring in `main.ts`/`ui/shell.ts` actually does
what the HUD claims._

### Mode switching & progression

- [ ] Selecting "Levels" from the mode panel restarts into Level 1 on a first-ever play (no saved progress)
- [ ] Selecting "Levels" after having cleared some levels restarts into the highest unlocked level, not always Level 1
- [ ] Switching from Levels back to Classic restarts into a normal endless classic session (no level label, no apple target shown)
- [ ] Switching mode mid-round (while a level is running) cleanly discards the in-progress round rather than corrupting state — no leftover snake/food from the previous mode flashes on screen
- [ ] The mode panel visibly reflects which mode is currently active (Classic vs Levels highlighted/labeled correctly) after every switch

### In-round HUD

- [ ] While a level is running, the level-info label reads `LV <n>/8` in the control bar and the on-canvas HUD shows `LEVEL <n>  APPLES <eaten>/<target>`, matching the level actually loaded
- [ ] The apples-eaten counter increments by exactly 1 per apple eaten, in real time, never skipping or double-counting
- [ ] The apple target shown matches the level's configured `applesToAdvance` (Level 1 = 5 apples through Level 8 = 14, per `src/levels/levels.ts`)
- [ ] No level label/apple counter is shown at all while in Classic mode

### Level clear / game over / retry flow

- [ ] Reaching the apple target shows a "LEVEL `<n>` CLEAR" overlay (for levels 1–7) with a hint to press Enter for the next level
- [ ] Pressing Enter (or the documented restart action) after LEVEL CLEAR advances into the next level with a fresh snake/food, not a replay of the cleared level
- [ ] Dying mid-level (wall/self/obstacle, depending on the level's flags) shows a game-over state with a "press Enter to retry" hint, and Enter restarts the **same** level (not the next one, not Level 1) with the apple counter reset to 0
- [ ] Retrying after a death does not silently carry over the previous attempt's score/apple progress into the new attempt
- [ ] Rapidly pressing Enter at the LEVEL CLEAR / game-over screen never double-advances a level or leaves the game in a stuck/uninitialized state

### Progress persistence

- [ ] Clearing a level, then reloading the page (hard refresh), keeps the previously-unlocked highest level available when re-entering Levels mode (does not reset back to Level 1)
- [ ] The selected mode (Classic vs Levels) itself also survives a reload, matching whichever was active when the page was last closed
- [ ] First-ever load with no prior save starts level progress at Level 1 rather than crashing or showing an undefined level

### Wrap levels (L3 "Around the Edge", L6 "Cluttered Loop")

- [ ] On Level 3 and Level 6, running the snake off any of the four edges re-enters from the opposite edge instead of ending the game — verify all four directions (up/down/left/right), not just one
- [ ] Wrapping feels readable — the player can tell at a glance the snake reappeared on the opposite side rather than the screen just "glitching"
- [ ] On wrap levels, obstacle collision still kills normally after a wrap-in (wrapping does not grant a free pass through an obstacle sitting at the entry edge)
- [ ] Self-collision still applies correctly immediately after a wrap-in (a long snake can still die to its own body right after re-entering)
- [ ] Non-wrap levels (1, 2, 4, 5, 7, 8) do NOT wrap — running into any edge ends the round there, confirming `wallsKill`/`wrapAround` aren't accidentally swapped for those levels

### Final level & overall curve

- [ ] Clearing Level 8 ("Full Plate") shows an "ALL LEVELS CLEAR" overlay (distinct from the normal "LEVEL 8 CLEAR" wording), with a hint to press Enter to replay
- [ ] Pressing Enter after ALL LEVELS CLEAR restarts Level 8 for replay (there is no Level 9) rather than erroring or freezing
- [ ] Classic mode's fixed speed (`baseTicksPerSecond = 8`, `speedMultiplier = 1`) feels approachable and fair for a first-time player, and getting long enough to fill meaningful screen space doesn't feel unfairly fast
- [ ] Early levels (1–2) feel approachable for a first-time player; obstacles in Level 2 (corner pillars) are easy to avoid on a first attempt
- [ ] Speed increase per level (`speedMultiplier`, 1.0 → 1.5 across the set) is noticeable level-to-level but never feels like a sudden spike
- [ ] Obstacle density/layout increases difficulty gradually across levels 2 → 8 (pillars → cross → ring-with-gaps → lanes → clutter → maze → dense plate)
- [ ] `wallsKill` vs `wrapAround` levels both feel fair and are clearly signposted to the player (e.g. HUD or level name hints at the wrap behavior before it matters)
- [ ] Each level's apples-to-advance threshold (5 through 14) feels neither too short (level flies by) nor too long (drags) at that level's speed
- [ ] No level is unintentionally impossible (soft-lock) or trivially easy compared to its immediate neighbors
- [ ] Difficulty ramp feels consistent given all 8 levels share the same 20×20 grid (no grid-size variable to account for in this level set)

## 3. Theme switching

_Status: pending — no theme system or renderer yet._

- [ ] Switching themes from the menu applies immediately (or with a clear loading state)
- [ ] No gameplay-affecting difference between themes (cosmetic only, per CLAUDE.md)
- [ ] Classic (code-drawn) theme renders correctly with no missing colors/tokens
- [ ] Illustrated/sprite-based themes (Phase 3+) load without visible pop-in or flicker
- [ ] Theme choice persists across app restarts
- [ ] Contrast/readability of snake vs. food vs. background holds up in every theme
- [ ] No performance regression (dropped frames) when switching to a heavier theme

## 4. PWA install & offline

_Status: pending — no manifest, service worker, or offline caching yet._

- [ ] App is installable (browser shows install prompt / add-to-home-screen works)
- [ ] Installed app launches in standalone mode (no browser chrome)
- [ ] App icon and splash screen render correctly on the home screen
- [ ] Gameplay works fully offline after first load (service worker cache hit)
- [ ] Returning online after an offline session doesn't lose local progress (scores/coins)
- [ ] App updates (new service worker) prompt the user or apply cleanly without data loss
- [ ] Cold start time (installed, offline) is acceptable

---

## Notes template (copy per playtest session)

```
Date:
Build/commit:
Device + browser:
Section(s) tested:
Findings:
```
