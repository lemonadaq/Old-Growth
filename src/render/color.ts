/**
 * Colour blending for the sky and the hills.
 *
 * The palette is authored as hex strings because that is how colours are read
 * and edited; blending needs channels. These helpers convert between the two
 * and nothing else — no colour space cleverness, since the sky keyframes are
 * spaced closely enough that plain RGB interpolation shows no banding.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Parse `#rgb` or `#rrggbb` into channels. Throws on anything else. */
export function parseHex(hex: string): Rgb {
  const body = hex.startsWith('#') ? hex.slice(1) : hex;
  const full =
    body.length === 3
      ? body
          .split('')
          .map((c) => c + c)
          .join('')
      : body;

  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Channels back to a canvas-ready `rgb(...)` string. */
export function toCss({ r, g, b }: Rgb): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** `rgb(12, 34, 56)`, as {@link toCss} writes them. */
const RGB_PATTERN = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/;

/**
 * Parse either notation into channels.
 *
 * Hex is how the palette is authored; `rgb(...)` is what {@link toCss} produces,
 * and therefore what a colour that has *already* been blended once looks like.
 * Accepting both is what lets casts compose — the season tints the sky and then
 * the weather tints that, with neither having to know it went second.
 */
export function parseColor(color: string): Rgb {
  const rgb = RGB_PATTERN.exec(color.trim());
  if (!rgb) return parseHex(color);
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
}

/** Blend two colours, `t` clamped to `[0, 1]`. `t = 0` is `a`. */
export function lerpColor(a: string, b: string, t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const from = parseColor(a);
  const to = parseColor(b);
  return toCss({
    r: from.r + (to.r - from.r) * clamped,
    g: from.g + (to.g - from.g) * clamped,
    b: from.b + (to.b - from.b) * clamped,
  });
}

/**
 * A colour the world is being dragged toward, and how far.
 *
 * Seasons and weather both work this way rather than by supplying art of their
 * own: October is the same tree as June with a cast over it, and a cast composes
 * with the next one.
 */
export interface ColorCast {
  readonly color: string;
  /** How far toward `color` to drag, in `[0, 1]`. */
  readonly strength: number;
}

/** Apply casts to a base colour, in order. Empty and zero-strength casts are free. */
export function castColor(base: string, casts: readonly ColorCast[]): string {
  let color = base;
  for (const cast of casts) {
    if (cast.strength <= 0) continue;
    color = lerpColor(color, cast.color, cast.strength);
  }
  return color;
}
