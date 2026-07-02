// scripts/generate-sprites.mjs
//
// Code-generates the snake + food spritesheets for theme ladder rungs 5-7
// (detailed-pixel, cartoon, neon) per docs/THEMES.md: "Skin spritesheet — the
// art-pipeline agent code-generates the segment + food sprites from SVG,
// rasterized with sharp ... No image model." Every shape below is
// hand-authored SVG geometry defined in this file; sharp only rasterizes it.
//
// Run with: node scripts/generate-sprites.mjs
//
// Outputs per theme <id> in { 'detailed-pixel', 'cartoon', 'neon' }:
//   assets/sprites/<id>/*.svg          authoring sources (one per part, for review/editing)
//   public/assets/sprites/<id>/sheet.png   4x4 spritesheet, 64px tiles, 256x256 total
//   public/assets/sprites/<id>/sheet.json  pinned atlas: { tile, parts: { name: [col, row] } }
//
// sheet.json part keys (16 total, one per tile):
//   head-up, head-right, head-down, head-left   (dir = snake facing)
//   body-h, body-v
//   corner-ne, corner-nw, corner-se, corner-sw   (named by the two edges the
//                                                 pipe connects: n=up, e=right,
//                                                 s=down, w=left)
//   tail-up, tail-right, tail-down, tail-left    (dir = from the tail cell
//                                                 TOWARD its body neighbor)
//   food

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const TILE = 64;
const SHEET_COLS = 4;
const SHEET_ROWS = 4;

/** Part -> [col, row] placement, shared by every theme so the atlas layout is one source of truth. */
const LAYOUT = {
  'head-up': [0, 0],
  'head-right': [1, 0],
  'head-down': [2, 0],
  'head-left': [3, 0],
  'body-h': [0, 1],
  'body-v': [1, 1],
  'corner-ne': [2, 1],
  'corner-nw': [3, 1],
  'corner-se': [0, 2],
  'corner-sw': [1, 2],
  'tail-up': [2, 2],
  'tail-right': [3, 2],
  'tail-down': [0, 3],
  'tail-left': [1, 3],
  food: [2, 3],
  // [3, 3] intentionally left blank (transparent) — reserved for a future part.
};

const PART_NAMES = Object.keys(LAYOUT);

/** Wraps SVG body content in a fixed 64x64 tile with a transparent background. */
function tile(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">${inner}</svg>`;
}

/** Rotate a group of inner markup by degrees about the tile center. */
function rotateAbout(deg, inner) {
  const c = TILE / 2;
  return `<g transform="rotate(${deg} ${c} ${c})">${inner}</g>`;
}

// ---------------------------------------------------------------------------
// Theme 1: detailed-pixel — 8x8 logical-pixel grid upscaled crisp, nearest-
// neighbor feel. Every shape is built from an 8x8 "pixel" unit (unit = 8px at
// the 64px tile size), giving the deliberate blocky-but-detailed pixel-art
// look while still filling the tile edge-to-edge.
// ---------------------------------------------------------------------------

const pixelPalette = {
  bodyLight: '#8fe06a',
  bodyMid: '#5fb83f',
  bodyDark: '#3d8a28',
  scale: '#2c6b1a',
  headLight: '#a3ef82',
  eyeWhite: '#f2fff0',
  eyeBlack: '#12240a',
  tongue: '#e0453a',
  appleRed: '#e64030',
  appleDark: '#a82418',
  appleShine: '#ffb3ab',
  leaf: '#3d8a28',
};

const PX = TILE / 8; // one logical pixel = 8 device px

/** Emit a single 8x8-grid pixel rect (grid coords, not device px). */
function px(gx, gy, gw, gh, fill) {
  return `<rect x="${gx * PX}" y="${gy * PX}" width="${gw * PX}" height="${gh * PX}" fill="${fill}" shape-rendering="crispEdges" />`;
}

/** Diamond scale pattern used on every pixel-theme body/corner/tail tile. */
function pixelScalePattern() {
  return [
    px(1, 1, 2, 2, pixelPalette.scale),
    px(5, 1, 2, 2, pixelPalette.scale),
    px(1, 5, 2, 2, pixelPalette.scale),
    px(5, 5, 2, 2, pixelPalette.scale),
    px(3, 3, 2, 2, pixelPalette.scale),
  ].join('');
}

function pixelBodyBase() {
  // Gradient feel via banded fills: light band top-left, mid fill, dark band bottom-right.
  return [
    px(0, 0, 8, 8, pixelPalette.bodyMid),
    px(0, 0, 8, 2, pixelPalette.bodyLight),
    px(0, 6, 8, 2, pixelPalette.bodyDark),
    pixelScalePattern(),
  ].join('');
}

function pixelBodyH() {
  return tile(pixelBodyBase());
}
function pixelBodyV() {
  return tile(rotateAbout(90, pixelBodyBase()));
}

/**
 * Corner = quarter pipe on the 8x8 grid, connecting the north edge (column
 * 3-4, exiting the top) to the east edge (row 3-4, exiting the right) with a
 * blocky stepped bend — an explicit 8x8 boolean mask (1 = filled) rather than
 * layered rects, so the shape is unambiguous. Other corners rotate this by
 * 90s; corners are the only pixel-theme part that does NOT fill every cell
 * (the unfilled cells stay transparent, which is correct — a pipe bend has
 * an empty outer/inner triangle).
 */
// Body tiles fill their tile edge-to-edge (see pixelBodyBase), so a corner
// must read as the same thick pipe bending 90 degrees, not a thin band. This
// is a thick L: the whole top-right half-plus-a-step is filled (reaching
// both the north edge across columns 3-7 and the east edge across rows
// 0-4), with only the bottom-left outer triangle left empty (transparent) —
// nothing here touches the west or south edges, matching a north+east bend.
const CORNER_MASK_NE = [
  [0, 0, 0, 1, 1, 1, 1, 1],
  [0, 0, 0, 1, 1, 1, 1, 1],
  [0, 0, 0, 1, 1, 1, 1, 1],
  [0, 0, 0, 1, 1, 1, 1, 1],
  [0, 0, 0, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 1, 1],
];

function pixelCornerBase() {
  const cells = [];
  for (let gy = 0; gy < 8; gy += 1) {
    for (let gx = 0; gx < 8; gx += 1) {
      if (!CORNER_MASK_NE[gy][gx]) continue;
      const isEdge =
        !CORNER_MASK_NE[gy]?.[gx - 1] ||
        !CORNER_MASK_NE[gy]?.[gx + 1] ||
        !CORNER_MASK_NE[gy - 1]?.[gx] ||
        !CORNER_MASK_NE[gy + 1]?.[gx];
      const isScale = (gx === 3 && gy === 3) || (gx === 4 && gy === 4) || (gx === 5 && gy === 2);
      const fill = isScale ? pixelPalette.scale : isEdge ? pixelPalette.bodyLight : pixelPalette.bodyMid;
      cells.push(px(gx, gy, 1, 1, fill));
    }
  }
  return cells.join('');
}

function pixelCorner(rotationDeg) {
  return tile(rotateAbout(rotationDeg, pixelCornerBase()));
}

function pixelHeadBase() {
  // Faces up (north) by default; other directions rotate this whole tile.
  return [
    px(0, 1, 8, 7, pixelPalette.headLight),
    px(0, 1, 8, 2, pixelPalette.bodyLight),
    px(0, 6, 8, 2, pixelPalette.bodyDark),
    // eyes
    px(1, 2, 2, 2, pixelPalette.eyeWhite),
    px(5, 2, 2, 2, pixelPalette.eyeWhite),
    px(1, 3, 1, 1, pixelPalette.eyeBlack),
    px(6, 3, 1, 1, pixelPalette.eyeBlack),
    // thin forked tongue flicking up from the snout, fully inside the tile
    px(3, 0, 1, 1, pixelPalette.tongue),
    px(4, 0, 1, 1, pixelPalette.tongue),
    pixelScalePattern(),
  ].join('');
}

function pixelHead(rotationDeg) {
  return tile(rotateAbout(rotationDeg, pixelHeadBase()));
}

function pixelTailBase() {
  // Tapered tail tip: wide where it meets the body (bottom edge), narrowing
  // to a 2-pixel-wide point at the top — drawn as stepped pixel bands.
  return [
    px(1, 6, 6, 2, pixelPalette.bodyDark),
    px(1, 5, 6, 1, pixelPalette.bodyMid),
    px(2, 4, 4, 1, pixelPalette.bodyMid),
    px(3, 2, 2, 2, pixelPalette.bodyMid),
    px(3, 1, 2, 1, pixelPalette.bodyLight),
    px(1, 5, 6, 1, pixelPalette.bodyLight),
    px(3, 4, 2, 1, pixelPalette.scale),
  ].join('');
}

function pixelTail(rotationDeg) {
  return tile(rotateAbout(rotationDeg, pixelTailBase()));
}

function pixelFood() {
  return tile(
    [
      px(1, 2, 6, 5, pixelPalette.appleRed),
      px(1, 2, 6, 2, pixelPalette.appleShine),
      px(1, 5, 6, 2, pixelPalette.appleDark),
      px(2, 2, 1, 1, pixelPalette.appleShine),
      px(3, 0, 2, 2, pixelPalette.leaf),
    ].join(''),
  );
}

const detailedPixelParts = {
  'head-up': pixelHead(0),
  'head-right': pixelHead(90),
  'head-down': pixelHead(180),
  'head-left': pixelHead(270),
  'body-h': pixelBodyH(),
  'body-v': pixelBodyV(),
  'corner-ne': pixelCorner(0),
  'corner-se': pixelCorner(90),
  'corner-sw': pixelCorner(180),
  'corner-nw': pixelCorner(270),
  'tail-up': pixelTail(0),
  'tail-right': pixelTail(90),
  'tail-down': pixelTail(180),
  'tail-left': pixelTail(270),
  food: pixelFood(),
};

// ---------------------------------------------------------------------------
// Theme 2: cartoon — smooth rounded vector shapes, friendly big eyes, lime-to-
// forest gradient body with a lighter belly stripe, cute apple with leaf +
// shine highlight.
// ---------------------------------------------------------------------------

const cartoonIds = {
  bodyGrad: 'cartoonBodyGrad',
  headGrad: 'cartoonHeadGrad',
  appleGrad: 'cartoonAppleGrad',
};

function cartoonDefs() {
  return `<defs>
    <linearGradient id="${cartoonIds.bodyGrad}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a6e84f" />
      <stop offset="1" stop-color="#2f7d32" />
    </linearGradient>
    <linearGradient id="${cartoonIds.headGrad}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b9f066" />
      <stop offset="1" stop-color="#3c9142" />
    </linearGradient>
    <radialGradient id="${cartoonIds.appleGrad}" cx="0.35" cy="0.3" r="0.75">
      <stop offset="0" stop-color="#ff7a6e" />
      <stop offset="0.55" stop-color="#e8392f" />
      <stop offset="1" stop-color="#a8201a" />
    </radialGradient>
  </defs>`;
}

function cartoonBodyH() {
  return tile(`${cartoonDefs()}
    <rect x="1" y="10" width="62" height="44" rx="20" fill="url(#${cartoonIds.bodyGrad})" />
    <rect x="9" y="26" width="46" height="12" rx="6" fill="#e9fbc9" opacity="0.85" />
    <path d="M1,20 Q32,14 63,20" stroke="#ffffff" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.35" />
  `);
}

function cartoonBodyV() {
  return tile(rotateAbout(90, `${cartoonDefs()}
    <rect x="1" y="10" width="62" height="44" rx="20" fill="url(#${cartoonIds.bodyGrad})" />
    <rect x="9" y="26" width="46" height="12" rx="6" fill="#e9fbc9" opacity="0.85" />
    <path d="M1,20 Q32,14 63,20" stroke="#ffffff" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.35" />
  `));
}

function cartoonCornerBase() {
  // Quarter-pipe connecting north (top edge) + east (right edge): an annulus
  // sector centered on the tile's top-right corner point (64,0), outer edge
  // touching both the top and right edges of the tile, inner edge cut back
  // to leave the bend's inner curve. Anchor coordinates are chosen so the
  // shape provably reaches x=64 (east) along y in [2,62] and y=0 (north)
  // along x in [2,62].
  const cx = TILE; // 64
  const cy = 0;
  const outerR = 62;
  const innerR = 30;
  return `${cartoonDefs()}
    <path d="M ${cx - outerR},${cy} A ${outerR},${outerR} 0 0 1 ${cx},${cy + outerR}
             L ${cx},${cy + innerR} A ${innerR},${innerR} 0 0 0 ${cx - innerR},${cy}
             Z"
          fill="url(#${cartoonIds.bodyGrad})" />
    <path d="M ${cx - outerR + 6},${cy + 3} A ${outerR - 8},${outerR - 8} 0 0 1 ${cx - 3},${cy + outerR - 6}"
          stroke="#e9fbc9" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.85" />
  `;
}

function cartoonCorner(rotationDeg) {
  return tile(rotateAbout(rotationDeg, cartoonCornerBase()));
}

function cartoonHeadBase() {
  // Faces up. Big friendly eyes, small rounded snout notch at the top edge.
  return `${cartoonDefs()}
    <rect x="4" y="6" width="56" height="54" rx="26" fill="url(#${cartoonIds.headGrad})" />
    <ellipse cx="24" cy="26" rx="10" ry="11" fill="#ffffff" />
    <ellipse cx="42" cy="26" rx="10" ry="11" fill="#ffffff" />
    <circle cx="26" cy="28" r="4.5" fill="#1b2b12" />
    <circle cx="44" cy="28" r="4.5" fill="#1b2b12" />
    <circle cx="24" cy="26" r="1.6" fill="#ffffff" />
    <circle cx="42" cy="26" r="1.6" fill="#ffffff" />
    <path d="M28,46 Q32,50 36,46" stroke="#1b2b12" stroke-width="2.4" stroke-linecap="round" fill="none" />
    <path d="M30,8 Q32,2 34,8" stroke="#e2382b" stroke-width="3" stroke-linecap="round" fill="none" />
  `;
}

function cartoonHead(rotationDeg) {
  return tile(rotateAbout(rotationDeg, cartoonHeadBase()));
}

function cartoonTailBase() {
  // Clearly tapered teardrop: wide rounded base touching the bottom edge
  // (where the body neighbor connects) narrowing to a rounded point at the
  // top edge (pointing up, away from the body) — unlike a symmetric oval,
  // width strictly decreases from y=62 to y=2 so the direction reads at a
  // glance and each rotation looks distinct.
  return `${cartoonDefs()}
    <path d="M32,2
             C40,2 44,10 44,18
             C44,30 50,40 50,50
             C50,58 42,62 32,62
             C22,62 14,58 14,50
             C14,40 20,30 20,18
             C20,10 24,2 32,2 Z"
          fill="url(#${cartoonIds.bodyGrad})" />
    <path d="M32,10 C36,10 38,16 38,22 C38,32 41,38 41,46"
          stroke="#e9fbc9" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.8" />
  `;
}

function cartoonTail(rotationDeg) {
  return tile(rotateAbout(rotationDeg, cartoonTailBase()));
}

function cartoonFood() {
  return tile(`${cartoonDefs()}
    <ellipse cx="33" cy="37" rx="24" ry="22" fill="url(#${cartoonIds.appleGrad})" />
    <path d="M14,34 A20,22 0 0 1 33,15" stroke="#ff9c8f" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.6" />
    <ellipse cx="24" cy="27" rx="6" ry="4" fill="#ffffff" opacity="0.55" />
    <path d="M33,15 C33,8 29,5 29,5" stroke="#5a3a20" stroke-width="3.5" stroke-linecap="round" fill="none" />
    <path d="M33,10 C40,4 50,8 47,16 C42,20 34,17 33,10 Z" fill="#3d8a28" />
  `);
}

const cartoonParts = {
  'head-up': cartoonHead(0),
  'head-right': cartoonHead(90),
  'head-down': cartoonHead(180),
  'head-left': cartoonHead(270),
  'body-h': cartoonBodyH(),
  'body-v': cartoonBodyV(),
  'corner-ne': cartoonCorner(0),
  'corner-se': cartoonCorner(90),
  'corner-sw': cartoonCorner(180),
  'corner-nw': cartoonCorner(270),
  'tail-up': cartoonTail(0),
  'tail-right': cartoonTail(90),
  'tail-down': cartoonTail(180),
  'tail-left': cartoonTail(270),
  food: cartoonFood(),
};

// ---------------------------------------------------------------------------
// Theme 3: neon — dark bodies with glowing cyan/magenta edges (SVG blur/glow
// filters, rasterized by sharp), synthwave palette, food = glowing energy
// orb.
// ---------------------------------------------------------------------------

const neonIds = {
  glowSoft: 'neonGlowSoft',
  glowStrong: 'neonGlowStrong',
  bodyFill: 'neonBodyFill',
  orbGrad: 'neonOrbGrad',
};

function neonDefs() {
  return `<defs>
    <filter id="${neonIds.glowSoft}" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="2.4" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="${neonIds.glowStrong}" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="5" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <linearGradient id="${neonIds.bodyFill}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#161327" />
      <stop offset="1" stop-color="#241a3d" />
    </linearGradient>
    <radialGradient id="${neonIds.orbGrad}" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0" stop-color="#ffffff" />
      <stop offset="0.35" stop-color="#5ef0ff" />
      <stop offset="0.75" stop-color="#ff3ad1" />
      <stop offset="1" stop-color="#2a0a3d" />
    </radialGradient>
  </defs>`;
}

const neonCyan = '#4ff2ff';
const neonMagenta = '#ff3ad1';

function neonBodyH() {
  return tile(`${neonDefs()}
    <rect x="2" y="14" width="60" height="36" rx="16" fill="url(#${neonIds.bodyFill})" />
    <rect x="2" y="14" width="60" height="16" rx="8" fill="none" stroke="${neonCyan}" stroke-width="2.5" filter="url(#${neonIds.glowSoft})" opacity="0.9" />
    <rect x="2" y="34" width="60" height="16" rx="8" fill="none" stroke="${neonMagenta}" stroke-width="2.5" filter="url(#${neonIds.glowSoft})" opacity="0.9" />
    <rect x="2" y="14" width="60" height="36" rx="16" fill="none" stroke="${neonCyan}" stroke-width="1.5" opacity="0.7" />
  `);
}

function neonBodyV() {
  return tile(rotateAbout(90, `${neonDefs()}
    <rect x="2" y="14" width="60" height="36" rx="16" fill="url(#${neonIds.bodyFill})" />
    <rect x="2" y="14" width="60" height="16" rx="8" fill="none" stroke="${neonCyan}" stroke-width="2.5" filter="url(#${neonIds.glowSoft})" opacity="0.9" />
    <rect x="2" y="34" width="60" height="16" rx="8" fill="none" stroke="${neonMagenta}" stroke-width="2.5" filter="url(#${neonIds.glowSoft})" opacity="0.9" />
    <rect x="2" y="14" width="60" height="36" rx="16" fill="none" stroke="${neonCyan}" stroke-width="1.5" opacity="0.7" />
  `));
}

function neonCornerBase() {
  // Quarter pipe connecting north + east; outer edge glows cyan, inner edge magenta.
  return `${neonDefs()}
    <path d="M32,2 A46,46 0 0 1 62,32 L46,32 A30,30 0 0 0 32,18 Z" fill="url(#${neonIds.bodyFill})" />
    <path d="M32,18 L48,18 L48,32 L32,32 Z" fill="url(#${neonIds.bodyFill})" />
    <path d="M32,2 A46,46 0 0 1 62,32" fill="none" stroke="${neonCyan}" stroke-width="2.5" filter="url(#${neonIds.glowSoft})" opacity="0.95" />
    <path d="M32,18 A14,14 0 0 1 46,32" fill="none" stroke="${neonMagenta}" stroke-width="2.2" filter="url(#${neonIds.glowSoft})" opacity="0.9" />
  `;
}

function neonCorner(rotationDeg) {
  return tile(rotateAbout(rotationDeg, neonCornerBase()));
}

function neonHeadBase() {
  // Faces up. Angular visor-style "eyes" bar, glowing outline.
  return `${neonDefs()}
    <path d="M12,58 L12,26 C12,10 20,3 32,3 C44,3 52,10 52,26 L52,58 Z" fill="url(#${neonIds.bodyFill})" />
    <path d="M12,58 L12,26 C12,10 20,3 32,3 C44,3 52,10 52,26 L52,58"
          fill="none" stroke="${neonCyan}" stroke-width="2.6" filter="url(#${neonIds.glowStrong})" />
    <rect x="17" y="24" width="30" height="7" rx="3.5" fill="${neonMagenta}" filter="url(#${neonIds.glowStrong})" />
    <rect x="17" y="24" width="30" height="7" rx="3.5" fill="#ffffff" opacity="0.5" />
  `;
}

function neonHead(rotationDeg) {
  return tile(rotateAbout(rotationDeg, neonHeadBase()));
}

function neonTailBase() {
  // Tapered glowing tip pointing up, trailing "particle" dashes below.
  return `${neonDefs()}
    <path d="M32,4 C42,4 48,18 48,30 C48,44 41,54 32,54 C23,54 16,44 16,30 C16,18 22,4 32,4 Z"
          fill="url(#${neonIds.bodyFill})" />
    <path d="M32,4 C42,4 48,18 48,30 C48,44 41,54 32,54 C23,54 16,44 16,30 C16,18 22,4 32,4 Z"
          fill="none" stroke="${neonMagenta}" stroke-width="2.4" filter="url(#${neonIds.glowSoft})" opacity="0.95" />
    <circle cx="32" cy="59" r="2.2" fill="${neonCyan}" filter="url(#${neonIds.glowSoft})" opacity="0.85" />
    <circle cx="32" cy="52" r="1.4" fill="${neonCyan}" opacity="0.6" />
  `;
}

function neonTail(rotationDeg) {
  return tile(rotateAbout(rotationDeg, neonTailBase()));
}

function neonFood() {
  return tile(`${neonDefs()}
    <circle cx="32" cy="32" r="24" fill="url(#${neonIds.orbGrad})" filter="url(#${neonIds.glowStrong})" />
    <circle cx="32" cy="32" r="24" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.7" />
    <circle cx="32" cy="32" r="15" fill="none" stroke="${neonCyan}" stroke-width="1.2" opacity="0.6" />
  `);
}

const neonParts = {
  'head-up': neonHead(0),
  'head-right': neonHead(90),
  'head-down': neonHead(180),
  'head-left': neonHead(270),
  'body-h': neonBodyH(),
  'body-v': neonBodyV(),
  'corner-ne': neonCorner(0),
  'corner-se': neonCorner(90),
  'corner-sw': neonCorner(180),
  'corner-nw': neonCorner(270),
  'tail-up': neonTail(0),
  'tail-right': neonTail(90),
  'tail-down': neonTail(180),
  'tail-left': neonTail(270),
  food: neonFood(),
};

// ---------------------------------------------------------------------------
// Registry: theme id -> part name -> SVG source string.
// ---------------------------------------------------------------------------

const THEMES = {
  'detailed-pixel': detailedPixelParts,
  cartoon: cartoonParts,
  neon: neonParts,
};

function assertCompleteness(themeId, parts) {
  const missing = PART_NAMES.filter((name) => !(name in parts));
  if (missing.length > 0) {
    throw new Error(`Theme "${themeId}" is missing part(s): ${missing.join(', ')}`);
  }
  const extra = Object.keys(parts).filter((name) => !PART_NAMES.includes(name));
  if (extra.length > 0) {
    throw new Error(`Theme "${themeId}" has unexpected part(s) not in LAYOUT: ${extra.join(', ')}`);
  }
}

async function buildTheme(themeId, parts) {
  assertCompleteness(themeId, parts);

  const sourceDir = path.join(repoRoot, 'assets', 'sprites', themeId);
  const publicDir = path.join(repoRoot, 'public', 'assets', 'sprites', themeId);
  await mkdir(sourceDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });

  // 1. Write per-part authoring SVG sources for review/editing.
  for (const name of PART_NAMES) {
    const svgPath = path.join(sourceDir, `${name}.svg`);
    await writeFile(svgPath, parts[name], 'utf8');
  }

  // 2. Rasterize each part to a PNG buffer, then composite onto the sheet canvas
  //    at its pinned [col, row] tile position.
  const compositeLayers = [];
  for (const name of PART_NAMES) {
    const [col, row] = LAYOUT[name];
    const pngBuffer = await sharp(Buffer.from(parts[name]), { density: 288 })
      .resize(TILE, TILE)
      .png()
      .toBuffer();
    compositeLayers.push({ input: pngBuffer, left: col * TILE, top: row * TILE });
  }

  const sheetWidth = TILE * SHEET_COLS;
  const sheetHeight = TILE * SHEET_ROWS;
  const sheetPath = path.join(publicDir, 'sheet.png');
  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(compositeLayers)
    .png({ compressionLevel: 9 })
    .toFile(sheetPath);

  // 3. Write the pinned atlas JSON.
  const atlas = { tile: TILE, parts: LAYOUT };
  const jsonPath = path.join(publicDir, 'sheet.json');
  await writeFile(jsonPath, `${JSON.stringify(atlas, null, 2)}\n`, 'utf8');

  const meta = await sharp(sheetPath).metadata();
  return { sheetPath, jsonPath, sourceDir, width: meta.width, height: meta.height };
}

async function main() {
  const results = [];
  for (const [themeId, parts] of Object.entries(THEMES)) {
    const result = await buildTheme(themeId, parts);
    results.push({ themeId, ...result });
    console.log(
      `Wrote ${path.relative(repoRoot, result.sheetPath)} (${result.width}x${result.height}) ` +
        `+ ${path.relative(repoRoot, result.jsonPath)} + ${PART_NAMES.length} SVG sources in ${path.relative(repoRoot, result.sourceDir)}`,
    );
  }
  return results;
}

main().catch((error) => {
  console.error('Sprite generation failed:', error);
  process.exitCode = 1;
});
