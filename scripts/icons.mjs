import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { removeBackground } from "./lib/remove-background.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "assets", "logo_fishy.png");
const iconsDir = path.join(root, "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// Distance (in RGB space) from the background color at which a pixel is
// treated as fully transparent (below INNER) or fully opaque (above OUTER).
// Between the two, alpha ramps linearly so anti-aliased edges stay soft.
const INNER = 12;
const OUTER = 45;
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h, channels: ch } = info;

function rgbAt(x, y) {
  const i = (y * w + x) * ch;
  return [data[i], data[i + 1], data[i + 2]];
}

// Background color: average of the four corners.
const corners = [rgbAt(0, 0), rgbAt(w - 1, 0), rgbAt(0, h - 1), rgbAt(w - 1, h - 1)];
const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, p) => s + p[c], 0) / 4));

function distFromBg(x, y) {
  const [r, g, b] = rgbAt(x, y);
  return Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
}

// The source has the fish mark on top and the "fishy" wordmark below it,
// separated by a gap of background. Find the first run of content rows:
// that's the fish, which is all we want here.
const rowHasContent = new Array(h).fill(false);
for (let y = 0; y < h; y++) {
  let count = 0;
  for (let x = 0; x < w; x++) if (distFromBg(x, y) > OUTER) count++;
  rowHasContent[y] = count > 2;
}
let fishTop = -1;
let fishBottom = -1;
for (let y = 0; y < h; y++) {
  if (rowHasContent[y]) {
    if (fishTop === -1) fishTop = y;
    fishBottom = y;
  } else if (fishTop !== -1 && y - fishBottom > 10) {
    break;
  }
}

let minX = w;
let maxX = 0;
for (let y = fishTop; y <= fishBottom; y++) {
  for (let x = 0; x < w; x++) {
    if (distFromBg(x, y) > OUTER) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
}

// Build an RGBA buffer, starting fully opaque, then let the edge-connected
// flood fill decide which pixels are actually background: only pixels
// reachable from the image borders through background-tolerance colors are
// keyed to transparent, so an enclosed near-background region (the fish's
// eye white) is left alone even though its color also matches the key.
const rgba = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    const o = (y * w + x) * 4;
    rgba[o] = data[i];
    rgba[o + 1] = data[i + 1];
    rgba[o + 2] = data[i + 2];
    rgba[o + 3] = 255;
  }
}
removeBackground(rgba, w, h, bg, { inner: INNER, outer: OUTER });

// Decontaminate the color of pixels the fill left partially transparent, so
// anti-aliased edges don't halo.
for (let idx = 0; idx < w * h; idx++) {
  const o = idx * 4;
  const a = rgba[o + 3];
  if (a > 0 && a < 255) {
    const alpha = a / 255;
    rgba[o] = clamp255(bg[0] + (rgba[o] - bg[0]) / alpha);
    rgba[o + 1] = clamp255(bg[1] + (rgba[o + 1] - bg[1]) / alpha);
    rgba[o + 2] = clamp255(bg[2] + (rgba[o + 2] - bg[2]) / alpha);
  }
}

const margin = 10;
const left = Math.max(0, minX - margin);
const top = Math.max(0, fishTop - margin);
const right = Math.min(w, maxX + margin);
const bottom = Math.min(h, fishBottom + margin);

const extracted = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
  .extract({ left, top, width: right - left, height: bottom - top })
  .png()
  .toBuffer();
const trimmed = await sharp(extracted).trim({ threshold: 10 }).toBuffer();

async function square(size) {
  const inner = Math.round(size * 0.84);
  const resized = await sharp(trimmed)
    .resize({ width: inner, height: inner, fit: "inside" })
    .toBuffer();
  const meta = await sharp(resized).metadata();
  const left = Math.round((size - meta.width) / 2);
  const top = Math.round((size - meta.height) / 2);
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

const logoPng = await square(512);
writeFileSync(path.join(root, "public", "logo.png"), logoPng);
console.log(`wrote public/logo.png (512x512, ${(logoPng.length / 1024).toFixed(1)} KB)`);

for (const size of [16, 48, 128]) {
  const png = await square(size);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  writeFileSync(outPath, png);
  console.log(`wrote ${path.relative(root, outPath)} (${size}x${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}
