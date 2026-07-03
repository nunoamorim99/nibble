# README cover source

- Used as: the hero/cover image at the top of `README.md` (`assets/readme/cover.jpg`)
- Method: Higgsfield MCP (`generate_image`, model `recraft_v4_1`, `model_type`
  standard, 16:9, 2k)
- Job id: `d6e94609-8d53-47a7-a1d4-674859753d16`
- Prompt: "Wide hero banner illustration for a retro-arcade snake video game.
  A friendly stylized glossy green snake with a rounded segmented body winds
  across a dark arcade grid board that glows softly in phosphor green, moving
  toward a single shiny red apple. Deep greens and near-black palette with
  subtle neon glow, faint CRT scanlines and soft vignette, gentle atmospheric
  haze, clean uncluttered composition with breathing space, playful but sleek
  modern game-cover art, high detail digital illustration. No text, no
  letters, no numbers, no words, no logo, no watermark, no UI elements."
- Note: two candidates were generated in one batch; the sibling
  (`c2fac954-92ed-40dc-bdf9-b555d05130aa`) had a flatter side-on composition
  and was discarded. Both were inspected before use — no text, no watermarks,
  no stray figures.
- Raw output: 2688x1536 PNG. Processing applied for the committed asset:
  resize to 1680x960, JPEG quality 85 (mozjpeg). No raw copy is kept here —
  unlike the theme backgrounds (whose shipped assets are heavily
  dimmed/paletted, so the raw matters), the committed `cover.jpg` is a plain
  resize of the generation and is itself the archive.
- This is a repo/README illustration, not a game asset — it ships nowhere in
  the PWA bundle. The in-game rule (Higgsfield for scenic backgrounds only,
  never creature art) applies to game themes; a one-off cover has no
  cross-frame consistency requirement.
