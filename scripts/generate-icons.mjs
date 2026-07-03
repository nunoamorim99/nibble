// scripts/generate-icons.mjs
//
// Rasterizes public/icons/icon.svg into the PWA icon set with sharp.
// Hand-authored SVG only — no AI image generation is used anywhere in this
// script. Run with: node scripts/generate-icons.mjs
//
// Outputs (pinned filenames — referenced by the manifest in vite.config.ts
// and by index.html):
//   public/icons/icon-192.png            192x192  purpose "any"
//   public/icons/icon-512.png            512x512  purpose "any"
//   public/icons/icon-maskable-192.png   192x192  purpose "maskable"
//   public/icons/icon-maskable-512.png   512x512  purpose "maskable"
//   public/icons/apple-touch-icon.png    180x180  iOS home screen
//
// There is deliberately NO separate maskable composition step anymore: the
// source SVG is authored maskable-safe (see the note inside icon.svg) — the
// background bleeds edge-to-edge and the subject sits inside the safe-zone
// CIRCLE of radius 40% that every OS mask shape (circle, squircle, rounded
// square) is guaranteed to keep. The earlier version of this script scaled a
// square glyph into an 80% square, whose corners a circular launcher mask
// still clips — exactly the "cut icon" seen on Android home screens. One
// safe-by-construction source now serves both purposes at every size.

import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const iconsDir = path.join(repoRoot, 'public', 'icons');
const sourceSvgPath = path.join(iconsDir, 'icon.svg');

const TARGETS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-192.png', size: 192 },
  { file: 'icon-maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

async function main() {
  const sourceSvg = await readFile(sourceSvgPath);
  await mkdir(iconsDir, { recursive: true });

  for (const { file, size } of TARGETS) {
    const outputPath = path.join(iconsDir, file);
    // density scales the SVG rasterization so strokes/gradients render at the
    // target resolution instead of being upscaled from the default 72dpi.
    await sharp(sourceSvg, { density: (72 * size) / 512 + 72 })
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Wrote ${path.relative(repoRoot, outputPath)} (${size}x${size})`);
  }
}

main().catch((error) => {
  console.error('Icon generation failed:', error);
  process.exitCode = 1;
});
