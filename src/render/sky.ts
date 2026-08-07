import { SUNLIT_FRACTION } from '../content/daylight';
import { CLOUD_LEVEL_Y, type Viewport } from '../engine/camera';
import type { DayCycle } from '../engine/daylight';
import type { TreeLayout } from '../engine/tree';
import { lerpColor } from './color';
import { PALETTE, SKY_KEYFRAMES, type SkyColors } from './palette';

/**
 * Everything above the ground line: the sky, whichever body is crossing it, and
 * the distant hills. What lies below the ground line belongs to `./soil.ts`.
 *
 * All of it is drawn relative to the *projected* ground line rather than a fixed
 * fraction of the canvas, because the camera moves: pan to the roots and the
 * horizon has to leave the top of the screen like a real horizon does.
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

/** Which body is in the sky, and where along its arc. */
export interface Celestial {
  readonly kind: 'sun' | 'moon';
  /** Progress across the sky, `0` at its rise and `1` at its setting. */
  readonly progress: number;
  /** Height above the horizon in `[0, 1]`, peaking mid-arc. */
  readonly altitude: number;
}

/**
 * The body crossing the sky at a moment of the day.
 *
 * The sun owns the lit part of the day and the moon the rest, each rising at one
 * horizon and setting at the other along a half-sine. There is always exactly
 * one of them up: the handover happens at the horizon, where both are at zero
 * altitude, so no swap is ever visible.
 */
export function celestialAt(t: number): Celestial {
  const wrapped = ((t % 1) + 1) % 1;

  if (wrapped < SUNLIT_FRACTION) {
    const progress = wrapped / SUNLIT_FRACTION;
    return { kind: 'sun', progress, altitude: Math.sin(progress * Math.PI) };
  }

  const progress = (wrapped - SUNLIT_FRACTION) / (1 - SUNLIT_FRACTION);
  return { kind: 'moon', progress, altitude: Math.sin(progress * Math.PI) };
}

/** Fraction of the canvas width the arc spans, centred. */
const ARC_WIDTH = 0.8;

/** Fraction of the *visible* sky the arc peaks at. */
const ARC_APEX = 0.82;

/** Radius of the sun and moon discs, in CSS pixels. */
const SUN_RADIUS = 26;
const MOON_RADIUS = 19;

/** How much wider than the disc the sun's glow reaches. */
const GLOW_SCALE = 3.4;

/**
 * Draw whichever body is up, arcing across the sky between one horizon and the
 * other.
 *
 * The arc is measured against the *visible* sky — from the projected ground line
 * up to the top of the canvas — rather than against a fixed world height. A body
 * pinned to the cloud ceiling would be honest and permanently off-screen: the
 * tree fits the canvas, so the ceiling is several screens up at any normal
 * framing. Rising from and setting *into* the ground line is the part that has
 * to be true, and this keeps it: pan down to the roots and the sun leaves with
 * the horizon.
 */
export function drawCelestial(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  layout: TreeLayout,
  cycle: DayCycle,
): void {
  const groundY = layout.originY;
  // Horizon above the top of the canvas: the camera is underground.
  if (groundY <= 0) return;

  const body = celestialAt(cycle.t);
  const skyBottom = Math.min(viewport.height, groundY);
  const x = viewport.width * ((1 - ARC_WIDTH) / 2 + ARC_WIDTH * body.progress);
  const y = skyBottom - body.altitude * skyBottom * ARC_APEX;
  const radius = body.kind === 'sun' ? SUN_RADIUS : MOON_RADIUS;

  ctx.save();
  // Never let a body spill onto the ground: at the horizon it is half set.
  ctx.beginPath();
  ctx.rect(0, 0, viewport.width, skyBottom);
  ctx.clip();

  if (body.kind === 'sun') {
    const glow = ctx.createRadialGradient(x, y, radius * 0.6, x, y, radius * GLOW_SCALE);
    glow.addColorStop(0, PALETTE.sunGlow);
    glow.addColorStop(1, PALETTE.sunGlowEdge);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * GLOW_SCALE, 0, Math.PI * 2);
    ctx.fill();

    // Warmer low on the horizon, whiter overhead — the same shift the sky makes.
    ctx.fillStyle = lerpColor(PALETTE.sunLow, PALETTE.sunHigh, body.altitude);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = PALETTE.moonHalo;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.9, 0, Math.PI * 2);
    ctx.fill();

    // The crescent is the disc *minus* an offset disc, drawn as one even-odd
    // path. Carving it by painting the bite in a sky colour would need the sky's
    // colour at exactly that height, and the gradient means there isn't one —
    // the first attempt left the moon sitting in a visible dark patch.
    ctx.fillStyle = PALETTE.moon;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.arc(x + radius * 0.42, y - radius * 0.26, radius * 0.92, 0, Math.PI * 2);
    ctx.fill('evenodd');
  }

  ctx.restore();
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
 * Draw the sky, the sun or moon crossing it, and the hills standing on the
 * horizon.
 *
 * Order matters and is fixed: sky, then the body against it, then the hills in
 * front of both so a low sun *sets behind* the ridgeline, then (by the caller)
 * the soil cross-section over their feet, and the tree in front of all of it.
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

  drawCelestial(ctx, viewport, layout, cycle);

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
}
