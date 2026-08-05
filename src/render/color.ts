/**
 * Color helpers for the canvas renderer.
 *
 * Colors are authored as hex strings in the palette and content data; the
 * renderer parses them once, interpolates in RGB, and hands CSS strings back to
 * the canvas. Parsed results are memoised because sky lerps run every frame.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const parseCache = new Map<string, Rgb>();

/** Parse `#rgb` / `#rrggbb` into channel values in `[0, 255]`. */
export function parseHex(hex: string): Rgb {
  const cached = parseCache.get(hex);
  if (cached) return cached;

  const text = hex.trim().replace(/^#/, '');
  const full =
    text.length === 3
      ? text
          .split('')
          .map((c) => c + c)
          .join('')
      : text;

  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }

  const value = Number.parseInt(full, 16);
  const rgb: Rgb = {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
  parseCache.set(hex, rgb);
  return rgb;
}

/** `rgb(r, g, b)` string, channels rounded and clamped. */
export function rgbToCss(color: Rgb): string {
  const channel = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  return `rgb(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)})`;
}

/** `rgba(r, g, b, a)` string. */
export function rgbaToCss(color: Rgb, alpha: number): string {
  const channel = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)}, ${a})`;
}

/** Linear RGB interpolation between two colors. `t` is clamped to `[0, 1]`. */
export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
}

/** Convenience: interpolate two hex colors and return a CSS string. */
export function mixHex(a: string, b: string, t: number): string {
  return rgbToCss(mixRgb(parseHex(a), parseHex(b), t));
}

/** Scale a color toward black (`amount < 1`) or white (`amount > 1`). */
export function shade(color: Rgb, amount: number): Rgb {
  if (amount <= 1) {
    return { r: color.r * amount, g: color.g * amount, b: color.b * amount };
  }
  const t = Math.min(1, amount - 1);
  return mixRgb(color, { r: 255, g: 255, b: 255 }, t);
}

/** A color stop on a cyclic keyframe track (e.g. the sky through a day). */
export interface ColorKeyframe<T> {
  /** Position in the cycle, in `[0, 1)`. Keyframes must be sorted ascending. */
  readonly at: number;
  readonly value: T;
}

/**
 * Sample a **cyclic** keyframe track at `phase`, blending the two surrounding
 * keyframes. Wrapping past the last keyframe interpolates back to the first, so
 * midnight → sunrise is continuous.
 */
export function sampleKeyframes<T>(
  track: readonly ColorKeyframe<T>[],
  phase: number,
  blend: (a: T, b: T, t: number) => T,
): T {
  if (track.length === 0) {
    throw new Error('Keyframe track is empty');
  }
  if (track.length === 1) return track[0].value;

  const p = ((phase % 1) + 1) % 1;

  let index = -1;
  for (let i = 0; i < track.length; i += 1) {
    if (track[i].at <= p) index = i;
    else break;
  }

  // Before the first keyframe: blend from the last one, wrapping across zero.
  const from = index === -1 ? track[track.length - 1] : track[index];
  const to = index === -1 ? track[0] : track[(index + 1) % track.length];

  const fromAt = index === -1 ? from.at - 1 : from.at;
  const toAt = to.at <= fromAt ? to.at + 1 : to.at;
  const span = toAt - fromAt;
  const t = span === 0 ? 0 : (p - fromAt) / span;

  return blend(from.value, to.value, t);
}
