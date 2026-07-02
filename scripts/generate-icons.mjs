// scripts/generate-icons.mjs
//
// Rasterizes public/icons/icon.svg into the PWA icon set with sharp.
// Hand-authored SVG only — no AI image generation is used anywhere in this
// script. Run with: node scripts/generate-icons.mjs
//
// Outputs (pinned filenames — referenced by public/manifest.webmanifest):
//   public/icons/icon-192.png            192x192  purpose "any"
//   public/icons/icon-512.png            512x512  purpose "any"
//   public/icons/icon-maskable-512.png   512x512  purpose "maskable"
//
// The maskable icon is NOT produced by padding transparent pixels around the
// existing square glyph. Instead this script rewrites the source SVG into a
// new full-bleed maskable SVG: the background rect is stretched to cover the
// entire canvas edge-to-edge (no rounded corners — the OS applies its own
// mask shape), and the glyph group is uniformly scaled + centered into the
// central 80% "safe zone" that the maskable icon spec guarantees is visible
// across circle/squircle/rounded-square masks. That maskable SVG is then
// rasterized at 512x512, matching the other sizes' source of truth.

import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const iconsDir = path.join(repoRoot, 'public', 'icons');
const sourceSvgPath = path.join(iconsDir, 'icon.svg');

// Fraction of the canvas the glyph is scaled to fit within for the maskable
// icon. 0.8 matches the W3C/Android maskable-icon "safe zone" guidance: only
// the central 80% of a maskable icon is guaranteed visible under every mask
// shape a platform may apply (circle, squircle, rounded square, ...).
const MASKABLE_SAFE_ZONE_RATIO = 0.8;

/**
 * Extract the numeric viewBox dimensions from an SVG's root <svg> tag.
 * Assumes a "0 0 W H" viewBox, which is how icon.svg is authored.
 */
function readViewBox(svgSource) {
  const match = svgSource.match(/viewBox="([\d.\s-]+)"/);
  if (!match) {
    throw new Error('icon.svg is missing a viewBox attribute');
  }
  const parts = match[1].trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`icon.svg has an unparseable viewBox: "${match[1]}"`);
  }
  const [minX, minY, width, height] = parts;
  return { minX, minY, width, height };
}

/**
 * Pull out the background rect (the full-canvas <rect> with a "fill"
 * matching the given color, ignoring rx/ry rounding) and the glyph group
 * (the first <g>...</g>, which in icon.svg holds only <rect> children — this
 * script is intentionally rect-only, no path parsing).
 */
function splitBackgroundAndGlyph(svgSource) {
  const groupMatch = svgSource.match(/<g[\s\S]*?<\/g>/);
  if (!groupMatch) {
    throw new Error('icon.svg is missing the glyph <g> group');
  }
  const glyphGroup = groupMatch[0];

  const bgMatch = svgSource.match(/<rect\b[^>]*\/>/);
  if (!bgMatch) {
    throw new Error('icon.svg is missing the background <rect>');
  }
  const bgFillMatch = bgMatch[0].match(/fill="([^"]+)"/);
  if (!bgFillMatch) {
    throw new Error('icon.svg background <rect> has no fill color');
  }
  const backgroundFill = bgFillMatch[1];

  return { glyphGroup, backgroundFill };
}

/**
 * Compute the bounding box of every <rect> found inside the glyph group,
 * whatever their fill (this glyph uses a same-color "eye" cutout rect too,
 * which must count toward the box so the whole head is contained). Rect
 * geometry only — matches the hard rule that this icon is rects-only.
 */
function glyphBoundingBox(glyphGroupSource) {
  const rectPattern = /<rect\b([^>]*)\/>/g;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let rectCount = 0;

  for (const [, attrs] of glyphGroupSource.matchAll(rectPattern)) {
    const x = Number(attrs.match(/\bx="([\d.-]+)"/)?.[1] ?? 0);
    const y = Number(attrs.match(/\by="([\d.-]+)"/)?.[1] ?? 0);
    const width = Number(attrs.match(/\bwidth="([\d.-]+)"/)?.[1]);
    const height = Number(attrs.match(/\bheight="([\d.-]+)"/)?.[1]);
    if ([x, y, width, height].some((n) => Number.isNaN(n))) {
      continue;
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
    rectCount += 1;
  }

  if (rectCount === 0) {
    throw new Error('Found no <rect> elements inside the glyph group');
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Build a full-bleed maskable SVG string: background rect stretched edge to
 * edge (no rx, so nothing but the OS mask ever clips a corner), glyph scaled
 * to fit the central safe-zone ratio and centered.
 */
function buildMaskableSvg({ viewBox, backgroundFill, glyphGroup, glyphBox, safeZoneRatio }) {
  const canvasSize = Math.min(viewBox.width, viewBox.height);
  const safeZoneSize = canvasSize * safeZoneRatio;

  const scale = Math.min(
    safeZoneSize / glyphBox.width,
    safeZoneSize / glyphBox.height,
  );

  const glyphCenterX = glyphBox.minX + glyphBox.width / 2;
  const glyphCenterY = glyphBox.minY + glyphBox.height / 2;
  const canvasCenterX = viewBox.minX + viewBox.width / 2;
  const canvasCenterY = viewBox.minY + viewBox.height / 2;

  // Scale the glyph about its own center, then translate that center onto
  // the canvas center — expressed as a single translate+scale so the glyph's
  // internal rect coordinates need no rewriting.
  const translateX = canvasCenterX - glyphCenterX * scale;
  const translateY = canvasCenterY - glyphCenterY * scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}">
  <rect x="${viewBox.minX}" y="${viewBox.minY}" width="${viewBox.width}" height="${viewBox.height}" fill="${backgroundFill}" />
  <g transform="translate(${translateX} ${translateY}) scale(${scale})">
    ${glyphGroup}
  </g>
</svg>
`;
}

async function rasterize(svgBuffer, size, outputPath) {
  await sharp(svgBuffer, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(outputPath);
}

async function main() {
  const sourceSvg = await readFile(sourceSvgPath, 'utf8');
  const viewBox = readViewBox(sourceSvg);
  const { glyphGroup, backgroundFill } = splitBackgroundAndGlyph(sourceSvg);
  const glyphBox = glyphBoundingBox(glyphGroup);

  await mkdir(iconsDir, { recursive: true });

  const sourceSvgBuffer = Buffer.from(sourceSvg, 'utf8');

  const targets = [
    { file: 'icon-192.png', size: 192, svg: sourceSvgBuffer },
    { file: 'icon-512.png', size: 512, svg: sourceSvgBuffer },
  ];

  const maskableSvg = buildMaskableSvg({
    viewBox,
    backgroundFill,
    glyphGroup,
    glyphBox,
    safeZoneRatio: MASKABLE_SAFE_ZONE_RATIO,
  });
  targets.push({
    file: 'icon-maskable-512.png',
    size: 512,
    svg: Buffer.from(maskableSvg, 'utf8'),
  });

  for (const target of targets) {
    const outputPath = path.join(iconsDir, target.file);
    await rasterize(target.svg, target.size, outputPath);
    console.log(`Wrote ${path.relative(repoRoot, outputPath)} (${target.size}x${target.size})`);
  }
}

main().catch((error) => {
  console.error('Icon generation failed:', error);
  process.exitCode = 1;
});
