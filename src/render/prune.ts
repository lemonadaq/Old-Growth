import type { PruneQuote } from '../engine/prune';
import { formatNumber } from '../engine/format';
import type { Vec2 } from '../engine/geometry';
import type { ScreenSegment } from '../engine/tree';
import { PALETTE } from './palette';

/**
 * Prune mode's overlay: the doomed subtree, and the confirm that stands between
 * hovering it and losing it.
 *
 * The highlight is drawn *over* the tree rather than instead of it, so the limb
 * stays recognisable while it is marked — the player is choosing between two
 * versions of their own tree, and blanking the limb out would hide the thing
 * they are deciding about.
 *
 * Layout and drawing are separated the same way the radial menu separates them:
 * geometry is a pure function, drawing consumes it.
 */

/** How much wider than the limb itself the red wash is drawn. */
const MARK_WIDTH_PX = 6;

/** Radius of the red mark over a leaf cluster or blossom. */
const FOLIAGE_MARK_SCALE = 1.35;

/** Period of the marked subtree's pulse, in ms. */
const PULSE_PERIOD_MS = 900;

/** Size of the confirm badge. */
const BADGE_WIDTH_PX = 128;
const BADGE_HEIGHT_PX = 40;

/** Gap between the cut point and the badge above it. */
const BADGE_OFFSET_PX = 26;

/** What prune mode currently has marked. */
export interface PruneSelection {
  /** The node the cut would be rooted at. */
  readonly nodeId: string;
  /** Every node id that would come off, including the cut node. */
  readonly ids: ReadonlySet<string>;
  /** The quote backing the tooltip and the badge. */
  readonly quote: PruneQuote;
  /**
   * Whether the player has already clicked once and the cut is one more click
   * away. This is the inline confirm: a marked limb is safe, an armed one is not.
   */
  readonly armed: boolean;
}

/** Alpha of the marked subtree at `now` — a slow pulse so it reads as live. */
export function pulseAlpha(now: number, armed: boolean): number {
  const phase = (Math.sin((now / PULSE_PERIOD_MS) * Math.PI * 2) + 1) / 2;
  return armed ? 0.75 + phase * 0.25 : 0.45 + phase * 0.25;
}

/** The screen points of a marked subtree — where the debris falls from. */
export function markedPoints(
  segments: readonly ScreenSegment[],
  ids: ReadonlySet<string>,
): Vec2[] {
  return segments.filter((segment) => ids.has(segment.id)).map((segment) => segment.b);
}

/**
 * Wash the doomed subtree in red and outline it.
 *
 * Foliage gets a disc and wood gets a fat capsule along its centre-line, which
 * is enough to make a limb and everything hanging off it read as one object at
 * a glance — the whole point of marking the *subtree* rather than the node.
 */
export function drawPruneMark(
  ctx: CanvasRenderingContext2D,
  segments: readonly ScreenSegment[],
  selection: PruneSelection,
  now: number,
): void {
  ctx.save();
  ctx.globalAlpha = pulseAlpha(now, selection.armed);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PALETTE.pruneMark;

  for (const segment of segments) {
    if (!selection.ids.has(segment.id)) continue;

    if (segment.kind === 'leafCluster' || segment.kind === 'blossom') {
      ctx.fillStyle = PALETTE.pruneMark;
      ctx.beginPath();
      ctx.arc(segment.b.x, segment.b.y, Math.max(5, segment.width * FOLIAGE_MARK_SCALE), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.lineWidth = Math.max(3, segment.width + MARK_WIDTH_PX);
    ctx.beginPath();
    ctx.moveTo(segment.a.x, segment.a.y);
    ctx.lineTo(segment.b.x, segment.b.y);
    ctx.stroke();
  }

  // The cut itself: a bright ring at the joint that would be severed.
  const cut = segments.find((segment) => segment.id === selection.nodeId);
  if (cut) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.pruneEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cut.a.x, cut.a.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cut.a.x - 9, cut.a.y - 9);
    ctx.lineTo(cut.a.x + 9, cut.a.y + 9);
    ctx.stroke();
  }

  ctx.restore();
}

/** One line of the badge: what the cut pays. */
function badgeSummary(quote: PruneQuote): string {
  const refund = quote.refunds[0];
  const sap = refund ? `+${formatNumber(refund.amount)} Sap` : '';
  const wood = `+${formatNumber(quote.deadwood)} Deadwood`;
  return sap ? `${sap} · ${wood}` : wood;
}

/**
 * The inline confirm.
 *
 * Deliberately *not* a modal: it hangs off the limb it is about to remove, so
 * the answer to "which one?" is never more than a glance away, and any click
 * that is not on the same limb again cancels it.
 */
export function drawPruneConfirm(
  ctx: CanvasRenderingContext2D,
  segments: readonly ScreenSegment[],
  selection: PruneSelection,
): void {
  if (!selection.armed) return;
  const cut = segments.find((segment) => segment.id === selection.nodeId);
  if (!cut) return;

  const x = cut.a.x - BADGE_WIDTH_PX / 2;
  const y = cut.a.y - BADGE_OFFSET_PX - BADGE_HEIGHT_PX;

  ctx.save();
  ctx.fillStyle = PALETTE.prunePanel;
  ctx.strokeStyle = PALETTE.pruneEdge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, BADGE_WIDTH_PX, BADGE_HEIGHT_PX, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.pruneText;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('✂ Click again to cut', x + BADGE_WIDTH_PX / 2, y + 13);
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(badgeSummary(selection.quote), x + BADGE_WIDTH_PX / 2, y + 28);

  if (selection.quote.apical) {
    ctx.fillStyle = PALETTE.crit;
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText('Lateral Surge', x + BADGE_WIDTH_PX / 2, y + BADGE_HEIGHT_PX + 10);
  }

  ctx.restore();
}
