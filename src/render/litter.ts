import type { Vec2 } from '../engine/geometry';
import type { TreeLayout } from '../engine/tree';
import type { LitterSnapshot } from '../engine/types';
import { PALETTE } from './palette';

/**
 * The leaf litter on the ground, drawn.
 *
 * A pile is a *place*, not a number: it sits where autumn dropped it, at the
 * foot of the trunk, and it is swept by clicking it. That is the whole reason it
 * is on the canvas rather than in the HUD — the season should be something the
 * player looks at the tree and sees.
 *
 * Positions come from the same {@link TreeLayout} the tree is projected with, so
 * the piles travel under the camera along with the trunk they fell from.
 */

/** Radius of a pile at the reference scale, in canonical units. */
const PILE_RADIUS = 0.07;

/** Smallest a pile is ever drawn or hit-tested, in CSS pixels. */
const PILE_MIN_PX = 9;

/** Largest, so a zoomed-in camera does not fill the screen with one heap. */
const PILE_MAX_PX = 44;

/** How far a pile settles *below* the ground line, as a fraction of its radius. */
const PILE_SINK = 0.2;

/** One pile as it lands on the canvas. */
export interface LaidPile {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** The pile it was laid out from, so a hit can be paid out. */
  readonly pile: LitterSnapshot;
}

/** Project the piles into screen space. */
export function layoutLitter(piles: readonly LitterSnapshot[], layout: TreeLayout): LaidPile[] {
  return piles.map((pile) => {
    const radius = Math.min(PILE_MAX_PX, Math.max(PILE_MIN_PX, PILE_RADIUS * layout.scale));
    return {
      id: pile.id,
      x: layout.originX + pile.x * layout.scale,
      y: layout.originY + radius * PILE_SINK,
      radius,
      pile,
    };
  });
}

/**
 * The pile under a press, or `null`.
 *
 * The topmost is taken first — piles are drawn oldest-first, so the one a player
 * sees on top of an overlap is the one they get.
 */
export function hitTestLitter(point: Vec2, piles: readonly LaidPile[]): LaidPile | null {
  for (let i = piles.length - 1; i >= 0; i -= 1) {
    const pile = piles[i];
    const dx = point.x - pile.x;
    const dy = point.y - pile.y;
    if (dx * dx + dy * dy <= pile.radius * pile.radius) return pile;
  }
  return null;
}

/** Deterministic lobe offsets for a heap, so a given pile keeps its shape. */
function lobes(id: string): { dx: number; dy: number; r: number }[] {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  const shapes: { dx: number; dy: number; r: number }[] = [];
  for (let i = 0; i < 5; i += 1) {
    hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491) >>> 0;
    const spread = ((hash >>> 8) / 0xffffff) * 2 - 1;
    hash = Math.imul(hash ^ (hash >>> 13), 0x85ebca6b) >>> 0;
    const lift = (hash >>> 8) / 0xffffff;
    shapes.push({ dx: spread * 0.7, dy: -lift * 0.32, r: 0.42 + lift * 0.3 });
  }
  return shapes;
}

/** How long a new pile takes to settle into place, in engine seconds. */
export const PILE_SETTLE_SECONDS = 0.6;

/** Draw the piles: overlapping lobes of dry foliage with a pale lit rim. */
export function drawLitter(
  ctx: CanvasRenderingContext2D,
  piles: readonly LaidPile[],
  seconds: number,
): void {
  if (piles.length === 0) return;

  ctx.save();
  for (const laid of piles) {
    // Settle in rather than appear: a pile that blinks into existence reads as
    // a rendering fault, not as leaves coming down.
    const age = Math.max(0, seconds - laid.pile.spawnedAt);
    const t = Math.min(1, age / PILE_SETTLE_SECONDS);
    const radius = laid.radius * (0.55 + 0.45 * t);

    for (const [i, lobe] of lobes(laid.id).entries()) {
      ctx.fillStyle = i % 2 === 0 ? PALETTE.litter : PALETTE.litterDark;
      ctx.beginPath();
      ctx.ellipse(
        laid.x + lobe.dx * radius,
        laid.y + lobe.dy * radius,
        radius * lobe.r,
        radius * lobe.r * 0.62,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.strokeStyle = PALETTE.litterRim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(laid.x, laid.y - radius * 0.12, radius * 0.95, radius * 0.5, 0, Math.PI, 0);
    ctx.stroke();
  }
  ctx.restore();
}
