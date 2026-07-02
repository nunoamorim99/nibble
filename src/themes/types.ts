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
  /**
   * Optional second body color for a two-tone snake. When present, the
   * renderer alternates `snakeBody` / `snakeBodyAlt` by segment index. Absent
   * means a flat one-color body (every existing theme's current look).
   */
  readonly snakeBodyAlt?: string
  /**
   * Optional eye dot color drawn on the head cell. Absent means no eye is
   * drawn (the classic faceless look).
   */
  readonly eye?: string
  /**
   * Optional vertical background gradient, `[top, bottom]`. When present it
   * takes precedence over the flat `background` fill.
   */
  readonly backgroundGradient?: readonly [string, string]
  /**
   * Optional scenic background image URL (e.g. a Higgsfield-generated scene).
   * When present it takes precedence over `backgroundGradient`/`background`
   * for the fill; the renderer draws it cover-scaled and dims it with a
   * translucent `background`-colored overlay (~0.35 alpha) so gameplay stays
   * readable on top. Falls back to the gradient/flat fill while the image is
   * loading or if it fails to load.
   */
  readonly backgroundImage?: string
}

/** How a single grid cell is shaped when filled. */
export interface ThemeCellStyle {
  /** Plain filled square vs. a rounded-rect look. */
  readonly shape: 'square' | 'rounded'
  /** Fraction (0..0.4) of the cell left as a gap on every side — the classic segmented look. */
  readonly inset: number
  /** Corner radius as a fraction of the (inset) cell size; only used when `shape` is `'rounded'`. */
  readonly radius: number
  /**
   * Optional subtle pixel bevel: a lighter edge line along the top/left of
   * the filled cell and a darker one along the bottom/right, drawn with
   * translucent white/black strokes (no extra color tokens needed). Absent
   * or `false` means a flat fill, matching every existing theme's look.
   */
  readonly bevel?: boolean
}

/**
 * Optional spritesheet reference for skin-based themes (ladder rung 5+). The
 * renderer lazy-loads `sheetUrl` (an image) and `mapUrl` (the pinned
 * `{ tile, parts }` JSON) once per theme id and caches the result; until
 * loaded — or if either fetch fails — the renderer falls back to the
 * token-driven `fillCell` pipeline, so a theme with `sprites` set is always
 * safe to select even before art exists on disk.
 */
export interface ThemeSprites {
  /** URL of the spritesheet image (a grid of `tile`×`tile` px cells). */
  readonly sheetUrl: string
  /** URL of the sheet's `{ tile, parts }` JSON part map. */
  readonly mapUrl: string
  /**
   * When `true`, sprite tiles are drawn with `imageSmoothingEnabled = false`
   * for crisp, unblurred pixel art. Absent/`false` draws with the canvas
   * default (smoothed) — appropriate for painterly/illustrated sheets.
   */
  readonly pixelated?: boolean
}

/**
 * Optional cosmetic eat-particle burst, spawned by the renderer (never the
 * engine) when it observes `applesEaten` increase between draws. Purely
 * decorative; deciding nothing about scoring or collision.
 */
export interface ThemeParticles {
  /** Burst color palette; one is picked per particle. At least one entry. */
  readonly eat: readonly string[]
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
  /**
   * Optional skin spritesheet (ladder rung 5+). Absent means the theme is
   * drawn entirely from `colors`/`cell` tokens via the code-drawn pipeline.
   */
  readonly sprites?: ThemeSprites
  /**
   * Optional cosmetic burst colors for the eat-particle effect. Absent falls
   * back to a single-color burst using `colors.food`.
   */
  readonly particles?: ThemeParticles
}
