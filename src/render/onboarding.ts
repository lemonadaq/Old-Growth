import type { BeatStyle } from '../content/progression';
import type { Vec2 } from '../engine/geometry';
import { PALETTE } from './palette';

/**
 * The opening beats, drawn on the tree itself.
 *
 * Two marks and no more: a ring that breathes around the trunk until the player
 * has tapped it, and an arrow leaning at the same trunk until they have grown
 * something. Both sit *on the thing they are about*, which is the whole argument
 * against a tutorial box — a box has to describe where to press, and a ring
 * simply is where to press.
 *
 * Nothing here is interactive. The mark is drawn under the radial menu and over
 * the tree, and the press it is asking for is the ordinary press the game
 * already handles; if the player ignores it entirely and taps anyway, the mark
 * goes away because the thing it was waiting for happened.
 *
 * Reduced motion is honoured by *not moving*, not by disappearing. A still ring
 * is still an answer to "what do I do"; a missing one is not.
 */

/** Period of the ring's breath, in ms. */
const PULSE_PERIOD_MS = 1400;

/** Radius the ring rests at, and how far it swells. */
const RING_RADIUS_PX = 26;
const RING_SWELL_PX = 12;

/** How far above the mark the arrow's tip sits, and how far it bobs. */
const ARROW_GAP_PX = 18;
const ARROW_LENGTH_PX = 26;
const ARROW_BOB_PX = 6;

/** Gap between the mark and the line of text above it. */
const LABEL_GAP_PX = 12;
const LABEL_HEIGHT_PX = 24;
const LABEL_PAD_PX = 10;

/** What the scripted opening currently wants pressed. */
export interface BeatMark {
  readonly id: string;
  /** One line, in the imperative. */
  readonly line: string;
  readonly style: BeatStyle;
}

/** A breath in `[0, 1]`, or a held half-breath when motion is off. */
export function beatPhase(now: number, motion: boolean): number {
  if (!motion) return 0.5;
  return (Math.sin((now / PULSE_PERIOD_MS) * Math.PI * 2) + 1) / 2;
}

/** The label panel above a mark: one line, centred, on a dark plate. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.font = 'bold 13px system-ui, sans-serif';
  const width = ctx.measureText(text).width + LABEL_PAD_PX * 2;

  ctx.fillStyle = PALETTE.beatPanel;
  ctx.strokeStyle = PALETTE.beatRing;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - LABEL_HEIGHT_PX, width, LABEL_HEIGHT_PX, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = PALETTE.beatText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - LABEL_HEIGHT_PX / 2);
}

/**
 * Draw one beat's mark at a screen point.
 *
 * The point is the middle of the trunk rather than its top: it is where a player
 * would naturally put their thumb, and a ring drawn around the tip would be a
 * ring around the part of the trunk that is hardest to hit.
 */
export function drawBeat(
  ctx: CanvasRenderingContext2D,
  mark: BeatMark,
  at: Vec2,
  now: number,
  motion: boolean,
): void {
  const phase = beatPhase(now, motion);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (mark.style === 'pulse') {
    // A filled halo that fades as it swells, and a hard ring at rest inside it.
    // The halo is what catches the eye on a busy canvas; the ring is what says
    // *here*, and it does not move, so the target never has to be chased.
    const radius = RING_RADIUS_PX + phase * RING_SWELL_PX;
    ctx.globalAlpha = 1 - phase * 0.8;
    ctx.fillStyle = PALETTE.beatRingSoft;
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.beatRing;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(at.x, at.y, RING_RADIUS_PX, 0, Math.PI * 2);
    ctx.stroke();

    drawLabel(ctx, mark.line, at.x, at.y - RING_RADIUS_PX - LABEL_GAP_PX);
    ctx.restore();
    return;
  }

  // The arrow: a shaft and a head, pointing down at the trunk from above, bobbing
  // toward it. Down rather than sideways because the label sits above it, and a
  // mark that reads top-to-bottom needs no thought about which end is the point.
  const bob = (phase - 0.5) * 2 * ARROW_BOB_PX;
  const tipY = at.y - ARROW_GAP_PX + bob;
  const tailY = tipY - ARROW_LENGTH_PX;

  ctx.globalAlpha = 1;
  ctx.strokeStyle = PALETTE.beatRing;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(at.x, tailY);
  ctx.lineTo(at.x, tipY);
  ctx.stroke();

  ctx.fillStyle = PALETTE.beatRing;
  ctx.beginPath();
  ctx.moveTo(at.x, tipY + 6);
  ctx.lineTo(at.x - 7, tipY - 6);
  ctx.lineTo(at.x + 7, tipY - 6);
  ctx.closePath();
  ctx.fill();

  drawLabel(ctx, mark.line, at.x, tailY - LABEL_GAP_PX);
  ctx.restore();
}
