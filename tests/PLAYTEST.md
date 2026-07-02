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

## 2. Difficulty curve

_Status: pending for level content/UI (Phase 5). The engine already supports
`speedMultiplier`, `wallsKill`, `wrapAround`, and `obstacles` as config flags,
but Phase 1 only exposes one fixed classic configuration — there is no level
selector yet. The one Phase 1 item below is checkable now; the rest stay
pending._

- [ ] Classic mode's fixed speed (`baseTicksPerSecond = 8`, `speedMultiplier = 1`) feels approachable and fair for a first-time player, and getting long enough to fill meaningful screen space doesn't feel unfairly fast
- [ ] Early levels feel approachable for a first-time player
- [ ] Speed increase per level (`speedMultiplier`) is noticeable but not a spike
- [ ] Obstacle density/layout increases difficulty gradually across levels
- [ ] `wallsKill` vs `wrapAround` modes both feel fair and clearly signposted to the player
- [ ] Apples-to-advance threshold feels neither too short (level flies by) nor too long (drags)
- [ ] No level is unintentionally impossible (soft-lock) or trivially easy compared to neighbors
- [ ] Difficulty ramp is comparable across grid sizes if grid size varies by level

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
