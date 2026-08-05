/**
 * Camera over the y-up world.
 *
 * Owns the world → screen mapping: a centre point in world units, a zoom
 * factor, and the CSS-pixel viewport. Panning is clamped so the view can never
 * travel above cloud level or below bedrock, and zoom is clamped to
 * `[ZOOM.min, ZOOM.max]`.
 *
 * Pure math with no DOM access, so it is unit-testable; `CameraController`
 * translates pointer/wheel events into calls on this class, and `Renderer`
 * applies the transform to a canvas context. `devicePixelRatio` is handled by
 * the renderer's base transform, so everything here is in CSS pixels.
 */

import { clamp, type Rect, type Vec2 } from '../engine/geometry';
import { WORLD, ZOOM } from './palette';

export interface CameraLimits {
  /** Highest world y the viewport may reach. */
  readonly topY: number;
  /** Lowest world y the viewport may reach. */
  readonly bottomY: number;
  /** Horizontal travel of the centre, clamped to `±halfWidth`. */
  readonly halfWidth: number;
  readonly minZoom: number;
  readonly maxZoom: number;
}

export const DEFAULT_LIMITS: CameraLimits = {
  topY: WORLD.cloudY,
  bottomY: WORLD.bedrockY,
  halfWidth: WORLD.halfWidth,
  minZoom: ZOOM.min,
  maxZoom: ZOOM.max,
};

/** Where a fresh camera sits: the trunk and lower canopy, at 1× zoom. */
export const DEFAULT_CENTER: Vec2 = { x: 0, y: 150 };

export class Camera {
  /** Centre of the viewport in world coordinates. */
  private centerX = DEFAULT_CENTER.x;
  private centerY = DEFAULT_CENTER.y;
  private zoomLevel = 1;
  private width = 1;
  private height = 1;

  constructor(private readonly limits: CameraLimits = DEFAULT_LIMITS) {}

  get center(): Vec2 {
    return { x: this.centerX, y: this.centerY };
  }

  get zoom(): number {
    return this.zoomLevel;
  }

  /** Viewport size in CSS pixels. */
  get viewport(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Update the viewport size (CSS pixels) and re-clamp the view. */
  setViewport(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.clampToLimits();
  }

  /** Move the camera centre in world units. */
  setCenter(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;
    this.clampToLimits();
  }

  /** Set the zoom factor, clamped to the configured range. */
  setZoom(zoom: number): void {
    this.zoomLevel = clamp(zoom, this.limits.minZoom, this.limits.maxZoom);
    this.clampToLimits();
  }

  /**
   * Pan by a screen-space delta in CSS pixels, as produced by a drag: dragging
   * down moves the world down, i.e. reveals what is above.
   */
  panByScreen(dxScreen: number, dyScreen: number): void {
    this.centerX -= dxScreen / this.zoomLevel;
    // Screen y grows downward, world y grows upward.
    this.centerY += dyScreen / this.zoomLevel;
    this.clampToLimits();
  }

  /** Pan by a world-space delta. */
  panByWorld(dx: number, dy: number): void {
    this.centerX += dx;
    this.centerY += dy;
    this.clampToLimits();
  }

  /**
   * Multiply the zoom by `factor`, keeping the world point currently under
   * `(screenX, screenY)` anchored there. The anchor is exact unless the pan
   * clamp has to pull the view back inside the world limits.
   */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const anchor = this.screenToWorld(screenX, screenY);
    const next = clamp(this.zoomLevel * factor, this.limits.minZoom, this.limits.maxZoom);
    if (next === this.zoomLevel) return;
    this.zoomLevel = next;

    // Solve for the centre that maps `anchor` back onto the same screen point.
    this.centerX = anchor.x - (screenX - this.width / 2) / next;
    this.centerY = anchor.y + (screenY - this.height / 2) / next;
    this.clampToLimits();
  }

  worldToScreen(x: number, y: number): Vec2 {
    return {
      x: (x - this.centerX) * this.zoomLevel + this.width / 2,
      y: (this.centerY - y) * this.zoomLevel + this.height / 2,
    };
  }

  screenToWorld(x: number, y: number): Vec2 {
    return {
      x: (x - this.width / 2) / this.zoomLevel + this.centerX,
      y: this.centerY - (y - this.height / 2) / this.zoomLevel,
    };
  }

  /** World rect currently on screen, optionally grown by `marginPx` pixels. */
  visibleWorldRect(marginPx = 0): Rect {
    const halfW = this.width / 2 / this.zoomLevel;
    const halfH = this.height / 2 / this.zoomLevel;
    const margin = marginPx / this.zoomLevel;
    return {
      minX: this.centerX - halfW - margin,
      maxX: this.centerX + halfW + margin,
      minY: this.centerY - halfH - margin,
      maxY: this.centerY + halfH + margin,
    };
  }

  /**
   * Apply the world → screen transform to a context that is already scaled by
   * `devicePixelRatio`. The y axis is flipped here and nowhere else.
   */
  applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.zoomLevel, -this.zoomLevel);
    ctx.translate(-this.centerX, -this.centerY);
  }

  /**
   * Keep the visible rect inside the world limits. When the viewport is taller
   * (or wider) than the allowed span the view is centred on it instead, so
   * zooming out never jitters against the clamp.
   */
  private clampToLimits(): void {
    const { topY, bottomY, halfWidth } = this.limits;

    const halfH = this.height / 2 / this.zoomLevel;
    const span = topY - bottomY;
    if (halfH * 2 >= span) {
      this.centerY = (topY + bottomY) / 2;
    } else {
      this.centerY = clamp(this.centerY, bottomY + halfH, topY - halfH);
    }

    this.centerX = clamp(this.centerX, -halfWidth, halfWidth);
  }
}
