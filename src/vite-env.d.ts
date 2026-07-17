/// <reference types="vite/client" />

// Nibble is offline-only and front-end-only: it declares no app-specific
// `VITE_*` env vars. Vite's built-in `ImportMetaEnv` (see `vite/client.d.ts`)
// still supplies `BASE_URL`, which the asset helpers and the UI shell use to
// resolve paths under the GitHub Pages base.
