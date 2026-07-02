# Background source — neon theme

- Method: Higgsfield MCP (`generate_image`, model `soul_location`)
- Job id: `6029b72d-6f46-49f8-bb6a-41a86d523efa`
- Prompt: "retro synthwave landscape from above at night, glowing cyan and magenta
  perspective grid lines on the ground receding to the horizon, deep purple and
  black sky, neon horizon glow, subtle, low contrast, game background, no
  characters, no text"
- Result name: "Sector 9 Grid"
- Note: an earlier attempt with the shorter prompt "dark synthwave grid
  landscape from above, deep purple and black, faint neon horizon glow,
  subtle, low contrast, game background" (job `d916caea-73ac-4b0d-bb1f-aa4738430596`,
  "Midnight Salt Flats") rendered as a dark dune/terrain horizon with no grid
  lines and no cyan — did not match the synthwave brief, so it was discarded
  and the prompt was made more explicit about the grid + palette.
- Raw output: 2048x2048 PNG (`source-higgsfield.png`, downscaled to 1024x1024 here for storage)
- Processing applied for the shipped asset (`public/assets/backgrounds/neon/bg.png`):
  resize to 1024x1024, brightness x0.85, PNG palette — already dark/subtle from
  generation, dimmed slightly further for headroom under a bright neon snake.
