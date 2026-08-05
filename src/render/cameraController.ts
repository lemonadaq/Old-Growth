/**
 * Translates pointer, wheel, and touch input into {@link Camera} movement.
 *
 * - **Drag** (mouse or single touch) pans the view; the world follows the
 *   pointer one-to-one at any zoom.
 * - **Wheel / two-finger trackpad scroll** pans vertically (and horizontally
 *   when the device reports `deltaX`).
 * - **Ctrl+wheel** — which is what a trackpad pinch reports — and **two-finger
 *   pinch** on touch zoom around the cursor / pinch midpoint.
 *
 * Pointer Events cover mouse, pen, and touch with one code path, so trackpad
 * drag and touch drag behave identically.
 */

import { Camera } from './camera';

/** Wheel deltas arrive in lines or pages on some browsers; normalise to pixels. */
const LINE_HEIGHT_PX = 16;

/** How strongly a ctrl+wheel delta maps onto a zoom multiplier. */
const ZOOM_SENSITIVITY = 0.0035;

/** Largest zoom change a single wheel event may apply. */
const MAX_WHEEL_ZOOM_STEP = 1.4;

interface PointerSample {
  x: number;
  y: number;
}

export class CameraController {
  private readonly pointers = new Map<number, PointerSample>();
  private rect: DOMRect;
  /** Distance between the two active pointers on the previous move event. */
  private pinchDistance = 0;
  private disposed = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: Camera,
  ) {
    this.rect = element.getBoundingClientRect();

    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('pointerleave', this.onPointerUp);
    // Not passive: panning and zooming must suppress page scroll / browser zoom.
    element.addEventListener('wheel', this.onWheel, { passive: false });

    element.style.cursor = 'grab';
  }

  /** Re-read the element's bounding box. Call after a resize or layout change. */
  refresh(): void {
    this.rect = this.element.getBoundingClientRect();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('pointerleave', this.onPointerUp);
    this.element.removeEventListener('wheel', this.onWheel);
    this.pointers.clear();
    this.element.style.cursor = '';
  }

  private toLocal(event: { clientX: number; clientY: number }): PointerSample {
    return { x: event.clientX - this.rect.left, y: event.clientY - this.rect.top };
  }

  private onPointerDown = (event: PointerEvent): void => {
    // Only primary-button drags; right-click stays free for future context menus.
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    this.refresh();
    this.element.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, this.toLocal(event));
    this.pinchDistance = this.currentPinchDistance();
    this.element.style.cursor = 'grabbing';
  };

  private onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;

    const current = this.toLocal(event);
    this.pointers.set(event.pointerId, current);

    if (this.pointers.size >= 2) {
      this.handlePinch();
      return;
    }

    this.camera.panByScreen(current.x - previous.x, current.y - previous.y);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.pointers.delete(event.pointerId)) return;
    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    this.pinchDistance = this.currentPinchDistance();
    if (this.pointers.size === 0) {
      this.element.style.cursor = 'grab';
    }
  };

  /** Two-finger pinch: zoom by the distance ratio, pan by the midpoint drift. */
  private handlePinch(): void {
    const distance = this.currentPinchDistance();
    const midpoint = this.pinchMidpoint();
    if (distance <= 0 || !midpoint) return;

    if (this.pinchDistance > 0) {
      this.camera.zoomAt(midpoint.x, midpoint.y, distance / this.pinchDistance);
    }
    this.pinchDistance = distance;
  }

  private currentPinchDistance(): number {
    if (this.pointers.size < 2) return 0;
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  private pinchMidpoint(): PointerSample | null {
    if (this.pointers.size < 2) return null;
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const { x, y } = this.toLocal(event);
    const { deltaX, deltaY } = normaliseWheel(event, this.rect.height);

    if (event.ctrlKey) {
      // Trackpad pinch (and ctrl+wheel on a mouse) zooms around the cursor.
      const factor = clampFactor(Math.exp(-deltaY * ZOOM_SENSITIVITY));
      this.camera.zoomAt(x, y, factor);
      return;
    }

    // Plain wheel / two-finger scroll pans: scrolling down reveals what is below.
    this.camera.panByScreen(-deltaX, -deltaY);
  };
}

function clampFactor(factor: number): number {
  return Math.min(MAX_WHEEL_ZOOM_STEP, Math.max(1 / MAX_WHEEL_ZOOM_STEP, factor));
}

/** Convert a wheel event's delta into CSS pixels regardless of `deltaMode`. */
export function normaliseWheel(
  event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode'>,
  viewportHeight: number,
): { deltaX: number; deltaY: number } {
  let scale = 1;
  if (event.deltaMode === 1) scale = LINE_HEIGHT_PX;
  else if (event.deltaMode === 2) scale = Math.max(1, viewportHeight);
  return { deltaX: event.deltaX * scale, deltaY: event.deltaY * scale };
}
