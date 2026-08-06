import type { ComboSnapshot } from '../engine/types';
import { PALETTE } from './palette';

/**
 * The small combo meter that trails the cursor.
 *
 * Drawn as a ring arc rather than a bar so it reads at a glance without pulling
 * the eye away from the tap point. It is offset up-and-right of the pointer so
 * it never sits under a finger on touch devices, and hides itself entirely when
 * the meter is empty to keep the scene calm during idle play.
 */

/** Meter ring radius in CSS px. */
const RADIUS = 15;

/**
 * Offset from the pointer, in CSS px. Placed to the side rather than above so
 * the floating numbers — which rise straight up out of the tap point — do not
 * sit on top of it.
 */
const OFFSET_X = 46;
const OFFSET_Y = 6;

export function drawComboMeter(
  ctx: CanvasRenderingContext2D,
  pointerX: number,
  pointerY: number,
  combo: ComboSnapshot,
): void {
  if (combo.fill <= 0.001) return;

  const cx = pointerX + OFFSET_X;
  const cy = pointerY + OFFSET_Y;
  const full = combo.fill >= 0.999;

  ctx.save();
  ctx.globalAlpha = Math.min(1, 0.35 + combo.fill * 0.65);

  // Track.
  ctx.strokeStyle = PALETTE.comboTrack;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // Fill, sweeping clockwise from 12 o'clock.
  ctx.strokeStyle = full ? PALETTE.comboFull : PALETTE.comboFill;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, RADIUS, -Math.PI / 2, -Math.PI / 2 + combo.fill * Math.PI * 2);
  ctx.stroke();

  // Multiplier readout in the middle of the ring.
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(28, 20, 12, 0.75)';
  const label = `×${combo.multiplier.toFixed(2)}`;
  ctx.strokeText(label, cx, cy);
  ctx.fillStyle = full ? PALETTE.comboFull : PALETTE.comboFill;
  ctx.fillText(label, cx, cy);

  ctx.restore();
}
