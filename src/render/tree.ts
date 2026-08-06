import type { ScreenSegment, TreeBounds, TreeLayout } from '../engine/tree';
import { HORIZON_RATIO, PALETTE } from './palette';

/**
 * Screen placement and drawing of the tree skeleton.
 *
 * The trunk base sits on the horizon line and the canopy is fitted to the sky
 * above it. The scale is derived from the tree's *measured* bounds rather than
 * assumed, because the silhouette changes as the player grows it — whichever of
 * height or width binds first decides the scale, so the tree stays fully on
 * screen on narrow phones and wide monitors alike.
 */

/** Fraction of the sky height the canopy may fill. */
const VERTICAL_FIT = 0.86;

/** Fraction of the canvas width the canopy may span. */
const HORIZONTAL_FIT = 0.66;

/** Where a tree with the given `bounds` sits on a canvas of `w × h` CSS pixels. */
export function computeTreeLayout(w: number, h: number, bounds: TreeBounds): TreeLayout {
  const groundY = Math.round(h * HORIZON_RATIO);

  // Guard against a degenerate (zero-extent) tree dividing by zero.
  const height = Math.max(bounds.maxY, 1e-6);
  const halfSpread = Math.max((bounds.maxX - bounds.minX) / 2, 1e-6);

  const scale = Math.min((groundY * VERTICAL_FIT) / height, (w * HORIZONTAL_FIT) / 2 / halfSpread);

  // Centre the silhouette, not the trunk: a lopsided canopy still sits centred.
  const centerX = (bounds.minX + bounds.maxX) / 2;

  return {
    originX: Math.round(w / 2 - centerX * scale),
    originY: groundY,
    scale,
  };
}

/**
 * Draw projected segments as tapered, round-capped strokes.
 *
 * Trunk pieces are drawn first (and darkest) with the thinner branches over
 * them, plus a sunlit highlight down one side of the trunk for a little depth.
 */
export function drawTree(ctx: CanvasRenderingContext2D, segments: readonly ScreenSegment[]): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const segment of segments) {
    ctx.strokeStyle = segment.kind === 'trunk' ? PALETTE.bark : PALETTE.branch;
    ctx.lineWidth = Math.max(1.5, segment.width);
    ctx.beginPath();
    ctx.moveTo(segment.a.x, segment.a.y);
    ctx.lineTo(segment.b.x, segment.b.y);
    ctx.stroke();
  }

  // Sunlit edge: a thin offset stroke along the trunk only.
  ctx.strokeStyle = PALETTE.barkHighlight;
  for (const segment of segments) {
    if (segment.kind !== 'trunk') continue;
    const offset = segment.width * 0.26;
    ctx.lineWidth = Math.max(1, segment.width * 0.22);
    ctx.beginPath();
    ctx.moveTo(segment.a.x - offset, segment.a.y);
    ctx.lineTo(segment.b.x - offset, segment.b.y);
    ctx.stroke();
  }

  ctx.restore();
}
