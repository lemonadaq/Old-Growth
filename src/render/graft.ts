import type { GraftAssessment } from '../engine/graft';
import type { ScreenSegment } from '../engine/tree';
import { PALETTE } from './palette';

/**
 * Graft mode's overlay: the limb you have picked, the limb you are pointing at,
 * and whether the two of them make anything.
 *
 * Grafting is the one action in the game that needs *two* targets, so the
 * overlay's whole job is to keep the first one visible while the player looks
 * for the second. The chosen limb stays ringed and outlined the entire time; the
 * hovered one is outlined in green when the pair works and in red when it does
 * not, so the answer arrives before the click rather than after it.
 */

/** How much wider than the limb itself the outline is drawn. */
const MARK_WIDTH_PX = 5;

/** Radius of the mark over a leaf cluster or blossom. */
const FOLIAGE_MARK_SCALE = 1.3;

/** Period of the chosen limb's pulse, in ms. */
const PULSE_PERIOD_MS = 1100;

const BADGE_WIDTH_PX = 150;
const BADGE_HEIGHT_PX = 38;
const BADGE_OFFSET_PX = 24;

/** What graft mode currently has picked. */
export interface GraftSelection {
  /** The limb chosen first, or `null` when nothing is chosen yet. */
  readonly firstId: string | null;
  /** The limb under the pointer, or `null`. */
  readonly hoverId: string | null;
  /** The assessment of the pair, when there is a pair to assess. */
  readonly assessment: GraftAssessment | null;
}

/** Alpha of the chosen limb at `now` — a slow pulse, so it reads as held. */
export function graftPulse(now: number): number {
  return 0.5 + ((Math.sin((now / PULSE_PERIOD_MS) * Math.PI * 2) + 1) / 2) * 0.35;
}

/** Outline one segment in `color`. Foliage gets a disc, wood a fat capsule. */
function outline(ctx: CanvasRenderingContext2D, segment: ScreenSegment, color: string): void {
  if (segment.kind === 'leafCluster' || segment.kind === 'blossom') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(
      segment.b.x,
      segment.b.y,
      Math.max(5, segment.width * FOLIAGE_MARK_SCALE),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    return;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, segment.width + MARK_WIDTH_PX);
  ctx.beginPath();
  ctx.moveTo(segment.a.x, segment.a.y);
  ctx.lineTo(segment.b.x, segment.b.y);
  ctx.stroke();
}

/** Draw the chosen and hovered limbs. */
export function drawGraftMark(
  ctx: CanvasRenderingContext2D,
  segments: readonly ScreenSegment[],
  selection: GraftSelection,
  now: number,
): void {
  const first = selection.firstId
    ? segments.find((segment) => segment.id === selection.firstId)
    : undefined;
  const hover =
    selection.hoverId && selection.hoverId !== selection.firstId
      ? segments.find((segment) => segment.id === selection.hoverId)
      : undefined;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (first) {
    ctx.globalAlpha = graftPulse(now);
    outline(ctx, first, PALETTE.graftMark);
  }

  if (hover) {
    // Green means "these two make something", red means "they do not". The
    // player learns the adjacency rule by pointing rather than by reading it.
    const ok = selection.assessment?.ok === true;
    ctx.globalAlpha = 0.55;
    outline(ctx, hover, ok ? PALETTE.graftMark : PALETTE.graftRefused);
  }

  ctx.restore();
}

/**
 * The badge over the chosen limb, naming what the pair would make.
 *
 * It hangs off the *hovered* limb, because that is where the player is looking
 * while they decide — the chosen one is already marked and does not need words.
 */
export function drawGraftBadge(
  ctx: CanvasRenderingContext2D,
  segments: readonly ScreenSegment[],
  selection: GraftSelection,
): void {
  const assessment = selection.assessment;
  if (!assessment?.ok) return;

  const anchor = segments.find((segment) => segment.id === selection.hoverId);
  if (!anchor) return;

  const x = anchor.b.x - BADGE_WIDTH_PX / 2;
  const y = anchor.b.y - BADGE_OFFSET_PX - BADGE_HEIGHT_PX;

  ctx.save();
  ctx.fillStyle = PALETTE.graftPanel;
  ctx.strokeStyle = PALETTE.graftMark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, BADGE_WIDTH_PX, BADGE_HEIGHT_PX, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.menuText;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(
    assessment.firstDiscovery ? '❖ Something new' : `${assessment.hybrid.name}`,
    x + BADGE_WIDTH_PX / 2,
    y + 13,
  );
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('Click to graft', x + BADGE_WIDTH_PX / 2, y + 27);
  ctx.restore();
}
