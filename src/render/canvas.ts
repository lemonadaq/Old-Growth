import type { GameSnapshot } from '../engine/types';
import type { TreeGraph } from '../engine/treeGraph';
import { TICK_RATE } from '../engine/loop';
import { Camera } from './camera';
import { CameraController } from './cameraController';
import { sampleKeyframes } from './color';
import { mixSky, SKY_TRACK, type SkyPalette } from './palette';
import { SceneRenderer } from './scene';
import { TreePainter } from './tree';

/**
 * Canvas 2D renderer.
 *
 * Owns the canvas, the {@link Camera}, and the input controller that drives it.
 * Each frame it reads the latest snapshot and the tree graph, and paints back to
 * front: sky gradient (lerped by the engine's time of day), distant hills, the
 * soil cross-section, then the tree itself.
 *
 * The renderer never mutates game state. `devicePixelRatio` is handled once here
 * — the base transform scales device pixels — so every drawing routine
 * downstream works in CSS pixels or world units.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera = new Camera();
  private readonly controller: CameraController;
  private readonly scene = new SceneRenderer();
  private readonly treePainter = new TreePainter();

  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private tree: TreeGraph | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D canvas context');
    }
    this.ctx = ctx;
    this.controller = new CameraController(canvas, this.camera);
    this.resize();
  }

  /** The camera, exposed for the UI (reset buttons, focus-on-node, tests). */
  get view(): Camera {
    return this.camera;
  }

  /** Nodes drawn in the last frame, after viewport culling. */
  get drawnNodes(): number {
    return this.treePainter.drawnNodes;
  }

  /** Swap in the tree to draw. Passing `null` renders the empty landscape. */
  setTree(tree: TreeGraph | null): void {
    this.tree = tree;
  }

  /** Match the backing store to the element's CSS size × devicePixelRatio. */
  resize(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));

    this.dpr = dpr;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);

    this.camera.setViewport(cssWidth, cssHeight);
    this.controller.refresh();
  }

  /** Detach input listeners. Call when the canvas goes away. */
  dispose(): void {
    this.controller.dispose();
  }

  /**
   * Draw one frame.
   *
   * @param snapshot latest game snapshot; supplies the time of day.
   * @param alpha    interpolation factor in `[0, 1)` toward the next tick, used
   *                 so sway advances smoothly between fixed simulation steps.
   */
  draw(snapshot: GameSnapshot, alpha: number): void {
    const { ctx } = this;
    // Interpolated simulated time: smooth motion at any frame rate.
    const time = snapshot.elapsedSeconds + alpha / TICK_RATE;
    const sky = sampleKeyframes<SkyPalette>(SKY_TRACK, snapshot.dayPhase, mixSky);

    // Base transform: CSS pixels → device pixels.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    // Backdrop, in screen space.
    this.scene.drawSky(ctx, this.camera, sky, snapshot.dayPhase);
    this.scene.drawHills(ctx, this.camera, sky);

    // Ground and tree, in world space (y-up, origin at the trunk base).
    ctx.save();
    this.camera.applyTransform(ctx);
    this.scene.drawSoil(ctx, this.camera, sky.ambient);
    if (this.tree) {
      this.treePainter.draw(ctx, this.tree, {
        time,
        zoom: this.camera.zoom,
        pixelScale: this.camera.zoom * this.dpr,
        // A margin keeps limbs whose sway carries them on-screen from popping in.
        viewport: this.camera.visibleWorldRect(48),
        ambient: sky.ambient,
      });
    }
    ctx.restore();
  }
}
