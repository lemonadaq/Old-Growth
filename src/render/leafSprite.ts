/**
 * Cached soft-circle sprites for leaf clusters.
 *
 * A canopy can hold hundreds of blobs, and building a `createRadialGradient` per
 * blob per frame is the easiest way to lose 60fps. Instead each distinct color
 * gets a sprite, built lazily and reused for the rest of the session; drawing a
 * blob is then one `drawImage`.
 *
 * Sprites come in a few sizes (a hand-rolled mip chain). Blitting a 128px sprite
 * down to a 40px blob makes the rasteriser resample the whole thing on every
 * blob of every frame, so callers pass the size they actually need and get the
 * smallest sprite that covers it.
 */

import { rgbaToCss, type Rgb } from './color';

/** Available sprite resolutions, ascending. The largest covers 2× zoom. */
const SPRITE_SIZES = [32, 64, 128, 256] as const;

/**
 * Cache ceiling. Only a handful of sprites are live at once (one per leaf tone
 * per size), but the ambient light shifts through the day and mints new colors,
 * so the oldest entries are evicted rather than accumulating all session.
 */
const MAX_SPRITES = 24;

const cache = new Map<string, HTMLCanvasElement>();

/** The smallest cached resolution that covers `diameterPx` device pixels. */
function sizeFor(diameterPx: number): number {
  for (const size of SPRITE_SIZES) {
    if (size >= diameterPx) return size;
  }
  return SPRITE_SIZES[SPRITE_SIZES.length - 1];
}

/**
 * A soft-edged filled circle in `color`, at the smallest resolution that covers
 * `diameterPx` device pixels. Returns `null` when there is no DOM to build
 * sprites with (e.g. under Node in tests), so callers can fall back to an arc.
 */
export function softCircleSprite(
  key: string,
  color: Rgb,
  diameterPx: number,
): HTMLCanvasElement | null {
  const size = sizeFor(diameterPx);
  const sizedKey = `${key}#${size}`;

  const cached = cache.get(sizedKey);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  // Solid core with a quick, soft falloff: reads as a leafy mass rather than a
  // blurry dot, and overlapping blobs blend into one canopy.
  gradient.addColorStop(0, rgbaToCss(color, 1));
  gradient.addColorStop(0.72, rgbaToCss(color, 0.98));
  gradient.addColorStop(0.9, rgbaToCss(color, 0.62));
  gradient.addColorStop(1, rgbaToCss(color, 0));

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  if (cache.size >= MAX_SPRITES) {
    // Map iterates in insertion order, so the first key is the oldest.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(sizedKey, canvas);
  return canvas;
}

/** Drop every cached sprite. Only needed if palettes are swapped at runtime. */
export function clearSpriteCache(): void {
  cache.clear();
}
