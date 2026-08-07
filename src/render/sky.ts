import { BEDROCK_Y, CLOUD_LEVEL_Y, type Viewport } from '../engine/camera';
import type { DayCycle } from '../engine/daylight';
import type { TreeLayout } from '../engine/tree';
import { lerpColor } from './color';
import { PALETTE, SKY_KEYFRAMES, type SkyColors } from './palette';

/**
 * The world behind the tree: sky, distant hills, and the soil cross-section.
 *
 * Everything here is drawn relative to the *projected* ground line rather than
 * a fixed fraction of the canvas, because the camera moves: pan to the roots
 * and the horizon has to leave the top of the screen like a real horizon does.
 */

/** The sky gradient at a given point in the day. */
export function skyColors(t: number): SkyColors {
  const wrapped = ((t % 1) + 1) % 1;

  for (let i = 1; i < SKY_KEYFRAMES.length; i += 1) {
    const previous = SKY_KEYFRAMES[i - 1];
    const next = SKY_KEYFRAMES[i];
    if (wrapped > next.at) continue;

    const span = next.at - previous.at;
    const local = span === 0 ? 0 : (wrapped - previous.at) / span;
    return {
      top: lerpColor(previous.top, next.top, local),
      bottom: lerpColor(previous.bottom, next.bottom, local),
    };
  }

  const last = SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1];
  return { top: last.top, bottom: last.bottom };
}

/** How far each hill band lags the camera. 0 would pin it to the tree. */
const HILL_PARALLAX = [0.28, 0.46] as const;

/** Crest height of each band, as a fraction of the canvas height. */
const HILL_HEIGHT = [0.13, 0.09] as const;

/** Horizontal wavelength of each band, in CSS pixels. */
const HILL_WAVELENGTH = [900, 520] as const;

/**
 * Height of a hill band above the horizon at a given scrolled x, in pixels.
 *
 * A sum of three offset sines: enough to read as an irregular ridgeline, cheap
 * enough to evaluate per pixel column, and — being a pure function of x — the
 * same ridge every frame, so the hills do not crawl as the camera moves.
 */
export function hillHeightAt(x: number, band: number, amplitude: number): number {
  const wavelength = HILL_WAVELENGTH[band] ?? HILL_WAVELENGTH[0];
  const phase = band * 2.4;
  const k = (Math.PI * 2) / wavelength;
  const wave =
    Math.sin(x * k + phase) * 0.6 +
    Math.sin(x * k * 2.3 + phase * 1.7) * 0.28 +
    Math.sin(x * k * 0.45 + phase * 0.6) * 0.12;
  // Map the [-1, 1] sum onto [0.35, 1] of the amplitude: ridges vary, but the
  // band never thins to nothing and exposes the join with the soil.
  return amplitude * (0.35 + 0.65 * ((wave + 1) / 2));
}

/** Draw one hill band as a filled ridge sitting on the ground line. */
function drawHillBand(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  groundY: number,
  layout: TreeLayout,
  band: number,
  color: string,
): void {
  const amplitude = viewport.height * HILL_HEIGHT[band];
  // The band scrolls with a fraction of the camera's own horizontal travel.
  const offset = (viewport.width / 2 - layout.originX) * HILL_PARALLAX[band];

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  // 6px columns: finer than the eye resolves on a soft ridgeline, coarse
  // enough that the whole backdrop stays a rounding error in the frame budget.
  for (let x = 0; x <= viewport.width; x += 6) {
    ctx.lineTo(x, groundY - hillHeightAt(x + offset, band, amplitude));
  }
  ctx.lineTo(viewport.width, groundY);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw the backdrop.
 *
 * Order matters and is fixed: sky, then hills against it, then the soil
 * cross-section over their feet, then (by the caller) the tree in front of all
 * of it.
 */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  layout: TreeLayout,
  cycle: DayCycle,
): void {
  const { width: w, height: h } = viewport;
  const groundY = layout.originY;
  // Clamped for the fills: the ground line can sit far off-screen either way
  // once the camera is at the clouds or down in the rock.
  const skyBottom = Math.min(h, Math.max(0, groundY));

  const sky = skyColors(cycle.t);
  if (skyBottom > 0) {
    // Anchor the gradient to the cloud ceiling rather than the canvas top, so
    // panning up moves through the sky instead of dragging it along.
    const ceilingY = groundY - CLOUD_LEVEL_Y * layout.scale;
    const gradient = ctx.createLinearGradient(0, ceilingY, 0, groundY);
    gradient.addColorStop(0, sky.top);
    gradient.addColorStop(1, sky.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, skyBottom);
  }

  // Hills, far band first, dimmed as the sun goes down.
  if (groundY > 0) {
    const night = 1 - cycle.daylight;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, skyBottom);
    ctx.clip();
    drawHillBand(
      ctx,
      viewport,
      groundY,
      layout,
      0,
      lerpColor(PALETTE.hillFar, PALETTE.hillFarNight, night),
    );
    drawHillBand(
      ctx,
      viewport,
      groundY,
      layout,
      1,
      lerpColor(PALETTE.hillNear, PALETTE.hillNearNight, night),
    );
    ctx.restore();
  }

  // Soil cross-section, anchored to the bedrock so the strata stay put in the
  // world while the camera travels down them.
  if (skyBottom < h) {
    const bedrockY = groundY - BEDROCK_Y * layout.scale;
    const soil = ctx.createLinearGradient(0, groundY, 0, bedrockY);
    soil.addColorStop(0, PALETTE.soilTop);
    soil.addColorStop(1, PALETTE.soilBottom);
    ctx.fillStyle = soil;
    ctx.fillRect(0, skyBottom, w, h - skyBottom);
  }

  // The line where air meets earth.
  if (groundY >= -2 && groundY <= h + 2) {
    ctx.fillStyle = PALETTE.horizon;
    ctx.fillRect(0, groundY - 1, w, 2);
  }
}
