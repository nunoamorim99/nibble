# THEMES.md — the Snake evolution ladder

Themes in Nibble are a data-driven "history of Snake" progression. Each is unlocked in order with coins, and each is built one of three ways:

- **Palette / procedural** — a tokens object (colors, cell style, glow). The renderer draws everything in code. **No image assets.**
- **Skin spritesheet** — the `art-pipeline` agent code-generates the segment + food sprites from **SVG**, rasterized with **`sharp`** into `assets/sprites/<theme>/`. **No image model.**
- **Background** — the `art-pipeline` agent uses **Higgsfield** for scenic art into `assets/backgrounds/<theme>/`. Backgrounds only, never the snake.

## The ladder

| # | Theme | Look | Snake art | Background |
|---|---|---|---|---|
| 1 | **Classic (1998)** | Faithful Nokia monochrome LCD; blocky dark segments on pale green | palette (code) | none — flat LCD |
| 2 | **Mono+** | Same one-color world, subtle pixel bevel/shading, rounded corners | palette (code) | none |
| 3 | **First Color** | Snake gains a single flat color (classic green), simple eye | palette (code) | flat color |
| 4 | **Colored Pixel** | Small palette, two-tone shaded body, colored food | procedural (code) | flat / gradient |
| 5 | **Detailed Pixel** | Scales, gradient body, animated eye/tongue, themed grid | spritesheet (SVG + `sharp`) | subtle pattern |
| 6 | **Cartoon** | Expressive illustrated snake, cute food, decorative scene | spritesheet (SVG + `sharp`) | Higgsfield scene |
| 7 | **Futuristic / Neon** | Glowing neon snake, dark grid, particle trail | spritesheet (SVG + `sharp` + glow) | Higgsfield sci-fi |

Open-ended: further themes (jungle, desert, candy, retro-CRT, etc.) slot in after #6–7 using the same rules and tools.

## Rules

- Themes are **cosmetic only** — they never change gameplay.
- Rungs **1–4 stay asset-free** (keeps the PWA tiny, offline, and the classic authentic).
- A skin set is **one consistent family** — head, body, corner, tail, and food share the same generator/SVG so they always match.
- **Higgsfield is backgrounds only.** Snake and creature art is code-generated (SVG + `sharp`), or a CC0 pack if hand-illustration is needed — never an image model.
- Each new theme = a new data file + one registry entry; the engine is never touched.
