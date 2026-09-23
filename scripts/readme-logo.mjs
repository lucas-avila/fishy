import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { removeBackground } from "./lib/remove-background.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "assets", "logo_fishy.png");
const outDir = path.join(root, "assets");
mkdirSync(outDir, { recursive: true });

const OUT_WIDTH = 480;
const MARGIN = 16;
const DARK_REPLACEMENT = [0xe7, 0xeb, 0xea]; // #e7ebea, legible on GitHub dark theme

// Same background-keying approach as scripts/icons.mjs: distance from the
// corner-sampled background color, ramping alpha over a soft band so
// anti-aliased edges don't leave a halo, with color decontamination for
// partially-transparent pixels.
const INNER = 12;
const OUTER = 45;
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h, channels: ch } = info;

function rgbAt(x, y) {
  const i = (y * w + x) * ch;
  return [data[i], data[i + 1], data[i + 2]];
}

const corners = [rgbAt(0, 0), rgbAt(w - 1, 0), rgbAt(0, h - 1), rgbAt(w - 1, h - 1)];
const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, p) => s + p[c], 0) / 4));

function distFromBg(x, y) {
  const [r, g, b] = rgbAt(x, y);
  return Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
}

// The source has the fish mark and the "fishy" wordmark stacked with a gap
// of background between them. Find both content bands so the wordmark band
// can be recolored for the dark variant without touching the fish's (also
// dark-colored) eye and eyebrow.
const rowHasContent = new Array(h).fill(false);
for (let y = 0; y < h; y++) {
  let count = 0;
  for (let x = 0; x < w; x++) if (distFromBg(x, y) > OUTER) count++;
  rowHasContent[y] = count > 2;
}
const bands = [];
let bandStart = -1;
for (let y = 0; y < h; y++) {
  if (rowHasContent[y] && bandStart === -1) bandStart = y;
  if (!rowHasContent[y] && bandStart !== -1) {
    bands.push([bandStart, y - 1]);
    bandStart = -1;
  }
}
if (bandStart !== -1) bands.push([bandStart, h - 1]);
if (bands.length < 2) throw new Error(`expected fish + wordmark bands, found ${bands.length}`);
const [, wordmarkBottom] = bands[bands.length - 1];
const [wordmarkTop] = bands[bands.length - 1];

let minX = w;
let maxX = 0;
let minY = h;
let maxY = 0;
for (const [top, bottom] of bands) {
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < w; x++) {
      if (distFromBg(x, y) > OUTER) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
}

function isWordmarkNavy(r, g, b) {
  return r < 70 && g < 80 && b < 110;
}

// Build an RGBA buffer, starting fully opaque, then let the edge-connected
// flood fill decide which pixels are actually background: only pixels
// reachable from the image borders through background-tolerance colors are
// keyed to transparent, so an enclosed near-background region (the fish's
// eye white) is left alone even though its color also matches the key.
const base = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    const o = (y * w + x) * 4;
    base[o] = data[i];
    base[o + 1] = data[i + 1];
    base[o + 2] = data[i + 2];
    base[o + 3] = 255;
  }
}
removeBackground(base, w, h, bg, { inner: INNER, outer: OUTER });

// Decontaminate the color of pixels the fill left partially transparent, so
// anti-aliased edges don't halo. Produces both the light (unmodified colors)
// and dark (wordmark recolored) variants from the same alpha mask so their
// edges match exactly.
const light = Buffer.alloc(w * h * 4);
const dark = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
  const inWordmarkBand = y >= wordmarkTop && y <= wordmarkBottom;
  for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    let r = base[o];
    let g = base[o + 1];
    let b = base[o + 2];
    const a = base[o + 3];
    if (a > 0 && a < 255) {
      const alpha = a / 255;
      r = clamp255(bg[0] + (r - bg[0]) / alpha);
      g = clamp255(bg[1] + (g - bg[1]) / alpha);
      b = clamp255(bg[2] + (b - bg[2]) / alpha);
    }

    light[o] = r;
    light[o + 1] = g;
    light[o + 2] = b;
    light[o + 3] = a;

    const recolor = inWordmarkBand && a > 0 && isWordmarkNavy(r, g, b);
    dark[o] = recolor ? DARK_REPLACEMENT[0] : r;
    dark[o + 1] = recolor ? DARK_REPLACEMENT[1] : g;
    dark[o + 2] = recolor ? DARK_REPLACEMENT[2] : b;
    dark[o + 3] = a;
  }
}

const left = Math.max(0, minX - MARGIN);
const top = Math.max(0, minY - MARGIN);
const right = Math.min(w, maxX + MARGIN);
const bottom = Math.min(h, maxY + MARGIN);
const cropRegion = { left, top, width: right - left, height: bottom - top };

async function finish(rgba, outPath) {
  const png = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract(cropRegion)
    .resize({ width: OUT_WIDTH })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  writeFileSync(outPath, png);
  const meta = await sharp(png).metadata();
  console.log(
    `wrote ${path.relative(root, outPath)} (${meta.width}x${meta.height}, ${(png.length / 1024).toFixed(1)} KB)`
  );
}

await finish(light, path.join(outDir, "readme-logo.png"));
await finish(dark, path.join(outDir, "readme-logo-dark.png"));
