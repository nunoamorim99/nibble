/**
 * UI shell — the DOM chrome around the canvas: a control bar (mode,
 * pause/resume, leaderboard, themes, shop, sound, new game, coin counter,
 * level-info label), a mode panel, a themes panel, a shop panel, a
 * leaderboard overlay, and a score-submission dialog shown on game over.
 * Built entirely with `document.createElement` calls appended under
 * `#ui-root`; `index.html` stays declarative-minimal.
 *
 * Talks to persistence ONLY through the injected `PersistenceAdapter` — no
 * direct storage access, no engine imports beyond types re-exported from
 * `src/engine` elsewhere in this layer. Pause/restart/mode-select/theme-select
 * /purchase/mute-toggle are forwarded as abstract callbacks; this module
 * never touches engine, level, theme-registry, economy, or audio internals
 * itself — `ModeOption`, `ThemeOption`, and `ShopItemView` are plain display
 * data owned by this layer, and the sound button only reports clicks: the
 * caller (main.ts) owns the actual `SoundPlayer` and any persisted mute
 * preference. The shell knows nothing about what a mode *means* (level
 * config, rules, engine wiring) — it only renders the option list and
 * reports the selected id upward; the caller owns starting/restarting games.
 * The shell decides nothing about affordability, ownership, or unlocks
 * either: it renders exactly the data it is given (via constructor opts or
 * `updateThemes` / `updateShop` / `setCoins` / `setActiveMode` /
 * `setLevelInfo` / `setMuted`) and reports clicks upward.
 *
 * Accessibility: every button carries an `aria-label`; every overlay panel
 * is a `role="dialog"` with `aria-modal="true"` and `aria-labelledby`
 * pointing at its title. Opening a panel moves focus into it and traps Tab
 * within it; Escape closes the panel (and stops the keydown from bubbling
 * to the page-level pause handler in `input.ts`); closing restores focus to
 * the control-bar button that opened it. The coin counter and level-info
 * label are `aria-live="polite"` so balance/level changes are announced.
 */
import type { PersistenceAdapter } from '../data'

const STYLE_ELEMENT_ID = 'nibble-ui-style'
const DEFAULT_INITIALS = 'AAA'
const LOCK_MARKER = '\u{1F512}'
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Remembers the last-used initials for the lifetime of the module/session. */
let lastInitials = DEFAULT_INITIALS

/** Display-only mode entry for the mode-select panel. Opaque id to this layer. */
export interface ModeOption {
  readonly id: string
  readonly name: string
}

/** Display-only theme entry for the theme-select panel; ladder order. */
export interface ThemeOption {
  readonly id: string
  readonly name: string
  /** When true, render with a lock marker; clicking the row does NOT call onThemeSelect. */
  readonly locked?: boolean
}

/** Display-only shop entry for the shop panel. */
export interface ShopItemView {
  readonly id: string
  readonly name: string
  readonly price: number
  readonly owned: boolean
}

export interface UiShell {
  /** Reflect paused/running state on the pause button label. */
  setPaused(paused: boolean): void
  /** Reflect the active selection in the themes panel (updates the marked row / stored id even while closed). */
  setActiveTheme(id: string): void
  /** Reflect the active selection in the mode panel and the bar button label. */
  setActiveMode(id: string): void
  /** Set/replace the small non-interactive level-info bar label (e.g. "LV 3/8"); null hides it. */
  setLevelInfo(text: string | null): void
  /** Update the coin counter in the control bar. */
  setCoins(balance: number): void
  /** Reflect mute state on the sound button (e.g. "SOUND: ON/OFF"). Caller owns the SoundPlayer + persistence. */
  setMuted(muted: boolean): void
  /** Replace the theme list; re-renders rows (open or not) and preserves the active marker. */
  updateThemes(themes: readonly ThemeOption[]): void
  /** Replace shop item states; re-renders in place if the shop panel is open. */
  updateShop(items: readonly ShopItemView[]): void
  /** Game over with a positive score: open the initials-submit dialog. */
  promptScoreSubmit(score: number): void
  /** Remove all DOM this shell created and detach listeners. */
  dispose(): void
}

export function createUiShell(opts: {
  adapter: PersistenceAdapter
  modeId: string
  modes: readonly ModeOption[]
  activeModeId: string
  onModeSelect(id: string): void
  themes: readonly ThemeOption[]
  activeThemeId: string
  shopItems: readonly ShopItemView[]
  onThemeSelect(id: string): void
  onPurchase(itemId: string): void
  onPauseToggle(): void
  onRestart(): void
  /** User clicked the sound button. The shell shows the button only; main.ts owns the SoundPlayer + persisted preference. */
  onMuteToggle(): void
}): UiShell {
  const { adapter, modeId, onModeSelect, onThemeSelect, onPurchase, onPauseToggle, onRestart, onMuteToggle } = opts
  let modes = opts.modes
  let themes = opts.themes
  let shopItems = opts.shopItems
  let activeModeId = opts.activeModeId
  let activeThemeId = opts.activeThemeId

  injectStyles()

  const root = document.getElementById('ui-root')
  if (!root) throw new Error('#ui-root not found')

  // --- dialog helper ------------------------------------------------------
  // Shared wiring for every overlay panel below: role="dialog" + aria-modal,
  // aria-labelledby -> the panel's own title, Escape-to-close (stopped from
  // bubbling so input.ts's page-level Escape-pauses-game handler never
  // fires while a panel is open), a simple first/last-sentinel focus trap,
  // and focus save/restore so closing a panel returns focus to whichever
  // control-bar button opened it.
  let dialogUidCounter = 0

  function makeDialog(overlay: HTMLDivElement, panel: HTMLDivElement, title: HTMLHeadingElement): {
    open(opener: HTMLElement | null, focusTarget?: HTMLElement): void
    close(): void
  } {
    if (!title.id) title.id = `nibble-dialog-title-${++dialogUidCounter}`
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    panel.setAttribute('aria-labelledby', title.id)
    panel.tabIndex = -1

    let lastOpener: HTMLElement | null = null

    function focusables(): HTMLElement[] {
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hidden && el.offsetParent !== null,
      )
    }

    function onKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation()
        event.preventDefault()
        close()
        return
      }
      if (event.key === 'Tab') {
        const items = focusables()
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    function open(opener: HTMLElement | null, focusTarget?: HTMLElement): void {
      lastOpener = opener
      overlay.hidden = false
      overlay.addEventListener('keydown', onKeydown)
      const target = focusTarget ?? focusables()[0] ?? panel
      target.focus()
    }

    function close(): void {
      overlay.hidden = true
      overlay.removeEventListener('keydown', onKeydown)
      lastOpener?.focus()
      lastOpener = null
    }

    return { open, close }
  }

  // --- control bar ---------------------------------------------------
  const bar = document.createElement('div')
  bar.className = 'nibble-bar'

  const modeButton = document.createElement('button')
  modeButton.type = 'button'
  modeButton.className = 'nibble-btn'
  modeButton.setAttribute('aria-label', 'Choose game mode')
  modeButton.addEventListener('click', () => openModes(modeButton))

  const pauseButton = document.createElement('button')
  pauseButton.type = 'button'
  pauseButton.className = 'nibble-btn'
  pauseButton.textContent = 'Pause'
  pauseButton.setAttribute('aria-label', 'Pause game')
  pauseButton.addEventListener('click', () => onPauseToggle())

  const leaderboardButton = document.createElement('button')
  leaderboardButton.type = 'button'
  leaderboardButton.className = 'nibble-btn'
  leaderboardButton.textContent = 'Leaderboard'
  leaderboardButton.setAttribute('aria-label', 'Open leaderboard')
  leaderboardButton.addEventListener('click', () => openLeaderboard(leaderboardButton))

  const themesButton = document.createElement('button')
  themesButton.type = 'button'
  themesButton.className = 'nibble-btn'
  themesButton.textContent = 'Themes'
  themesButton.setAttribute('aria-label', 'Choose theme')
  themesButton.addEventListener('click', () => openThemes(themesButton))

  const shopButton = document.createElement('button')
  shopButton.type = 'button'
  shopButton.className = 'nibble-btn'
  shopButton.textContent = 'Shop'
  shopButton.setAttribute('aria-label', 'Open shop')
  shopButton.addEventListener('click', () => openShop(shopButton))

  const soundButton = document.createElement('button')
  soundButton.type = 'button'
  soundButton.className = 'nibble-btn'
  soundButton.addEventListener('click', () => onMuteToggle())

  const restartButton = document.createElement('button')
  restartButton.type = 'button'
  restartButton.className = 'nibble-btn'
  restartButton.textContent = 'New Game'
  restartButton.setAttribute('aria-label', 'Start new game')
  restartButton.addEventListener('click', () => onRestart())

  const coinCounter = document.createElement('span')
  coinCounter.className = 'nibble-coin-counter'
  coinCounter.setAttribute('aria-label', 'Coin balance')
  coinCounter.setAttribute('aria-live', 'polite')

  const levelInfoLabel = document.createElement('span')
  levelInfoLabel.className = 'nibble-level-info'
  levelInfoLabel.setAttribute('aria-label', 'Level info')
  levelInfoLabel.setAttribute('aria-live', 'polite')
  levelInfoLabel.hidden = true

  bar.append(
    modeButton,
    pauseButton,
    leaderboardButton,
    themesButton,
    shopButton,
    soundButton,
    restartButton,
    coinCounter,
    levelInfoLabel,
  )
  root.appendChild(bar)

  function syncSoundButtonLabel(muted: boolean): void {
    soundButton.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON'
    soundButton.setAttribute('aria-label', muted ? 'Sound is off. Click to turn on.' : 'Sound is on. Click to turn off.')
    soundButton.setAttribute('aria-pressed', String(!muted))
  }
  syncSoundButtonLabel(false)

  function renderCoinCounter(balance: number): void {
    coinCounter.textContent = `◉ ${balance}`
  }
  renderCoinCounter(0)

  function findModeName(id: string): string {
    return modes.find((mode) => mode.id === id)?.name ?? id
  }

  function syncModeButtonLabel(): void {
    modeButton.textContent = `MODE: ${findModeName(activeModeId).toUpperCase()}`
  }
  syncModeButtonLabel()

  // --- mode panel -------------------------------------------------------
  const modesOverlay = document.createElement('div')
  modesOverlay.className = 'nibble-overlay'
  modesOverlay.hidden = true

  const modesPanel = document.createElement('div')
  modesPanel.className = 'nibble-panel'

  const modesTitle = document.createElement('h2')
  modesTitle.className = 'nibble-panel-title'
  modesTitle.textContent = 'Mode'

  const modesList = document.createElement('ol')
  modesList.className = 'nibble-modes-list'

  const modesCloseButton = document.createElement('button')
  modesCloseButton.type = 'button'
  modesCloseButton.className = 'nibble-btn'
  modesCloseButton.textContent = 'Close'
  modesCloseButton.setAttribute('aria-label', 'Close mode selection')
  modesCloseButton.addEventListener('click', () => closeModes())

  modesPanel.append(modesTitle, modesList, modesCloseButton)
  modesOverlay.appendChild(modesPanel)
  root.appendChild(modesOverlay)

  const modesDialog = makeDialog(modesOverlay, modesPanel, modesTitle)

  const modeRowButtons = new Map<string, HTMLButtonElement>()

  function renderModeRows(): void {
    modesList.replaceChildren()
    modeRowButtons.clear()

    if (modes.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'nibble-modes-empty'
      empty.textContent = 'No modes available.'
      modesList.appendChild(empty)
      return
    }

    modes.forEach((mode) => {
      const row = document.createElement('li')
      row.className = 'nibble-modes-row'

      const rowButton = document.createElement('button')
      rowButton.type = 'button'
      rowButton.className = 'nibble-mode-btn'
      rowButton.setAttribute('aria-label', `Select ${mode.name} mode`)
      rowButton.addEventListener('click', () => {
        onModeSelect(mode.id)
        closeModes()
      })

      row.appendChild(rowButton)
      modesList.appendChild(row)
      modeRowButtons.set(mode.id, rowButton)
    })

    syncModeRowLabels()
  }

  function syncModeRowLabels(): void {
    modes.forEach((mode) => {
      const rowButton = modeRowButtons.get(mode.id)
      if (!rowButton) return
      const isActive = mode.id === activeModeId
      rowButton.textContent = isActive ? `▶ ${mode.name}` : mode.name
      rowButton.classList.toggle('nibble-mode-btn-active', isActive)
    })
  }

  function openModes(opener: HTMLElement): void {
    renderModeRows()
    modesDialog.open(opener)
  }

  function closeModes(): void {
    modesDialog.close()
  }

  // --- leaderboard overlay -------------------------------------------
  const leaderboardOverlay = document.createElement('div')
  leaderboardOverlay.className = 'nibble-overlay'
  leaderboardOverlay.hidden = true

  const leaderboardPanel = document.createElement('div')
  leaderboardPanel.className = 'nibble-panel'

  const leaderboardTitle = document.createElement('h2')
  leaderboardTitle.className = 'nibble-panel-title'
  leaderboardTitle.textContent = 'Leaderboard'

  const leaderboardList = document.createElement('ol')
  leaderboardList.className = 'nibble-leaderboard-list'

  const leaderboardCloseButton = document.createElement('button')
  leaderboardCloseButton.type = 'button'
  leaderboardCloseButton.className = 'nibble-btn'
  leaderboardCloseButton.textContent = 'Close'
  leaderboardCloseButton.setAttribute('aria-label', 'Close leaderboard')
  leaderboardCloseButton.addEventListener('click', () => closeLeaderboard())

  leaderboardPanel.append(leaderboardTitle, leaderboardList, leaderboardCloseButton)
  leaderboardOverlay.appendChild(leaderboardPanel)
  root.appendChild(leaderboardOverlay)

  const leaderboardDialog = makeDialog(leaderboardOverlay, leaderboardPanel, leaderboardTitle)

  function renderLeaderboardRows(
    entries: readonly { name: string; score: number }[],
  ): void {
    leaderboardList.replaceChildren()
    if (entries.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'nibble-leaderboard-empty'
      empty.textContent = 'No scores yet — be the first!'
      leaderboardList.appendChild(empty)
      return
    }
    entries.forEach((entry, index) => {
      const row = document.createElement('li')
      row.className = 'nibble-leaderboard-row'

      const rank = document.createElement('span')
      rank.className = 'nibble-leaderboard-rank'
      rank.textContent = `${index + 1}.`

      const name = document.createElement('span')
      name.className = 'nibble-leaderboard-name'
      name.textContent = entry.name

      const score = document.createElement('span')
      score.className = 'nibble-leaderboard-score'
      score.textContent = String(entry.score)

      row.append(rank, name, score)
      leaderboardList.appendChild(row)
    })
  }

  function openLeaderboard(opener: HTMLElement): void {
    leaderboardDialog.open(opener)
    void adapter.getLeaderboard(modeId).then((entries) => {
      renderLeaderboardRows(entries)
    })
  }

  function closeLeaderboard(): void {
    leaderboardDialog.close()
  }

  // --- themes panel -----------------------------------------------------
  const themesOverlay = document.createElement('div')
  themesOverlay.className = 'nibble-overlay'
  themesOverlay.hidden = true

  const themesPanel = document.createElement('div')
  themesPanel.className = 'nibble-panel'

  const themesTitle = document.createElement('h2')
  themesTitle.className = 'nibble-panel-title'
  themesTitle.textContent = 'Themes'

  const themesList = document.createElement('ol')
  themesList.className = 'nibble-themes-list'

  const themesCloseButton = document.createElement('button')
  themesCloseButton.type = 'button'
  themesCloseButton.className = 'nibble-btn'
  themesCloseButton.textContent = 'Close'
  themesCloseButton.setAttribute('aria-label', 'Close theme selection')
  themesCloseButton.addEventListener('click', () => closeThemes())

  themesPanel.append(themesTitle, themesList, themesCloseButton)
  themesOverlay.appendChild(themesPanel)
  root.appendChild(themesOverlay)

  const themesDialog = makeDialog(themesOverlay, themesPanel, themesTitle)

  const themeRowButtons = new Map<string, HTMLButtonElement>()

  function renderThemeRows(): void {
    themesList.replaceChildren()
    themeRowButtons.clear()

    if (themes.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'nibble-themes-empty'
      empty.textContent = 'No themes available.'
      themesList.appendChild(empty)
      return
    }

    themes.forEach((theme) => {
      const row = document.createElement('li')
      row.className = 'nibble-themes-row'

      const rowButton = document.createElement('button')
      rowButton.type = 'button'
      rowButton.className = 'nibble-theme-btn'
      if (theme.locked) rowButton.disabled = true
      rowButton.addEventListener('click', () => {
        if (theme.locked) return
        onThemeSelect(theme.id)
        closeThemes()
      })

      row.appendChild(rowButton)
      themesList.appendChild(row)
      themeRowButtons.set(theme.id, rowButton)
    })

    syncThemeRowLabels()
  }

  function syncThemeRowLabels(): void {
    themes.forEach((theme) => {
      const rowButton = themeRowButtons.get(theme.id)
      if (!rowButton) return
      const isActive = theme.id === activeThemeId
      const label = theme.locked ? `${LOCK_MARKER} ${theme.name}` : theme.name
      rowButton.textContent = isActive ? `▶ ${label}` : label
      rowButton.classList.toggle('nibble-theme-btn-active', isActive)
      rowButton.classList.toggle('nibble-theme-btn-locked', Boolean(theme.locked))
      rowButton.setAttribute(
        'aria-label',
        theme.locked ? `${theme.name}, locked` : `Select ${theme.name} theme`,
      )
    })
  }

  function openThemes(opener: HTMLElement): void {
    renderThemeRows()
    themesDialog.open(opener)
  }

  function closeThemes(): void {
    themesDialog.close()
  }

  // --- shop panel -------------------------------------------------------
  const shopOverlay = document.createElement('div')
  shopOverlay.className = 'nibble-overlay'
  shopOverlay.hidden = true

  const shopPanel = document.createElement('div')
  shopPanel.className = 'nibble-panel'

  const shopTitle = document.createElement('h2')
  shopTitle.className = 'nibble-panel-title'
  shopTitle.textContent = 'Shop'

  const shopList = document.createElement('ol')
  shopList.className = 'nibble-shop-list'

  const shopCloseButton = document.createElement('button')
  shopCloseButton.type = 'button'
  shopCloseButton.className = 'nibble-btn'
  shopCloseButton.textContent = 'Close'
  shopCloseButton.setAttribute('aria-label', 'Close shop')
  shopCloseButton.addEventListener('click', () => closeShop())

  shopPanel.append(shopTitle, shopList, shopCloseButton)
  shopOverlay.appendChild(shopPanel)
  root.appendChild(shopOverlay)

  const shopDialog = makeDialog(shopOverlay, shopPanel, shopTitle)

  let shopOpen = false

  function renderShopRows(): void {
    shopList.replaceChildren()

    if (shopItems.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'nibble-shop-empty'
      empty.textContent = 'No items available.'
      shopList.appendChild(empty)
      return
    }

    shopItems.forEach((item) => {
      const row = document.createElement('li')
      row.className = 'nibble-shop-row'

      const name = document.createElement('span')
      name.className = 'nibble-shop-name'
      name.textContent = item.name

      const price = document.createElement('span')
      price.className = 'nibble-shop-price'
      price.textContent = `◉ ${item.price}`

      row.append(name, price)

      if (item.owned) {
        const ownedTag = document.createElement('span')
        ownedTag.className = 'nibble-shop-owned'
        ownedTag.textContent = 'OWNED'
        row.appendChild(ownedTag)
      } else {
        const buyButton = document.createElement('button')
        buyButton.type = 'button'
        buyButton.className = 'nibble-btn nibble-shop-buy'
        buyButton.textContent = 'Buy'
        buyButton.setAttribute('aria-label', `Buy ${item.name} for ${item.price} coins`)
        buyButton.addEventListener('click', () => onPurchase(item.id))
        row.appendChild(buyButton)
      }

      shopList.appendChild(row)
    })
  }

  function openShop(opener: HTMLElement): void {
    shopOpen = true
    renderShopRows()
    shopDialog.open(opener)
  }

  function closeShop(): void {
    shopOpen = false
    shopDialog.close()
  }

  // --- score submit dialog --------------------------------------------
  const submitOverlay = document.createElement('div')
  submitOverlay.className = 'nibble-overlay'
  submitOverlay.hidden = true

  const submitPanel = document.createElement('div')
  submitPanel.className = 'nibble-panel'

  const submitTitle = document.createElement('h2')
  submitTitle.className = 'nibble-panel-title'
  submitTitle.textContent = 'Game Over'

  const submitScoreLine = document.createElement('p')
  submitScoreLine.className = 'nibble-score-line'

  const submitLabel = document.createElement('label')
  submitLabel.className = 'nibble-initials-label'
  submitLabel.textContent = 'Enter initials'
  submitLabel.htmlFor = 'nibble-initials-input'

  const initialsInput = document.createElement('input')
  initialsInput.id = 'nibble-initials-input'
  initialsInput.type = 'text'
  initialsInput.className = 'nibble-initials-input'
  initialsInput.maxLength = 3
  initialsInput.autocomplete = 'off'
  initialsInput.spellcheck = false
  submitLabel.appendChild(initialsInput)

  initialsInput.addEventListener('input', () => {
    initialsInput.value = initialsInput.value.toUpperCase().slice(0, 3)
  })
  initialsInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      submitHandler()
    }
  })

  const submitActions = document.createElement('div')
  submitActions.className = 'nibble-dialog-actions'

  const submitButton = document.createElement('button')
  submitButton.type = 'button'
  submitButton.className = 'nibble-btn'
  submitButton.textContent = 'Submit'
  submitButton.setAttribute('aria-label', 'Submit score with these initials')

  const skipButton = document.createElement('button')
  skipButton.type = 'button'
  skipButton.className = 'nibble-btn'
  skipButton.textContent = 'Skip'
  skipButton.setAttribute('aria-label', 'Skip submitting score')
  skipButton.addEventListener('click', () => closeSubmitDialog())

  submitActions.append(submitButton, skipButton)
  submitPanel.append(submitTitle, submitScoreLine, submitLabel, submitActions)
  submitOverlay.appendChild(submitPanel)
  root.appendChild(submitOverlay)

  const submitDialog = makeDialog(submitOverlay, submitPanel, submitTitle)

  let pendingScore = 0

  function submitHandler(): void {
    const name = (initialsInput.value || DEFAULT_INITIALS).padEnd(3, 'A').slice(0, 3)
    lastInitials = name
    void adapter.submitScore({
      modeId,
      name,
      score: pendingScore,
      achievedAt: Date.now(),
    })
    closeSubmitDialog()
  }
  submitButton.addEventListener('click', submitHandler)

  function closeSubmitDialog(): void {
    submitDialog.close()
  }

  return {
    setPaused(paused) {
      pauseButton.textContent = paused ? 'Resume' : 'Pause'
      pauseButton.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game')
    },

    setActiveTheme(id) {
      activeThemeId = id
      syncThemeRowLabels()
    },

    setActiveMode(id) {
      activeModeId = id
      syncModeButtonLabel()
      syncModeRowLabels()
    },

    setLevelInfo(text) {
      if (text === null) {
        levelInfoLabel.hidden = true
        levelInfoLabel.textContent = ''
        return
      }
      levelInfoLabel.hidden = false
      levelInfoLabel.textContent = text
    },

    setCoins(balance) {
      renderCoinCounter(balance)
    },

    setMuted(muted) {
      syncSoundButtonLabel(muted)
    },

    updateThemes(nextThemes) {
      themes = nextThemes
      if (!themesOverlay.hidden) renderThemeRows()
    },

    updateShop(items) {
      shopItems = items
      if (shopOpen) renderShopRows()
    },

    promptScoreSubmit(score) {
      pendingScore = score
      submitScoreLine.textContent = `Score: ${score}`
      initialsInput.value = lastInitials
      submitDialog.open(null, initialsInput)
      initialsInput.select()
    },

    dispose() {
      bar.remove()
      modesOverlay.remove()
      leaderboardOverlay.remove()
      themesOverlay.remove()
      shopOverlay.remove()
      submitOverlay.remove()
    },
  }
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.textContent = `
    #ui-root {
      font-family: 'JetBrains Mono', 'Courier New', ui-monospace, monospace;
      color: #c4cfa1;
      width: 100%;
      max-width: 100vmin;
    }
    .nibble-bar {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
      padding: 0.5rem 0;
    }
    .nibble-btn {
      background: #1a1c16;
      color: #c4cfa1;
      border: 1px solid #c4cfa1;
      border-radius: 2px;
      padding: 0.4rem 0.75rem;
      font: inherit;
      font-size: 0.85rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .nibble-btn:hover,
    .nibble-btn:focus-visible {
      background: #c4cfa1;
      color: #1a1c16;
      outline: none;
    }
    .nibble-btn:focus-visible {
      outline: 2px solid #e8f0c4;
      outline-offset: 2px;
    }
    .nibble-btn[aria-pressed='false'] {
      opacity: 0.75;
    }
    .nibble-coin-counter {
      display: inline-flex;
      align-items: center;
      background: #1a1c16;
      color: #e8f0c4;
      border: 1px solid #c4cfa1;
      border-radius: 2px;
      padding: 0.4rem 0.75rem;
      font-size: 0.85rem;
      letter-spacing: 0.05em;
      user-select: none;
    }
    .nibble-level-info {
      display: inline-flex;
      align-items: center;
      color: #c4cfa1;
      padding: 0.4rem 0.25rem;
      font-size: 0.85rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      user-select: none;
    }
    .nibble-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }
    .nibble-panel {
      background: #1a1c16;
      border: 2px solid #c4cfa1;
      border-radius: 4px;
      padding: 1.25rem;
      min-width: 240px;
      max-width: 90vmin;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .nibble-panel-title {
      margin: 0;
      font-size: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      text-align: center;
    }
    .nibble-leaderboard-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      max-height: 40vh;
      overflow-y: auto;
    }
    .nibble-leaderboard-row {
      display: grid;
      grid-template-columns: 2.5rem 1fr auto;
      gap: 0.5rem;
    }
    .nibble-leaderboard-empty {
      text-align: center;
      opacity: 0.7;
      padding: 0.5rem 0;
    }
    .nibble-modes-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      max-height: 40vh;
      overflow-y: auto;
    }
    .nibble-modes-row {
      display: flex;
    }
    .nibble-modes-empty {
      text-align: center;
      opacity: 0.7;
      padding: 0.5rem 0;
    }
    .nibble-mode-btn {
      flex: 1;
      background: #1a1c16;
      color: #c4cfa1;
      border: 1px solid #c4cfa1;
      border-radius: 2px;
      padding: 0.4rem 0.6rem;
      font: inherit;
      font-size: 0.85rem;
      letter-spacing: 0.05em;
      text-align: left;
      cursor: pointer;
    }
    .nibble-mode-btn:hover,
    .nibble-mode-btn:focus-visible {
      background: #2a2d22;
      outline: none;
    }
    .nibble-mode-btn:focus-visible {
      outline: 2px solid #e8f0c4;
      outline-offset: 2px;
    }
    .nibble-mode-btn-active {
      border-color: #e8f0c4;
      color: #e8f0c4;
      font-weight: bold;
    }
    .nibble-themes-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      max-height: 40vh;
      overflow-y: auto;
    }
    .nibble-themes-row {
      display: flex;
    }
    .nibble-themes-empty {
      text-align: center;
      opacity: 0.7;
      padding: 0.5rem 0;
    }
    .nibble-theme-btn {
      flex: 1;
      background: #1a1c16;
      color: #c4cfa1;
      border: 1px solid #c4cfa1;
      border-radius: 2px;
      padding: 0.4rem 0.6rem;
      font: inherit;
      font-size: 0.85rem;
      letter-spacing: 0.05em;
      text-align: left;
      cursor: pointer;
    }
    .nibble-theme-btn:hover,
    .nibble-theme-btn:focus-visible {
      background: #2a2d22;
      outline: none;
    }
    .nibble-theme-btn:focus-visible {
      outline: 2px solid #e8f0c4;
      outline-offset: 2px;
    }
    .nibble-theme-btn-active {
      border-color: #e8f0c4;
      color: #e8f0c4;
      font-weight: bold;
    }
    .nibble-theme-btn-locked {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .nibble-theme-btn-locked:hover,
    .nibble-theme-btn-locked:focus-visible {
      background: #1a1c16;
    }
    .nibble-shop-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      max-height: 40vh;
      overflow-y: auto;
    }
    .nibble-shop-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      border: 1px solid #c4cfa1;
      border-radius: 2px;
      padding: 0.4rem 0.6rem;
    }
    .nibble-shop-name {
      flex: 1;
      font-size: 0.85rem;
      letter-spacing: 0.05em;
    }
    .nibble-shop-price {
      font-size: 0.85rem;
      color: #e8f0c4;
      white-space: nowrap;
    }
    .nibble-shop-owned {
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      color: #1a1c16;
      background: #c4cfa1;
      border-radius: 2px;
      padding: 0.3rem 0.5rem;
      white-space: nowrap;
    }
    .nibble-shop-buy {
      padding: 0.3rem 0.6rem;
      font-size: 0.75rem;
    }
    .nibble-shop-empty {
      text-align: center;
      opacity: 0.7;
      padding: 0.5rem 0;
    }
    .nibble-score-line {
      margin: 0;
      text-align: center;
      font-size: 1.1rem;
    }
    .nibble-initials-label {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      align-items: center;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .nibble-initials-input {
      background: #1a1c16;
      color: #c4cfa1;
      border: 1px solid #c4cfa1;
      border-radius: 2px;
      font: inherit;
      font-size: 1.5rem;
      letter-spacing: 0.3em;
      text-align: center;
      text-transform: uppercase;
      width: 5ch;
      padding: 0.25rem;
    }
    .nibble-dialog-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
    }
    @media (prefers-reduced-motion: no-preference) {
      .nibble-btn,
      .nibble-mode-btn,
      .nibble-theme-btn {
        transition: background-color 120ms ease, color 120ms ease;
      }
      .nibble-overlay {
        transition: opacity 120ms ease;
      }
      .nibble-panel {
        transition: transform 120ms ease;
      }
    }
    /* The hidden attribute only maps to a UA-stylesheet display: none, which
       author display rules (e.g. .nibble-overlay's flex) silently override —
       without this reset every overlay renders permanently open. */
    [hidden] {
      display: none !important;
    }
  `
  document.head.appendChild(style)
}
