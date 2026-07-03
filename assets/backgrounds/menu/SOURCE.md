# Background source — menu (main menu hero backdrop)

- Method: Higgsfield MCP (`generate_image`, model `soul_location`)
- Job id: `555dba7b-6dd6-4116-9a73-c0120d3dc575`
- Prompt: "empty moody dark retro-arcade backdrop for a video game main menu,
  uninhabited scene, deep greens and near-black, subtle glowing grid pattern
  fading into darkness at the horizon, soft vignette, atmospheric fog, minimal
  abstract environment, nobody present, no figures, no people, no characters,
  no creatures, no animals, no snakes, no text, no logos"
- Result name: "Emerald Arcade"
- Note: a first attempt with the shorter prompt "moody dark retro-arcade
  backdrop for a snake game main menu — deep greens and near-black, subtle
  glowing grid fading into darkness, soft vignette, atmospheric, minimal, no
  text, no characters, no creatures, no snakes" (job
  `4e52332d-cff9-44f6-9f0c-bc9a6cb71120`, "Greenlight Arcade") rendered a
  small humanoid figure standing on the grid — violated the no-characters
  rule even though it wasn't a snake, so it was discarded. The prompt was
  rewritten to explicitly state the scene is uninhabited ("nobody present, no
  figures, no people") before regenerating.
- Raw output: 2048x2048 PNG (`source-higgsfield.png`, downscaled to 1024x1024
  here for storage). Checked at 4x brightness boost for hidden figures/text
  before use — the only non-uniform region is an abstract soft glow/haze
  blob and floor texture noise, not a figure or character.
- Processing applied for the shipped asset (`public/assets/backgrounds/menu/bg.png`):
  resize to 1024x1024, brightness x0.85, PNG palette (96 colors) — the
  generation was already very dark (channel means ~10/25/10 out of 255, max
  78), dimmed slightly further for extra headroom under the LCD-green UI
  text (`#c4cfa1`) and to keep the file small. The menu also applies its own
  scrim on top; this dimming is not relied upon alone for text contrast.
