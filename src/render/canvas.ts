import type { GameSnapshot } from '../engine/types';
import { HORIZON_RATIO, PALETTE } from './palette';

/**
 * Canvas 2D renderer. STEP 1 draws the sky-to-soil scene the game lives in; the
 * procedural tree, roots, and creatures are layered on in later steps.
 *
 * The renderer reads snapshots and never mutates game state. It owns
 * devicePixelRatio handling so drawing code can work in CSS pixels.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D canvas context');
    }
    this.ctx = ctx;
    this.resize();
  }

  /** Match the backing store to the element's CSS size × devicePixelRatio. */
  resize(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));

    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    // Draw in CSS pixels; the transform scales to device pixels.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Draw one frame.
   *
   * @param _snapshot latest game snapshot (unused in STEP 1's static scene).
   * @param _alpha    interpolation factor in `[0, 1)` for smooth motion later.
   */
  draw(_snapshot: GameSnapshot, _alpha: number): void {
    const { ctx, cssWidth: w, cssHeight: h } = this;
    const horizonY = Math.round(h * HORIZON_RATIO);

    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, PALETTE.skyTop);
    sky.addColorStop(1, PALETTE.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizonY);

    // Soil.
    const soil = ctx.createLinearGradient(0, horizonY, 0, h);
    soil.addColorStop(0, PALETTE.soilTop);
    soil.addColorStop(1, PALETTE.soilBottom);
    ctx.fillStyle = soil;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Horizon line where canopy air meets the ground.
    ctx.fillStyle = PALETTE.horizon;
    ctx.fillRect(0, horizonY - 1, w, 2);
  }
}
