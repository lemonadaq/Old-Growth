import type { ScreenSegment } from '../engine/tree';
import { PALETTE } from './palette';

/**
 * The keyboard focus ring on the tree.
 *
 * The tree is the game's main control surface, and until now the only way to
 * reach it was a pointer. A keyboard player moves a *focused part* around the
 * graph with the arrow keys, and this is the only thing that tells them where
 * they are — so it has to be visible on bark, on leaves, above the horizon and
 * below it, without covering the limb it marks.
 *
 * Two strokes do that: a wide translucent halo that reads at a glance, and a
 * thin bright line on top of it that survives being drawn over a pale sky.
 * Foliage is a blob rather than a stick, so it gets a circle instead.
 */

/** How much wider than the limb the halo is, in CSS pixels. */
export const FOCUS_HALO_PX = 10;

/** Narrowest halo, so focus on a twig is still a target you can see. */
const MIN_HALO_PX = 12;

/** How much bigger than a leaf blob its focus circle is. */
const FOLIAGE_SCALE = 1.45;

/** Smallest foliage focus circle, in CSS pixels. */
const MIN_FOLIAGE_RADIUS_PX = 10;

export function drawFocusRing(
  ctx: CanvasRenderingContext2D,
  segments: readonly ScreenSegment[],
  nodeId: string | null,
): void {
  if (!nodeId) return;
  const segment = segments.find((candidate) => candidate.id === nodeId);
  if (!segment) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (segment.kind === 'leafCluster' || segment.kind === 'blossom') {
    const radius = Math.max(MIN_FOLIAGE_RADIUS_PX, segment.width * FOLIAGE_SCALE);
    ctx.strokeStyle = PALETTE.focusHalo;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(segment.b.x, segment.b.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = PALETTE.focusRing;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(segment.b.x, segment.b.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const halo = Math.max(MIN_HALO_PX, segment.width + FOCUS_HALO_PX);
  ctx.strokeStyle = PALETTE.focusHalo;
  ctx.lineWidth = halo;
  ctx.beginPath();
  ctx.moveTo(segment.a.x, segment.a.y);
  ctx.lineTo(segment.b.x, segment.b.y);
  ctx.stroke();

  ctx.strokeStyle = PALETTE.focusRing;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(segment.a.x, segment.a.y);
  ctx.lineTo(segment.b.x, segment.b.y);
  ctx.stroke();

  ctx.restore();
}
