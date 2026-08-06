import { hitTestSegments, type Vec2 } from '../engine/geometry';
import { CLICK_TOLERANCE_PX } from '../engine/clicker';
import {
  projectTree,
  treeBounds,
  type ScreenSegment,
  type TreeBounds,
  type TreeSegment,
} from '../engine/tree';
import type { GameSnapshot } from '../engine/types';
import { drawComboMeter } from './comboMeter';
import { EffectPool } from './effects';
import { HORIZON_RATIO, PALETTE } from './palette';
import { computeTreeLayout, drawTree } from './tree';

/**
 * Canvas 2D renderer: the sky-to-soil scene, the procedural tree, and the
 * transient click feedback layered on top.
 *
 * The renderer reads snapshots and never mutates game state. It owns
 * devicePixelRatio handling so drawing code can work in CSS pixels.
 *
 * It also owns the **screen-space projection** of the tree, which is why
 * hit-testing lives here: the click tolerance is specified in pixels, so taps
 * are tested against the same projected geometry the player can actually see.
 * The projection is recomputed only on resize, not per frame.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;

  /** Click feedback pool, driven by the input layer. */
  readonly effects = new EffectPool();

  private tree: readonly TreeSegment[] = [];
  private bounds: TreeBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private screenTree: ScreenSegment[] = [];

  /** Latest pointer position in CSS px, or `null` when the pointer has left. */
  private pointer: Vec2 | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D canvas context');
    }
    this.ctx = ctx;
    this.resize();
  }

  /** Supply the tree skeleton to draw and hit-test against. */
  setTree(tree: readonly TreeSegment[]): void {
    this.tree = tree;
    this.bounds = treeBounds(tree);
    this.projectTreeToScreen();
  }

  /** Track the pointer so the combo meter can follow it. `null` hides it. */
  setPointer(point: Vec2 | null): void {
    this.pointer = point;
  }

  /**
   * Nearest tree segment within {@link CLICK_TOLERANCE_PX} of a CSS-pixel point,
   * or `null` if the tap missed the wood.
   */
  hitTest(point: Vec2): ScreenSegment | null {
    return hitTestSegments(point, this.screenTree, CLICK_TOLERANCE_PX);
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

    this.projectTreeToScreen();
  }

  private projectTreeToScreen(): void {
    const layout = computeTreeLayout(this.cssWidth, this.cssHeight, this.bounds);
    this.screenTree = projectTree(this.tree, layout);
  }

  /**
   * Draw one frame.
   *
   * @param snapshot latest game snapshot.
   * @param _alpha   interpolation factor in `[0, 1)` for smooth motion later.
   * @param now      timestamp (ms) driving the time-based click effects.
   */
  draw(snapshot: GameSnapshot, _alpha: number, now: number = Date.now()): void {
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

    drawTree(ctx, this.screenTree);
    this.effects.draw(ctx, now);

    if (this.pointer) {
      drawComboMeter(ctx, this.pointer.x, this.pointer.y, snapshot.combo);
    }
  }
}
