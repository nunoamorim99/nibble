/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Deployed to GitHub Pages at https://nunoamorim99.github.io/nibble/ — every
// URL the app emits must live under this base. In-code asset references use
// import.meta.env.BASE_URL; the manifest below uses relative paths (resolved
// against the manifest's own URL) so the plugin composes them with the base.
export default defineConfig({
  base: '/nibble/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Nibble',
        short_name: 'Nibble',
        description: 'Nokia-style Snake for the web — installable PWA.',
        display: 'standalone',
        background_color: '#1a1c16',
        theme_color: '#c4cfa1',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
