/**
 * Theme contract. A theme is DATA ONLY — color tokens plus a small cell-style
 * descriptor. The renderer pulls every visual decision from an instance of
 * this interface and never hardcodes a look; adding a theme never touches
 * `src/render/`.
 */

/** Color tokens the renderer draws with. Every value here is a CSS color string. */
export interface ThemeColors {
  /** Fill for the whole canvas before anything else is drawn. */
  readonly background: string
  /** Grid line color, or `null` to draw no grid lines at all. */
  readonly grid: string | null
  /** Snake head cell color. */
  readonly snakeHead: string
  /** Snake body cell color (all segments except the head). */
  readonly snakeBody: string
  /** Food cell color. */
  readonly food: string
  /** Obstacle cell color. */
  readonly obstacle: string
  /** HUD (score / high score) text color. */
  readonly hudText: string
  /** Overlay message text color (game over / win screens). */
  readonly overlayText: string
  /** Overlay backdrop color — expected to be an `rgba()` string with alpha. */
  readonly overlayBackdrop: string
}

/** How a single grid cell is shaped when filled. */
export interface ThemeCellStyle {
  /** Plain filled square vs. a rounded-rect look. */
  readonly shape: 'square' | 'rounded'
  /** Fraction (0..0.4) of the cell left as a gap on every side — the classic segmented look. */
  readonly inset: number
  /** Corner radius as a fraction of the (inset) cell size; only used when `shape` is `'rounded'`. */
  readonly radius: number
}

/**
 * A complete theme: tokens the renderer reads verbatim. No behavior, no
 * functions — swapping a theme is swapping this data object.
 */
export interface Theme {
  /** Stable identifier, used as a registry key and persisted selection. */
  readonly id: string
  /** Human-readable name shown in UI. */
  readonly name: string
  readonly colors: ThemeColors
  readonly cell: ThemeCellStyle
  /**
   * When `true`, the renderer lerps snake segment positions between ticks
   * using the draw `alpha` for smooth motion. When `false`, movement is
   * cell-snapped every tick (the authentic chunky Nokia look) and `alpha` is
   * ignored entirely.
   */
  readonly interpolate: boolean
}
