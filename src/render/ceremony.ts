import type { Viewport } from '../engine/camera';
import type { ScreenSegment } from '../engine/tree';
import { PALETTE } from './palette';

/**
 * Going to Seed: six seconds in which the canopy comes apart and leaves.
 *
 * Every leaf cluster on the tree lets go, turns into a glowing seed and drifts
 * *upward* — the one thing in the game that moves against gravity, which is
 * exactly why it reads as an ending rather than as another effect. The tree
 * itself is left alone: the reset lands when the ceremony does, and a tree that
 * faded out early would spend five seconds looking like a bug.
 *
 * Pure functions of the leaf positions and one number in `[0, 1]`. No pool, no
 * RNG at draw time, no state between frames — the whole thing is testable
 * without a canvas, and any two frames of it can be compared by asking for two
 * fractions.
 */

/** One leaf on its way up. */
export interface CeremonySeed {
  readonly x: number;
  readonly y: number;
  /** Radius in CSS pixels. */
  readonly radius: number;
  /** Opacity in `[0, 1]`. */
  readonly alpha: number;
  /** Length of the trail behind it, in pixels. */
  readonly trail: number;
}

/** How far up the canvas a seed travels over the whole ceremony, in pixels. */
const RISE_PX = 420;

/** Sideways drift at the top of the rise, in pixels. */
const DRIFT_PX = 46;

/** Radius of a seed at its brightest. */
const SEED_RADIUS = 5;

/**
 * Fraction of the ceremony each seed's release is spread over.
 *
 * The canopy does not let go all at once — the last leaf leaves a third of the
 * way in — so the tree empties from the top down rather than blinking out.
 */
const STAGGER = 0.34;

/**
 * A deterministic value in `[0, 1)` from an index. Cheap, stable, and enough to
 * keep two neighbouring leaves from drifting in lockstep.
 */
function scatter(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Where every seed is at fraction `t` of the ceremony.
 *
 * Each leaf gets its own release moment (earlier the higher it sits, so the
 * canopy empties downward) and its own drift, then rises on an eased curve that
 * starts slow — a leaf detaching hangs for a beat before it goes.
 */
export function ceremonySeeds(leaves: readonly ScreenSegment[], t: number): CeremonySeed[] {
  const clamped = Math.min(1, Math.max(0, t));
  if (leaves.length === 0) return [];

  // Highest leaf first, so "released in order" and "released from the top" are
  // the same statement.
  const ordered = [...leaves].sort((a, b) => a.b.y - b.b.y);
  const seeds: CeremonySeed[] = [];

  ordered.forEach((leaf, index) => {
    const release = ordered.length <= 1 ? 0 : (index / (ordered.length - 1)) * STAGGER;
    const local = (clamped - release) / Math.max(1e-9, 1 - release);
    if (local <= 0) return;

    const eased = local * local * (3 - 2 * local);
    const drift = (scatter(index, 1) - 0.5) * 2 * DRIFT_PX;

    seeds.push({
      x: leaf.b.x + drift * eased,
      y: leaf.b.y - RISE_PX * eased,
      // Swells as it detaches, then thins out as it climbs away.
      radius: SEED_RADIUS * (0.6 + 0.7 * Math.sin(Math.min(1, local) * Math.PI)),
      alpha: Math.min(1, Math.max(0, 1 - Math.max(0, local - 0.55) / 0.45)),
      trail: 10 + 26 * eased,
    });
  });

  return seeds;
}

/**
 * How dark the world goes as the ceremony runs, in `[0, 1]`.
 *
 * It deepens for the first two thirds and holds: the last two seconds are the
 * quiet ones, and a vignette still closing while the seeds have gone reads as
 * the screen loading rather than as a pause.
 */
export function ceremonyDim(t: number): number {
  return Math.min(1, Math.max(0, t / 0.66));
}

/** Draw the ceremony over the scene: a hush, then the canopy going up. */
export function drawCeremony(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  leaves: readonly ScreenSegment[],
  t: number,
): void {
  const dim = ceremonyDim(t);

  ctx.save();
  ctx.globalAlpha = dim;
  ctx.fillStyle = PALETTE.ceremonyDim;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.globalAlpha = 1;

  for (const seed of ceremonySeeds(leaves, t)) {
    ctx.globalAlpha = seed.alpha;

    // The trail first, so the seed itself sits on top of its own wake.
    const trail = ctx.createLinearGradient(seed.x, seed.y, seed.x, seed.y + seed.trail);
    trail.addColorStop(0, PALETTE.ceremonySeed);
    trail.addColorStop(1, PALETTE.ceremonyTrailEnd);
    ctx.fillStyle = trail;
    ctx.fillRect(seed.x - seed.radius * 0.32, seed.y, seed.radius * 0.64, seed.trail);

    const glow = ctx.createRadialGradient(seed.x, seed.y, 0, seed.x, seed.y, seed.radius * 3.2);
    glow.addColorStop(0, PALETTE.ceremonyGlow);
    glow.addColorStop(1, PALETTE.ceremonyGlowEdge);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(seed.x, seed.y, seed.radius * 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PALETTE.ceremonySeed;
    ctx.beginPath();
    ctx.arc(seed.x, seed.y, seed.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
