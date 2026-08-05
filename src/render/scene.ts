/**
 * The world the tree stands in: sky, distant hills, and the soil cross-section.
 *
 * Draw order is strictly back to front — sky gradient, sun/moon, parallax hills,
 * then the ground below the soil line — and the tree is layered on top by the
 * renderer. The sky and hills are drawn in **screen space** (they are backdrop,
 * and the hills move at a fraction of the camera's speed for parallax), while
 * the soil is drawn in **world space** so its strata stay pinned to the depths
 * the roots grow through.
 */

import { Rng } from '../engine/rng';
import { daylight } from '../engine/timeOfDay';
import type { Camera } from './camera';
import { parseHex, rgbToCss, rgbaToCss, type Rgb } from './color';
import { HILL_BANDS, SOIL, SOIL_STRATA, WORLD, type SkyPalette } from './palette';

/** Horizontal spacing of hill silhouette samples, in CSS pixels. */
const HILL_STEP_PX = 14;

/** Speckles of grit scattered through the soil cross-section. */
const GRIT_COUNT = 260;
const GRIT_SEED = 0x50170;

interface Grit {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly alpha: number;
}

export class SceneRenderer {
  /** Pebbles are generated once and culled per frame. */
  private readonly grit: readonly Grit[] = createGrit();

  /**
   * Sky gradient from cloud level down to the soil line, plus the warm haze
   * band that sits just above the horizon.
   */
  drawSky(ctx: CanvasRenderingContext2D, camera: Camera, sky: SkyPalette, phase: number): void {
    const { width, height } = camera.viewport;
    const horizonY = camera.worldToScreen(0, 0).y;
    if (horizonY <= 0) return; // Fully underground: no sky on screen.

    const skyBottom = Math.min(height, horizonY);
    const cloudY = camera.worldToScreen(0, WORLD.cloudY).y;

    const gradient = ctx.createLinearGradient(0, cloudY, 0, horizonY);
    gradient.addColorStop(0, rgbToCss(sky.top));
    gradient.addColorStop(0.72, rgbToCss(sky.bottom));
    gradient.addColorStop(1, rgbToCss(sky.haze));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, skyBottom);

    this.drawCelestialBody(ctx, camera, phase, horizonY);

    // Haze thickens right at the horizon and fades upward.
    const hazeTop = horizonY - Math.min(height, 160 * camera.zoom);
    const haze = ctx.createLinearGradient(0, hazeTop, 0, horizonY);
    haze.addColorStop(0, rgbaToCss(sky.haze, 0));
    haze.addColorStop(1, rgbaToCss(sky.haze, 0.55));
    ctx.fillStyle = haze;
    ctx.fillRect(0, Math.max(0, hazeTop), width, skyBottom - Math.max(0, hazeTop));
  }

  /**
   * Distant hill bands. Reserved for the Old Growth forest silhouette that
   * prestige will populate — for now they are plain rolling crests that give
   * the canopy something to sit against.
   */
  drawHills(ctx: CanvasRenderingContext2D, camera: Camera, sky: SkyPalette): void {
    const { width, height } = camera.viewport;
    const horizonY = camera.worldToScreen(0, 0).y;
    if (horizonY <= 0) return;

    const center = camera.center;
    const zoom = camera.zoom;

    ctx.save();
    // Hills belong to the sky; never let them spill onto the soil cross-section.
    ctx.beginPath();
    ctx.rect(0, 0, width, Math.min(height, horizonY));
    ctx.clip();

    // Hills are filled down to the soil line so they always meet the ground.
    const fillBottom = Math.min(height, horizonY) + 2;

    for (const band of HILL_BANDS) {
      // Parallax: distant bands respond to camera movement only fractionally.
      // Clamped so panning up into the canopy cannot lift a ridge far off the
      // horizon and turn it into a wall behind the tree.
      const parallaxBase = height / 2 + center.y * zoom * band.parallax;
      const crest = band.height * zoom;
      const baseY = Math.max(parallaxBase, horizonY - crest * 0.5);

      ctx.fillStyle = rgbToCss(sky[band.tone]);
      ctx.beginPath();
      ctx.moveTo(0, fillBottom);
      for (let x = 0; x <= width + HILL_STEP_PX; x += HILL_STEP_PX) {
        // Band-space x: world units, translated at the parallax rate.
        const bandX = (x - width / 2) / zoom + center.x * band.parallax;
        const wave =
          Math.sin((bandX / band.wavelength) * Math.PI * 2 + band.phase) * 0.62 +
          Math.sin((bandX / (band.wavelength * 0.41)) * Math.PI * 2 + band.phase * 1.7) * 0.38;
        ctx.lineTo(x, baseY - (0.55 + 0.45 * wave) * crest);
      }
      ctx.lineTo(width + HILL_STEP_PX, fillBottom);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Soil cross-section below `y = 0`. Called with the camera transform applied,
   * so all coordinates here are world units.
   */
  drawSoil(ctx: CanvasRenderingContext2D, camera: Camera, ambient: Rgb): void {
    const view = camera.visibleWorldRect(8);
    if (view.minY >= 0) return; // Nothing underground on screen.

    const left = view.minX;
    const width = view.maxX - view.minX;
    const floor = Math.min(view.minY, WORLD.bedrockY) - 200;
    const ceiling = Math.min(view.maxY, 0);

    for (let i = 0; i < SOIL_STRATA.length; i += 1) {
      const top = Math.min(SOIL_STRATA[i].topY, 0);
      const bottom = i + 1 < SOIL_STRATA.length ? SOIL_STRATA[i + 1].topY : floor;
      // Skip bands entirely above or below the viewport.
      if (bottom > ceiling || top < view.minY) continue;

      ctx.fillStyle = tintHex(SOIL_STRATA[i].color, ambient);
      ctx.fillRect(left, bottom, width, top - bottom);
    }

    // Grit and pebbles, only those inside the viewport.
    ctx.fillStyle = tintHex(SOIL.grit, ambient);
    for (const pebble of this.grit) {
      if (pebble.x < view.minX || pebble.x > view.maxX) continue;
      if (pebble.y < view.minY || pebble.y > view.maxY) continue;
      ctx.globalAlpha = pebble.alpha;
      ctx.beginPath();
      ctx.arc(pebble.x, pebble.y, pebble.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Soil line: a dark lip with a thin band of turf on top.
    if (view.maxY > 0) {
      ctx.fillStyle = tintHex(SOIL.surfaceShadow, ambient);
      ctx.fillRect(left, -7, width, 7);
      ctx.fillStyle = tintHex(SOIL.surface, ambient);
      ctx.fillRect(left, 0, width, 3);
    }
  }

  /** A soft sun by day, a paler moon by night, arcing over the horizon. */
  private drawCelestialBody(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    phase: number,
    horizonY: number,
  ): void {
    const { width, height } = camera.viewport;
    const light = daylight(phase);
    const isDay = light > 0.02;

    // Day runs 0.25 → 0.75; the night arc is the same path half a cycle later.
    const progress = isDay ? (phase - 0.25) / 0.5 : ((phase + 0.25) % 1) / 0.5;
    if (progress < 0 || progress > 1) return;

    const x = width * (0.16 + 0.68 * progress);
    const y = horizonY - Math.sin(progress * Math.PI) * height * 0.5;
    const radius = isDay ? 34 : 24;
    const color: Rgb = isDay ? { r: 255, g: 236, b: 178 } : { r: 226, g: 232, b: 246 };

    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 4);
    glow.addColorStop(0, rgbaToCss(color, isDay ? 0.95 : 0.75));
    glow.addColorStop(0.24, rgbaToCss(color, isDay ? 0.42 : 0.26));
    glow.addColorStop(1, rgbaToCss(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgbaToCss(color, isDay ? 1 : 0.9);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Deterministic scatter of pebbles through the soil column. */
function createGrit(): Grit[] {
  const rng = new Rng(GRIT_SEED);
  const grit: Grit[] = [];
  for (let i = 0; i < GRIT_COUNT; i += 1) {
    grit.push({
      x: rng.range(-WORLD.halfWidth - 400, WORLD.halfWidth + 400),
      y: rng.range(WORLD.bedrockY, -8),
      r: rng.range(1, 3.4),
      alpha: rng.range(0.12, 0.4),
    });
  }
  return grit;
}

/**
 * Tint a soil color by the ambient light. The underground responds to day and
 * night only weakly — it is lit by its own cross-section lamp, not the sky.
 */
function tintHex(hex: string, ambient: Rgb): string {
  const rgb = parseHex(hex);
  const k = 0.55;
  return rgbToCss({
    r: (rgb.r * (ambient.r * k + 255 * (1 - k))) / 255,
    g: (rgb.g * (ambient.g * k + 255 * (1 - k))) / 255,
    b: (rgb.b * (ambient.b * k + 255 * (1 - k))) / 255,
  });
}
