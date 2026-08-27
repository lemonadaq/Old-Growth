import { WEATHER_TELEGRAPH_SECONDS } from '../content/balance';
import { SEASON_BY_ID, type SeasonId } from '../content/seasons';
import { WEATHER_BY_ID } from '../content/weather';
import type { Viewport } from '../engine/camera';
import type { Vec2 } from '../engine/geometry';
import type { TreeLayout } from '../engine/tree';
import type { WeatherSnapshot } from '../engine/types';
import type { ColorCast } from './color';
import { PALETTE } from './palette';

/**
 * Weather and season, drawn.
 *
 * Everything here is a **pure function of engine seconds**: no particle pool, no
 * per-frame state, no RNG. A raindrop's position is arithmetic on its index and
 * the clock, which means the whole sky can be tested without a canvas, and two
 * frames a second apart are guaranteed to differ for the right reason.
 *
 * The seasons and the weather both repaint the world by **casting** a colour
 * over the existing palette rather than by supplying art of their own — see
 * `ColorCast` in `./color.ts`. October is the same tree as June, tinted.
 */

/* -------------------------------------------------------------------- casts */

/** The cast a season puts over the sky. */
export function seasonSkyCast(season: SeasonId): ColorCast {
  const tint = SEASON_BY_ID[season].tint;
  return { color: tint.sky, strength: tint.skyStrength };
}

/** The cast a season puts over foliage. */
export function seasonLeafCast(season: SeasonId): ColorCast {
  const tint = SEASON_BY_ID[season].tint;
  return { color: tint.leaf, strength: tint.leafStrength };
}

/** The cast a season puts over the soil. */
export function seasonSoilCast(season: SeasonId): ColorCast {
  const tint = SEASON_BY_ID[season].tint;
  return { color: tint.soil, strength: tint.soilStrength };
}

/**
 * The cast the sky is under from the weather — the running event at full
 * strength, or an approaching one ramping in over its telegraph.
 *
 * The ramp *is* the warning. Ten seconds of the light going wrong is what makes
 * bracing for a storm a decision rather than a reflex, and it has to be visible
 * before the banner is read.
 */
export function weatherSkyCast(weather: WeatherSnapshot): ColorCast | null {
  if (weather.active) {
    const def = WEATHER_BY_ID[weather.active.id];
    return { color: def.color, strength: def.skyStrength };
  }

  if (weather.pending) {
    const def = WEATHER_BY_ID[weather.pending.id];
    const ramp = 1 - Math.min(1, weather.pending.inSeconds / WEATHER_TELEGRAPH_SECONDS);
    return { color: def.color, strength: def.skyStrength * ramp };
  }

  return null;
}

/** Every cast over the sky right now: the season first, then the sky's mood. */
export function skyCasts(season: SeasonId, weather: WeatherSnapshot): ColorCast[] {
  const casts = [seasonSkyCast(season)];
  const mood = weatherSkyCast(weather);
  if (mood) casts.push(mood);
  return casts;
}

/* --------------------------------------------------------------------- rain */

/** Raindrops drawn at once. Enough to read as weather, few enough to be free. */
export const RAIN_DROPS = 160;

/** How long one drop takes to cross the canvas, in seconds. */
const RAIN_FALL_SECONDS = 0.85;

/** How far a drop leans off vertical, as a fraction of its fall. */
const RAIN_SLANT = 0.22;

/** Length of a drop's streak, in CSS pixels. */
const RAIN_LENGTH_PX = 14;

/** A deterministic value in `[0, 1)` from an integer — the drop's own scatter. */
function scatter(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Where one raindrop is at `seconds`.
 *
 * Each drop owns a column and a phase, and falls on a loop — so the rain is a
 * continuous curtain rather than a burst that has to be re-spawned. The `x`
 * drifts with the fall, which is what stops it reading as a barcode.
 */
export function raindropAt(
  index: number,
  seconds: number,
  viewport: Viewport,
): { x: number; y: number; length: number } {
  const phase = scatter(index, 1);
  const speed = 0.75 + scatter(index, 2) * 0.5;
  const t = ((seconds / RAIN_FALL_SECONDS) * speed + phase) % 1;
  const column = scatter(index, 3);

  // A little past the right edge, so the slant does not leave a dry margin.
  const x = column * (viewport.width + RAIN_SLANT * viewport.height) - RAIN_SLANT * viewport.height;
  return {
    x: x + t * RAIN_SLANT * viewport.height,
    y: t * (viewport.height + RAIN_LENGTH_PX) - RAIN_LENGTH_PX,
    length: RAIN_LENGTH_PX * (0.7 + scatter(index, 4) * 0.8),
  };
}

/**
 * Draw the rain: slanted streaks falling across the sky.
 *
 * Clipped at the ground line. The underground is a *cross-section* — the player
 * is looking at earth from inside it — and rain falling through the clay is the
 * kind of small wrongness that is impossible to un-see once noticed.
 */
export function drawRain(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  seconds: number,
  intensity = 1,
  groundY: number = viewport.height,
): void {
  const drops = Math.round(RAIN_DROPS * Math.min(1, Math.max(0, intensity)));
  const bottom = Math.min(viewport.height, Math.max(0, groundY));
  if (drops <= 0 || bottom <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, viewport.width, bottom);
  ctx.clip();
  ctx.lineCap = 'round';
  for (let i = 0; i < drops; i += 1) {
    const drop = raindropAt(i, seconds, viewport);
    ctx.strokeStyle = i % 7 === 0 ? PALETTE.raindropBright : PALETTE.raindrop;
    ctx.lineWidth = i % 7 === 0 ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(drop.x, drop.y);
    ctx.lineTo(drop.x - RAIN_SLANT * drop.length, drop.y + drop.length);
    ctx.stroke();
  }
  ctx.restore();
}

/* -------------------------------------------------------------------- storm */

/** Seconds between lightning flashes. */
const FLASH_PERIOD_SECONDS = 3.1;

/** How long one flash lasts. */
const FLASH_DURATION_SECONDS = 0.16;

/**
 * Flash brightness at `seconds`, in `[0, 1]`.
 *
 * Two beats — a short stutter then the main strike — because a single square
 * pulse reads as the screen glitching rather than as lightning.
 */
export function lightningFlash(seconds: number): number {
  const t = ((seconds % FLASH_PERIOD_SECONDS) + FLASH_PERIOD_SECONDS) % FLASH_PERIOD_SECONDS;
  if (t < FLASH_DURATION_SECONDS) return 1 - t / FLASH_DURATION_SECONDS;

  const second = t - FLASH_DURATION_SECONDS * 1.7;
  if (second >= 0 && second < FLASH_DURATION_SECONDS) {
    return 0.6 * (1 - second / FLASH_DURATION_SECONDS);
  }
  return 0;
}

/** Draw the storm: the whole scene under weight, lit now and then. */
export function drawStorm(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  seconds: number,
  groundY: number = viewport.height,
): void {
  ctx.save();
  ctx.fillStyle = PALETTE.stormShade;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  const flash = lightningFlash(seconds);
  if (flash > 0) {
    ctx.globalAlpha = flash;
    ctx.fillStyle = PALETTE.stormFlash;
    ctx.fillRect(0, 0, viewport.width, viewport.height);
  }
  ctx.restore();

  drawRain(ctx, viewport, seconds * 1.6, 0.75, groundY);
}

/* ------------------------------------------------------------------ drought */

/** Draw the drought: dry glare hanging over the ground. */
export function drawDrought(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  layout: TreeLayout,
  seconds: number,
): void {
  const groundY = Math.min(viewport.height, Math.max(0, layout.originY));
  if (groundY <= 0) return;

  // The haze breathes, slowly. A static overlay reads as a bug in the renderer.
  const breath = 0.86 + 0.14 * Math.sin(seconds * 0.7);
  const haze = ctx.createLinearGradient(0, groundY - viewport.height * 0.3, 0, groundY);
  haze.addColorStop(0, 'rgba(238, 220, 170, 0)');
  haze.addColorStop(1, PALETTE.droughtHaze);

  ctx.save();
  ctx.globalAlpha = breath;
  ctx.fillStyle = haze;
  ctx.fillRect(0, Math.max(0, groundY - viewport.height * 0.3), viewport.width, groundY);
  ctx.restore();
}

/** Draw whichever event is running over the scene. Clear skies draw nothing. */
export function drawWeather(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  layout: TreeLayout,
  weather: WeatherSnapshot,
  seconds: number,
): void {
  const active = weather.active;
  if (!active) return;

  if (active.id === 'rain') drawRain(ctx, viewport, seconds, 1, layout.originY);
  else if (active.id === 'storm') drawStorm(ctx, viewport, seconds, layout.originY);
  else if (active.id === 'drought') drawDrought(ctx, viewport, layout, seconds);
}

/* ------------------------------------------------------------ brace anchor */

/** Radius of the anchor ring, in CSS pixels. */
export const ANCHOR_RADIUS_PX = 34;

/** How far above the ground line the anchor floats. */
const ANCHOR_LIFT_PX = 54;

/** Where the brace anchor sits on screen. */
export interface BraceAnchor {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Place the anchor at the foot of the trunk.
 *
 * On the tree rather than in the HUD, and deliberately: bracing is *holding the
 * trunk*, and a button in a corner would be a quick-time event with a tree in
 * the background. It is clamped into the viewport so a camera down among the
 * roots can still be braced from.
 */
export function braceAnchorLayout(viewport: Viewport, layout: TreeLayout): BraceAnchor {
  const margin = ANCHOR_RADIUS_PX + 8;
  return {
    x: Math.min(viewport.width - margin, Math.max(margin, layout.originX)),
    y: Math.min(viewport.height - margin, Math.max(margin, layout.originY - ANCHOR_LIFT_PX)),
    radius: ANCHOR_RADIUS_PX,
  };
}

/** Whether a press landed on the anchor. */
export function hitTestBraceAnchor(point: Vec2, anchor: BraceAnchor): boolean {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  return dx * dx + dy * dy <= anchor.radius * anchor.radius;
}

/**
 * Draw the anchor: a flashing ring that fills as it is hammered.
 *
 * The pulse is fastest when nothing has been banked and settles as the brace
 * comes in, so an untouched anchor is the loudest thing on the canvas and a
 * finished one stops shouting.
 */
export function drawBraceAnchor(
  ctx: CanvasRenderingContext2D,
  anchor: BraceAnchor,
  brace: number,
  seconds: number,
): void {
  const filled = Math.min(1, Math.max(0, brace));
  const pulse = 0.55 + 0.45 * Math.sin(seconds * (10 - 5 * filled));

  ctx.save();
  ctx.fillStyle = PALETTE.anchor;
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, anchor.radius, 0, Math.PI * 2);
  ctx.fill();

  // The track, flashing.
  ctx.globalAlpha = 0.35 + 0.65 * pulse;
  ctx.strokeStyle = PALETTE.anchorRing;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, anchor.radius - 3, 0, Math.PI * 2);
  ctx.stroke();

  // The brace, banked.
  if (filled > 0) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.anchorFill;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(
      anchor.x,
      anchor.y,
      anchor.radius - 3,
      -Math.PI / 2,
      -Math.PI / 2 + filled * Math.PI * 2,
    );
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.anchorText;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(filled >= 1 ? 'HELD' : 'BRACE', anchor.x, anchor.y);
  ctx.restore();
}
