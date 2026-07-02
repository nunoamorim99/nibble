/**
 * UI shell — the DOM chrome around the canvas: a control bar (pause/resume,
 * leaderboard, themes, shop, new game, coin counter), a themes panel, a shop
 * panel, a leaderboard overlay, and a score-submission dialog shown on game
 * over. Built entirely with `document.createElement` calls appended under
 * `#ui-root`; `index.html` stays declarative-minimal.
 *
 * Talks to persistence ONLY through the injected `PersistenceAdapter` — no
 * direct storage access, no engine imports beyond types re-exported from
 * `src/engine` elsewhere in this layer. Pause/restart/theme-select/purchase
 * are forwarded as abstract callbacks; this module never touches engine,
 * theme-registry, or economy internals itself — `ThemeOption` and
 * `ShopItemView` are plain display data owned by this layer. The shell
 * decides nothing about affordability, ownership, or unlocks: it renders
 * exactly the data it is given (via constructor opts or `updateThemes` /
 * `updateShop` / `setCoins`) and reports clicks upward.
 */
import type { PersistenceAdapter } from '../data'

const STYLE_ELEMENT_ID = 'nibble-ui-style'
const DEFAULT_INITIALS = 'AAA'
const LOCK_MARKER = '\u{1F512}'

/** Remembers the last-used initials for the lifetime of the module/session. */
let lastInitials = DEFAULT_INITIALS

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
  /** Update the coin counter in the control bar. */
  setCoins(balance: number): void
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
  themes: readonly ThemeOption[]
  activeThemeId: string
  shopItems: readonly ShopItemView[]
  onThemeSelect(id: string): void
  onPurchase(itemId: string): void
  onPauseToggle(): void
  onRestart(): void
}): UiShell {
  const { adapter, modeId, onThemeSelect, onPurchase, onPauseToggle, onRestart } = opts
  let themes = opts.themes
  let shopItems = opts.shopItems
  let activeThemeId = opts.activeThemeId

  injectStyles()

  const root = document.getElementById('ui-root')
  if (!root) throw new Error('#ui-root not found')

  // --- control bar ---------------------------------------------------
  const bar = document.createElement('div')
  bar.className = 'nibble-bar'

  const pauseButton = document.createElement('button')
  pauseButton.type = 'button'
  pauseButton.className = 'nibble-btn'
  pauseButton.textContent = 'Pause'
  pauseButton.addEventListener('click', () => onPauseToggle())

  const leaderboardButton = document.createElement('button')
  leaderboardButton.type = 'button'
  leaderboardButton.className = 'nibble-btn'
  leaderboardButton.textContent = 'Leaderboard'
  leaderboardButton.addEventListener('click', () => openLeaderboard())

  const themesButton = document.createElement('button')
  themesButton.type = 'button'
  themesButton.className = 'nibble-btn'
  themesButton.textContent = 'Themes'
  themesButton.addEventListener('click', () => openThemes())

  const shopButton = document.createElement('button')
  shopButton.type = 'button'
  shopButton.className = 'nibble-btn'
  shopButton.textContent = 'Shop'
  shopButton.addEventListener('click', () => openShop())

  const restartButton = document.createElement('button')
  restartButton.type = 'button'
  restartButton.className = 'nibble-btn'
  restartButton.textContent = 'New Game'
  restartButton.addEventListener('click', () => onRestart())

  const coinCounter = document.createElement('span')
  coinCounter.className = 'nibble-coin-counter'
  coinCounter.setAttribute('aria-label', 'Coin balance')

  bar.append(
    pauseButton,
    leaderboardButton,
    themesButton,
    shopButton,
    restartButton,
    coinCounter,
  )
  root.appendChild(bar)

  function renderCoinCounter(balance: number): void {
    coinCounter.textContent = `◉ ${balance}`
  }
  renderCoinCounter(0)

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
  leaderboardCloseButton.addEventListener('click', () => closeLeaderboard())

  leaderboardPanel.append(leaderboardTitle, leaderboardList, leaderboardCloseButton)
  leaderboardOverlay.appendChild(leaderboardPanel)
  root.appendChild(leaderboardOverlay)

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

  function openLeaderboard(): void {
    leaderboardOverlay.hidden = false
    void adapter.getLeaderboard(modeId).then((entries) => {
      renderLeaderboardRows(entries)
    })
  }

  function closeLeaderboard(): void {
    leaderboardOverlay.hidden = true
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
  themesCloseButton.addEventListener('click', () => closeThemes())

  themesPanel.append(themesTitle, themesList, themesCloseButton)
  themesOverlay.appendChild(themesPanel)
  root.appendChild(themesOverlay)

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
    })
  }

  function openThemes(): void {
    renderThemeRows()
    themesOverlay.hidden = false
  }

  function closeThemes(): void {
    themesOverlay.hidden = true
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
  shopCloseButton.addEventListener('click', () => closeShop())

  shopPanel.append(shopTitle, shopList, shopCloseButton)
  shopOverlay.appendChild(shopPanel)
  root.appendChild(shopOverlay)

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
        buyButton.addEventListener('click', () => onPurchase(item.id))
        row.appendChild(buyButton)
      }

      shopList.appendChild(row)
    })
  }

  function openShop(): void {
    shopOpen = true
    renderShopRows()
    shopOverlay.hidden = false
  }

  function closeShop(): void {
    shopOpen = false
    shopOverlay.hidden = true
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

  const initialsInput = document.createElement('input')
  initialsInput.type = 'text'
  initialsInput.className = 'nibble-initials-input'
  initialsInput.maxLength = 3
  initialsInput.autocomplete = 'off'
  initialsInput.spellcheck = false
  submitLabel.appendChild(initialsInput)

  initialsInput.addEventListener('input', () => {
    initialsInput.value = initialsInput.value.toUpperCase().slice(0, 3)
  })

  const submitActions = document.createElement('div')
  submitActions.className = 'nibble-dialog-actions'

  const submitButton = document.createElement('button')
  submitButton.type = 'button'
  submitButton.className = 'nibble-btn'
  submitButton.textContent = 'Submit'

  const skipButton = document.createElement('button')
  skipButton.type = 'button'
  skipButton.className = 'nibble-btn'
  skipButton.textContent = 'Skip'
  skipButton.addEventListener('click', () => closeSubmitDialog())

  submitActions.append(submitButton, skipButton)
  submitPanel.append(submitTitle, submitScoreLine, submitLabel, submitActions)
  submitOverlay.appendChild(submitPanel)
  root.appendChild(submitOverlay)

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
    submitOverlay.hidden = true
  }

  return {
    setPaused(paused) {
      pauseButton.textContent = paused ? 'Resume' : 'Pause'
    },

    setActiveTheme(id) {
      activeThemeId = id
      syncThemeRowLabels()
    },

    setCoins(balance) {
      renderCoinCounter(balance)
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
      submitOverlay.hidden = false
      initialsInput.focus()
      initialsInput.select()
    },

    dispose() {
      bar.remove()
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
  `
  document.head.appendChild(style)
}
