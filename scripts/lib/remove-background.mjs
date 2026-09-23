// Removes a flat background color from an RGBA buffer using an edge
// connected flood fill.
//
// A plain color-distance key treats every pixel close enough to the
// background color as background, even a near-white region fully enclosed
// by the subject (for example the white of a fish's eye inside its blue
// body). That kind of region should stay opaque.
//
// The fix: start the fill at the four image borders and walk outward across
// pixels whose color is within OUTER distance of the background color. Only
// pixels the fill actually reaches are background; everything else keeps
// its full opacity no matter how close its color is to the background,
// because it is not connected to the border.
//
// Pixels the fill reaches still get the soft alpha ramp between INNER and
// OUTER so anti-aliased edges stay smooth; the caller is expected to
// decontaminate the color of any pixel left with partial alpha.

/**
 * @param {Buffer|Uint8Array} rgba RGBA pixel data, 4 bytes per pixel, alpha
 *   channel mutated in place.
 * @param {number} width
 * @param {number} height
 * @param {[number, number, number]} bg background color as [r, g, b].
 * @param {{ inner: number, outer: number }} tolerance distance (in RGB
 *   space) from the background color below which a fill-reached pixel is
 *   fully transparent (inner) or above which it is fully opaque (outer).
 * @returns {Uint8Array} 1 for every pixel the flood fill reached, 0 otherwise.
 */
export function removeBackground(rgba, width, height, bg, { inner, outer }) {
  const total = width * height;
  const visited = new Uint8Array(total);
  // An iterative stack instead of recursion: a 1024x1024 image has 1M
  // pixels, more than enough to overflow the call stack if this were
  // written as a recursive flood fill.
  const stack = new Int32Array(total);
  let stackSize = 0;

  const distAt = (idx) => {
    const o = idx * 4;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    return Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
  };

  const tryVisit = (idx) => {
    if (visited[idx]) return;
    if (distAt(idx) > outer) return;
    visited[idx] = 1;
    stack[stackSize++] = idx;
  };

  // Seed the fill from every border pixel.
  for (let x = 0; x < width; x++) {
    tryVisit(x);
    tryVisit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    tryVisit(y * width);
    tryVisit(y * width + (width - 1));
  }

  // Iterative 4-connected flood fill over background-tolerance pixels.
  while (stackSize > 0) {
    const idx = stack[--stackSize];
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) tryVisit(idx - 1);
    if (x < width - 1) tryVisit(idx + 1);
    if (y > 0) tryVisit(idx - width);
    if (y < height - 1) tryVisit(idx + width);
  }

  // Ramp alpha only for pixels the fill reached. Anything it did not reach,
  // including a near-background region enclosed by the subject, keeps
  // whatever alpha the caller already set (normally fully opaque).
  for (let idx = 0; idx < total; idx++) {
    if (!visited[idx]) continue;
    const d = distAt(idx);
    const alpha = Math.max(0, Math.min(1, (d - inner) / (outer - inner)));
    rgba[idx * 4 + 3] = Math.round(alpha * 255);
  }

  return visited;
}
