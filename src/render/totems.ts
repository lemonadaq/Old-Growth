import { TOTEM_BY_ID } from '../content/totems';
import type { TreeLayout } from '../engine/tree';
import { PALETTE } from './palette';

/**
 * Carved stumps: the totems the player has planted at the tree base.
 *
 * They are drawn through the same {@link TreeLayout} the tree is projected
 * with, so they stand on the same ground line and travel with the camera —
 * a totem is *at the base of your tree*, not stuck to the corner of the screen.
 *
 * Each stump is a short taper with a pale cut face on top, carved with the
 * sigil of its recipe in that recipe's own colour. Deliberately small: they are
 * a permanent record of a decision, not a second tree.
 */

/** Height of a stump in canonical units — knee-high beside a mature trunk. */
const STUMP_HEIGHT = 0.075;

/** Width of a stump at its base, in canonical units. */
const STUMP_WIDTH = 0.062;

/** Slot offsets from the trunk, in canonical units, alternating sides. */
const SLOT_OFFSETS = [0.17, -0.17, 0.3] as const;

/** Canonical x a totem in `slot` stands at. Slots past the table stack outward. */
export function totemOffset(slot: number): number {
  const known = SLOT_OFFSETS[slot];
  if (known !== undefined) return known;
  const extra = slot - SLOT_OFFSETS.length + 1;
  return (slot % 2 === 0 ? 1 : -1) * (0.3 + 0.13 * extra);
}

/** Where a totem stands and how big it is drawn, in screen pixels. */
export interface TotemPlacement {
  readonly slot: number;
  readonly totemId: string;
  /** Centre of the stump's base, on the ground line. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Project the planted totems into screen space.
 *
 * Sizes are clamped so a stump stays legible when the camera is zoomed all the
 * way out on a large tree — at that scale a canonically-correct stump would be
 * two pixels of brown mush.
 */
export function layoutTotems(planted: readonly string[], layout: TreeLayout): TotemPlacement[] {
  return planted.map((totemId, slot) => ({
    slot,
    totemId,
    x: layout.originX + totemOffset(slot) * layout.scale,
    y: layout.originY,
    width: Math.max(7, STUMP_WIDTH * layout.scale),
    height: Math.max(9, STUMP_HEIGHT * layout.scale),
  }));
}

/** The carved sigil for a recipe, drawn inside a unit box around the origin. */
function drawSigil(ctx: CanvasRenderingContext2D, totemId: string, size: number): void {
  ctx.lineWidth = Math.max(1, size * 0.16);
  ctx.lineCap = 'round';

  switch (totemId) {
    // Rain: a channel down the face with runoff either side.
    case 'rain':
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.55);
      ctx.lineTo(0, size * 0.55);
      ctx.moveTo(-size * 0.45, -size * 0.15);
      ctx.lineTo(-size * 0.45, size * 0.35);
      ctx.moveTo(size * 0.45, -size * 0.15);
      ctx.lineTo(size * 0.45, size * 0.35);
      ctx.stroke();
      break;
    // Sun: a disc and four rays.
    case 'sun': {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 4; i += 1) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * size * 0.5, Math.sin(angle) * size * 0.5);
        ctx.lineTo(Math.cos(angle) * size * 0.72, Math.sin(angle) * size * 0.72);
        ctx.stroke();
      }
      break;
    }
    // Vigor: a tally of notches.
    default:
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * size * 0.4 - size * 0.16, -size * 0.5);
        ctx.lineTo(i * size * 0.4 + size * 0.16, size * 0.5);
        ctx.stroke();
      }
      break;
  }
}

/** Draw one carved stump standing on the ground line. */
function drawStump(ctx: CanvasRenderingContext2D, placement: TotemPlacement): void {
  const def = TOTEM_BY_ID[placement.totemId];
  const { x, y, width, height } = placement;
  const halfBase = width / 2;
  const halfTop = halfBase * 0.82;
  const top = y - height;

  // Body: a short taper, with the shaded side facing away from the trunk.
  ctx.fillStyle = PALETTE.stump;
  ctx.beginPath();
  ctx.moveTo(x - halfBase, y);
  ctx.lineTo(x - halfTop, top);
  ctx.lineTo(x + halfTop, top);
  ctx.lineTo(x + halfBase, y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = PALETTE.stumpShade;
  ctx.beginPath();
  ctx.moveTo(x + halfTop * 0.35, top);
  ctx.lineTo(x + halfTop, top);
  ctx.lineTo(x + halfBase, y);
  ctx.lineTo(x + halfBase * 0.35, y);
  ctx.closePath();
  ctx.fill();

  // Cut face: pale heartwood with a growth ring in it.
  const faceHeight = Math.max(2, halfTop * 0.5);
  ctx.fillStyle = PALETTE.stumpFace;
  ctx.beginPath();
  ctx.ellipse(x, top, halfTop, faceHeight, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.stumpRing;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, top, halfTop * 0.5, faceHeight * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // The carving itself, in the recipe's colour.
  ctx.save();
  ctx.translate(x, y - height * 0.45);
  ctx.strokeStyle = def?.color ?? PALETTE.stumpFace;
  drawSigil(ctx, placement.totemId, Math.max(3, width * 0.34));
  ctx.restore();
}

/** Draw every planted totem at the tree base. */
export function drawTotems(
  ctx: CanvasRenderingContext2D,
  planted: readonly string[],
  layout: TreeLayout,
): void {
  if (planted.length === 0) return;

  ctx.save();
  for (const placement of layoutTotems(planted, layout)) {
    drawStump(ctx, placement);
  }
  ctx.restore();
}
