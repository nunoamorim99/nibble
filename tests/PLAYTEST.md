# PLAYTEST.md — Manual Playtest Checklist

This is the manual companion to the automated Vitest suite. Automated tests
cover the pure engine (deterministic given a seeded RNG and injected time);
this checklist covers everything that only a human on a real device can
judge — feel, latency, difficulty pacing, visual/theme correctness, and
install/offline behavior.

**Status: Nibble is an offline-only, single-device game.** There is no
coin economy, no shop, no theme lock state, no leaderboard (local or
networked), no player accounts, and no network calls of any kind — the game
makes zero requests. The only score kept is the player's own personal best,
recorded **per mode** (Classic and Levels each keep their own best). Classic
mode, Levels mode, all 7 themes, the on-screen D-pad, sound, and the PWA
shell are all in scope below. Do not check anything off until the
corresponding feature has actually been played on the real build (dev server
or preview), not inferred from passing unit tests — unit tests prove the
engine's logic, not how the game feels or behaves end-to-end.

How to use this file: when a change lands, come back here, play the build on
real hardware (not just dev-server-on-desktop), and check off items
honestly. Add notes (device, browser, what felt off) next to any item that's
borderline. Leave items unchecked if untested or if behavior is
questionable — do not check a box "on faith."

---

## 1. Game feel & input latency

### Ready gate (round start)

- [ ] Opening the page shows a READY overlay with the snake holding still — the round does NOT run (or end) unattended before the first input
- [ ] The first arrow key / WASD press (or swipe/D-pad tap on mobile) starts the round AND steers the snake in that direction in one action
- [ ] After a restart, a mode switch, or advancing to the next level, the new round again waits at READY for the first turn input
- [ ] P/Escape and the Pause button do nothing while at READY (nothing to pause yet)

### Keyboard steering

- [ ] Arrow keys change direction with no perceptible lag between keypress and the snake visibly turning
- [ ] WASD changes direction with no perceptible lag
- [ ] Direction changes queued between ticks are applied on the very next tick, not dropped
- [ ] Rapid, repeated key presses don't desync the snake from visible input (no missed or double-applied turns)
- [ ] Holding a direction key doesn't repeat-fire extra turns via OS key-repeat
- [ ] Forbidden 180° reversal (e.g. pressing left while moving right) is silently ignored — does not crash, does not kill the snake, does not visibly stutter
- [ ] Queuing a legal turn opposite to an already-buffered turn (e.g. moving right, tapping up then down before the next tick) resolves the way it feels like it should to a player, not just the way the engine defines it as "legal"

### Touch & on-screen D-pad

- [ ] Swipe input changes direction with no perceptible lag on a touch device
- [ ] Enabling "TOUCH PAD" in the menu shows the on-screen D-pad, and each direction button steers immediately on tap
- [ ] Disabling "TOUCH PAD" hides the D-pad without breaking swipe input
- [ ] The D-pad and swipe input agree with keyboard behavior on the 180°-reversal guard (no reversal accepted from any input method)

### Movement & growth readability

- [ ] Snake movement is visually smooth at the target tick rate (no stutter/jank) at `baseTicksPerSecond = 8` (classic default)
- [ ] Growth on eating feels immediate and readable — the apple disappears and the snake visibly lengthens without a confusing delay
- [ ] The next food pellet appears somewhere clearly visible and never appears to spawn on/under the snake

### Pause

- [ ] The Pause button (or documented key) pauses the round; the snake stops ticking and does not silently keep moving in the background
- [ ] Resuming from pause doesn't lose or duplicate a tick, and doesn't consume the direction key press used to resume as a turn (unless that's the documented behavior)
- [ ] Pausing and resuming repeatedly never leaves the game in a stuck state

### Game over & restart flow

- [ ] Game-over moment (wall collision, in classic mode with `wallsKill`) is clearly telegraphed, not jarring or confusing
- [ ] Game-over moment (self collision) is clearly telegraphed, not jarring or confusing
- [ ] A game-over overlay/screen appears showing at least the final score
- [ ] The game-over overlay clearly indicates how to restart (button and/or a documented key)
- [ ] Restarting starts a brand-new session: score resets to 0, snake resets to the initial length-3 centered state, a fresh food cell appears
- [ ] Restarting quickly in succession (e.g. spamming the restart action) never leaves the game in a stuck or double-initialized state
- [ ] There is no way to keep controlling the snake or trigger a "turn" after game-over but before restart
- [ ] The control bar's "New Game" button restarts the current mode the same way the documented restart key does

### Personal best persistence (per mode)

- [ ] Beating the previous personal best updates the displayed best in the same session, for whichever mode is active
- [ ] The personal best is visible somewhere during play or at minimum on the game-over screen, in both Classic and Levels mode
- [ ] Reloading the page (hard refresh) preserves the personal best from the previous session, for both modes independently
- [ ] Closing and reopening the browser tab/window preserves the personal best
- [ ] A new session that does *not* beat the personal best leaves the stored best unchanged after reload
- [ ] Clearing site data (or first-ever load) starts the personal best at 0/empty rather than crashing or showing `undefined`/`NaN`
- [ ] Setting a new best in Levels mode does NOT overwrite or clobber the Classic best, and vice versa — play both modes in the same session, beat the best in only one, and confirm the other is untouched after reload
- [ ] The HUD shows the active mode's best while playing Levels mode (not just in Classic) — confirm the number shown matches Levels' own stored best, not Classic's
- [ ] A player with an existing pre-update (v1 schema) database still sees their old Classic high score correctly after loading the updated build — test with a browser profile that has actually played an older build, not a fresh profile (see PWA section for the upgrade-path note)

## 2. Difficulty curve & level mode

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

All 7 themes are unlocked and selectable from the start — there is no lock
state, no 🔒 marker, and no purchasing anywhere in the app. Play the real
build for all of the below — do not check anything off from reading code or
from `npm run test` passing.

### All themes render

- [ ] Every one of the 7 themes (classic, monoPlus, firstColor, coloredPixel,
      detailed-pixel, cartoon, neon) can be selected from the theme panel and
      renders the snake, food, and grid with no missing/undefined colors or
      blank sprites
- [ ] Every theme row in the panel is selectable on first load with no
      locked/disabled state — confirm on a completely fresh profile/site-data
      clear, not just a profile that's already "purchased" things from an
      older build
- [ ] Switching themes from the panel applies immediately (or with a clear,
      brief loading state while a spritesheet fetches) — no stale frame from
      the previous theme lingering
- [ ] No gameplay-affecting difference between any two themes — same speed,
      same collisions, same scoring regardless of which theme is active
      (cosmetic only, per CLAUDE.md)

### Sprite orientation (detailed-pixel, cartoon, neon)

- [ ] Steer the snake through an S-curve (e.g. right → up → right → down →
      right) on each of the 3 sprite themes and confirm: the head sprite
      faces the direction of travel, straight body segments use the
      horizontal/vertical part (not stretched or rotated wrong), and corner
      segments show the correct rounded-corner orientation matching the two
      cardinal directions the body actually bends between (no mirrored or
      upside-down corners)
- [ ] The tail segment's sprite orientation matches the direction from the
      tail cell toward the segment in front of it, and updates correctly as
      the snake grows and turns
- [ ] On a wrap-around level/mode played with a sprite theme, a segment that
      just wrapped across an edge still shows a continuous, correctly
      oriented sprite rather than a visibly wrong tile at the seam

### Background & readability (cartoon, neon)

- [ ] The Higgsfield scenic background image is visibly present behind the
      grid on cartoon and neon
- [ ] Despite the background, the grid/snake/food/obstacles stay clearly
      readable at a glance during real play — background never competes with
      or gets confused for gameplay elements at normal play speed
- [ ] Background image loads without a jarring pop-in/flash after the grid is
      already visible (loads before or fades in smoothly)

### Detailed-pixel crispness

- [ ] Detailed-pixel renders with hard, crisp pixel edges at every zoom/canvas
      size tested — no blurry/anti-aliased smoothing on the sprite art
      (confirms `pixelated: true` / `imageSmoothingEnabled = false` is
      actually taking effect on screen, not just in code)

### Eat particles

- [ ] With OS/browser reduced-motion OFF, eating an apple fires a small
      particle burst at the eaten cell in every theme, classic included
- [ ] With OS-level "reduce motion" turned ON before loading the page, eating
      an apple does **not** spawn any particle burst — confirm this on at
      least one theme, ideally both a token theme and a sprite theme
- [ ] Toggling the OS reduced-motion setting while the app is already open
      and reloading takes effect (particles stop/resume as expected after
      reload)
- [ ] Particle bursts never persist/pile up across many rapid eats (no growing
      pile of stale dots on screen after eating several apples quickly)

### Persistence & performance

- [ ] Theme choice persists across a hard reload and across closing/reopening
      the tab
- [ ] No performance regression (dropped frames / stutter) when switching
      from a token theme to a sprite theme, or between the two backgrounded
      themes (cartoon, neon)

## 4. PWA install & offline

- [ ] App is installable (browser shows install prompt / add-to-home-screen works)
- [ ] Installed app launches in standalone mode (no browser chrome)
- [ ] App icon and splash screen render correctly on the home screen
- [ ] Gameplay works fully offline after first load (service worker cache hit) — confirm with the network fully disabled (airplane mode or devtools offline), not just unplugged Wi-Fi with a captive portal
- [ ] The app makes zero network requests during normal play — check the network panel across a full session (menu, both modes, theme switching, game over) and confirm nothing is ever dispatched
- [ ] Returning online after an offline session doesn't lose local progress (personal bests, level progress, theme/sound settings)
- [ ] App updates (new service worker) prompt the user or apply cleanly without data loss
- [ ] Cold start time (installed, offline) is acceptable
- [ ] A profile that played an older build (IndexedDB schema v1, with the now-removed `leaderboard` object store) opens cleanly on this build: the upgrade runs once, the old store is gone, and the player's previous Classic high score is still there — see the version-history note in `src/data/local.ts` for exactly what should survive

### Mobile layout & touch (real device)

_Layout verified in emulation (portrait 390×844, landscape 844×390, narrow 360×740 — no overflow, canvas+bar always fit: see dev/mobile-shots.mjs); these need a real phone._

- [ ] Portrait: board + bar fully visible with no page scrolling; nothing hides behind browser chrome or the home-indicator area (safe-area padding works on a notched device)
- [ ] Landscape: board shrinks to fit beside/above the bar; menu and panels scroll from the top instead of clipping
- [ ] Swipes steer reliably during play and never trigger pull-to-refresh or page scroll
- [ ] All bar/menu buttons are comfortably tappable one-handed (≥44px targets); no double-tap zoom delay
- [ ] Rotating the device mid-game keeps the board square and playable

## 5. Sound & accessibility

Play the real build with an actual keyboard and, where possible, a screen
reader — do not check anything off from reading code.

### Sound

- [ ] Eating an apple plays a short, distinct rising blip, audibly different
      from the other two effects
- [ ] Dying (wall/self/obstacle, any mode) plays the descending
      game-over tone
- [ ] Clearing a level (or Classic-equivalent win state, if applicable) plays
      the ascending level-clear jingle, audibly different from game-over
- [ ] Rapidly eating several apples in quick succession does not spam/overlap
      the eat sound into a garbled mess (debounce feels natural, not
      sluggish)
- [ ] Toggling the mute button silences all three effects immediately; a
      sound already mid-play when muted is allowed to finish but no new
      sound starts
- [ ] Un-muting restores sound on the very next triggering event, no reload
      needed
- [ ] Mute state persists across a hard reload and across closing/reopening
      the tab (survives exactly like theme choice/personal best do)
- [ ] First-ever load (no prior mute preference saved) defaults to a
      sensible state (unmuted) rather than crashing or showing an
      indeterminate mute-button state
- [ ] No sound plays before any user gesture has occurred (browsers block
      autoplay) and the game does not error/hang waiting for one

### Panels: focus, keyboard, and Escape behavior

- [ ] Opening any overlay panel (mode select, theme select — whichever exist
      in the build) moves keyboard focus into the panel, not left behind on
      the page underneath
- [ ] Pressing Tab repeatedly inside an open panel cycles only through that
      panel's focusable elements — focus never escapes to page content behind
      the panel (Shift+Tab from the first element wraps to the last, and vice
      versa)
- [ ] Pressing Escape while a panel is open closes it
- [ ] Pressing Escape to close a panel does **not** also pause the game
      running behind it — confirm the snake keeps moving/ticking at normal
      speed the instant the panel closes, it was never paused by the same
      Escape press (this is the one most likely to regress silently since
      Escape is overloaded for both "close panel" and "pause game" at the
      page level)
- [ ] Closing a panel (via Escape, a close button, or clicking outside, per
      whichever are wired up) returns keyboard focus to whichever button
      originally opened it, not to the top of the page or nowhere
- [ ] Every interactive control inside every panel (buttons, theme rows, mode
      rows, mute toggle, close button) is reachable via Tab alone, with no
      mouse, and each shows a visible focus indicator
- [ ] Activating a focused control with Enter or Space works the same as
      clicking it, for every button type in every panel

### Live announcements & screen reader basics

- [ ] With a screen reader running, the level-info label's change (entering
      a new level, or switching Classic ↔ Levels) is announced
      automatically, without needing to manually re-focus it
      (`aria-live="polite"` on the level-info label is actually firing, not
      just present in markup)
- [ ] Each open panel is announced as a dialog with a meaningful name
      (reads out the panel's title, not "dialog" alone or a blank name)
- [ ] Every theme row is announced identically as a normal, selectable option
      (no locked/disabled state ever announced, since none exists)
- [ ] No panel or control produces a screen-reader announcement that is
      misleading, duplicated on every keystroke, or completely silent when it
      shouldn't be

---

## Notes template (copy per playtest session)

```
Date:
Build/commit:
Device + browser:
Section(s) tested:
Findings:
```
