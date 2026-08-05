/**
 * Cozy, warm botanical palette plus the world's vertical extents.
 *
 * The sky is a cyclic keyframe track sampled by the engine's day phase, so the
 * gradient lerps continuously from night through dawn, noon, dusk, and back.
 * Species-specific bark and leaf colors live in `/src/content/species.ts`; this
 * file owns the environment.
 */

import { mixRgb, parseHex, type ColorKeyframe, type Rgb } from './color';

/** Colors that make up the sky and the distant background at one time of day. */
export interface SkyPalette {
  /** Top of the sky gradient. */
  readonly top: Rgb;
  /** Bottom of the sky gradient, at the soil line. */
  readonly bottom: Rgb;
  /** Warm haze band just above the horizon. */
  readonly haze: Rgb;
  /** Farthest hill silhouette. */
  readonly hillFar: Rgb;
  /** Nearest hill silhouette. */
  readonly hillNear: Rgb;
  /** Ambient light multiplied into the tree so it dims at night. */
  readonly ambient: Rgb;
}

function sky(
  top: string,
  bottom: string,
  haze: string,
  hillFar: string,
  hillNear: string,
  ambient: string,
): SkyPalette {
  return {
    top: parseHex(top),
    bottom: parseHex(bottom),
    haze: parseHex(haze),
    hillFar: parseHex(hillFar),
    hillNear: parseHex(hillNear),
    ambient: parseHex(ambient),
  };
}

/**
 * Sky keyframes across one day. `0` is midnight, `0.25` sunrise, `0.5` noon,
 * `0.75` sunset; sampling wraps cyclically between the last and first entries.
 */
export const SKY_TRACK: readonly ColorKeyframe<SkyPalette>[] = [
  // Midnight.
  { at: 0.0, value: sky('#0d1630', '#243149', '#33405c', '#1b2437', '#151d2d', '#5b6480') },
  // First light.
  { at: 0.2, value: sky('#2c3560', '#7d6483', '#c48a76', '#3a3a55', '#2a2b40', '#8e8296') },
  // Sunrise.
  { at: 0.28, value: sky('#6d8fc0', '#e6b184', '#f6cf9c', '#7f8ba2', '#5f6d80', '#d8c0a4') },
  // Mid-morning.
  { at: 0.38, value: sky('#8fc6e8', '#dbead4', '#eef3dc', '#a8bcc4', '#88a08c', '#fbf3e2') },
  // Noon.
  { at: 0.5, value: sky('#7bbfe6', '#e7f0d8', '#f4f7e6', '#a3bcc6', '#84a08d', '#ffffff') },
  // Afternoon.
  { at: 0.66, value: sky('#8bc3e0', '#f0e8cd', '#f8ecd3', '#a9b8b8', '#8a9c85', '#fdf1d9') },
  // Sunset.
  { at: 0.78, value: sky('#5e7cae', '#e8a06d', '#f5c489', '#7a7f92', '#5a6172', '#e6bd9a') },
  // Dusk.
  { at: 0.86, value: sky('#2a3560', '#7b5d78', '#b87f74', '#3c3d59', '#2b2c42', '#8c8198') },
] as const;

/** Blend two sky palettes channel-wise. */
export function mixSky(a: SkyPalette, b: SkyPalette, t: number): SkyPalette {
  return {
    top: mixRgb(a.top, b.top, t),
    bottom: mixRgb(a.bottom, b.bottom, t),
    haze: mixRgb(a.haze, b.haze, t),
    hillFar: mixRgb(a.hillFar, b.hillFar, t),
    hillNear: mixRgb(a.hillNear, b.hillNear, t),
    ambient: mixRgb(a.ambient, b.ambient, t),
  };
}

/** A horizontal band of soil in the cross-section below the surface. */
export interface SoilStratum {
  /** World y at the top of the band (`0` is the soil line, negative is down). */
  readonly topY: number;
  readonly color: string;
}

/**
 * Soil cross-section from the surface down to bedrock. Bands are drawn top to
 * bottom; the last one continues to the bottom of the world.
 */
export const SOIL_STRATA: readonly SoilStratum[] = [
  { topY: 0, color: '#4a3524' },
  { topY: -46, color: '#5c4029' },
  { topY: -170, color: '#6a4a2f' },
  { topY: -310, color: '#5a4331' },
  { topY: -450, color: '#463a30' },
  { topY: -560, color: '#39332e' },
] as const;

export const SOIL = {
  /** Thin grassy lip drawn along the soil line. */
  surface: '#7d8f4b',
  /** Dark line separating air from ground. */
  surfaceShadow: '#3b2a1c',
  /** Pebbles and grit speckled through the cross-section. */
  grit: '#8a7358',
} as const;

/** Vertical extents the camera is allowed to travel between. */
export const WORLD = {
  /** Cloud level: the highest world y the camera may show. */
  cloudY: 900,
  /** Bedrock: the lowest world y the camera may show. */
  bedrockY: -640,
  /** Horizontal travel is clamped to ±this around the trunk. */
  halfWidth: 700,
} as const;

/** Camera zoom limits. */
export const ZOOM = {
  min: 0.5,
  max: 2.0,
} as const;

/** Distant hill bands, reserved for the future Old Growth forest silhouette. */
export interface HillBand {
  /** Parallax factor: `0` is painted on the sky, `1` moves with the world. */
  readonly parallax: number;
  /** Crest height above the soil line, in screen pixels at parallax scale. */
  readonly height: number;
  /** Horizontal wavelength of the crests, in world units. */
  readonly wavelength: number;
  /** Phase offset so bands do not line up. */
  readonly phase: number;
  /** Which sky-palette silhouette color to use. */
  readonly tone: 'hillFar' | 'hillNear';
}

export const HILL_BANDS: readonly HillBand[] = [
  { parallax: 0.14, height: 82, wavelength: 620, phase: 0.0, tone: 'hillFar' },
  { parallax: 0.26, height: 54, wavelength: 430, phase: 1.7, tone: 'hillNear' },
] as const;
