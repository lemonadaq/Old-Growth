import type { Vec2 } from '../engine/geometry';

/**
 * Pointer plumbing for tapping the tree.
 *
 * Taps are handled on **`pointerdown`**, not `click`. `click` only fires after
 * the matching `pointerup` and browsers coalesce or suppress it during rapid
 * tapping, so it drops inputs exactly when the player is trying hardest. Each
 * `pointerdown` is dispatched synchronously — no rAF deferral, no React state in
 * the path — which is what makes ten taps a second land as ten taps.
 *
 * Multi-touch comes free: the Pointer Events model fires one `pointerdown` per
 * contact, each with its own `pointerId`, so several fingers drumming on the
 * trunk all pay out independently.
 *
 * The surface is typed structurally rather than as `HTMLCanvasElement` so the
 * dispatch logic can be exercised in the node test environment.
 */

/** The subset of `PointerEvent` this module reads. */
export interface PointerLikeEvent {
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerId: number;
  preventDefault(): void;
}

export type PointerEventName =
  'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'pointerleave';

export type PointerListener = (event: PointerLikeEvent) => void;

/** The subset of `HTMLCanvasElement` this module needs. */
export interface PointerSurface {
  addEventListener(
    type: PointerEventName,
    listener: PointerListener,
    options?: { passive?: boolean },
  ): void;
  removeEventListener(type: PointerEventName, listener: PointerListener): void;
  getBoundingClientRect(): { readonly left: number; readonly top: number };
}

export interface TreeInputHandlers {
  /** Does this CSS-pixel point land on the tree? */
  hitTest(point: Vec2): boolean;
  /** A tap that struck wood, at the hit point in CSS pixels. */
  onHit(point: Vec2): void;
  /** The pointer moved to (or pressed at) a known position. */
  onPointerMove?(point: Vec2): void;
  /** The last pointer left the surface. */
  onPointerLeave?(): void;
}

/**
 * Attach tap handling to a surface. Returns a detach function that removes
 * every listener it added.
 */
export function attachTreeInput(surface: PointerSurface, handlers: TreeInputHandlers): () => void {
  // Tracked so one finger lifting does not hide the combo meter while another
  // is still pressed.
  const activePointers = new Set<number>();

  const toLocal = (event: PointerLikeEvent): Vec2 => {
    const rect = surface.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: PointerLikeEvent): void => {
    // Suppress text selection and synthesised mouse events on touch.
    event.preventDefault();
    activePointers.add(event.pointerId);

    const point = toLocal(event);
    handlers.onPointerMove?.(point);
    if (handlers.hitTest(point)) {
      handlers.onHit(point);
    }
  };

  const onPointerMove = (event: PointerLikeEvent): void => {
    handlers.onPointerMove?.(toLocal(event));
  };

  const onPointerRelease = (event: PointerLikeEvent): void => {
    activePointers.delete(event.pointerId);
  };

  const onPointerLeave = (event: PointerLikeEvent): void => {
    activePointers.delete(event.pointerId);
    if (activePointers.size === 0) {
      handlers.onPointerLeave?.();
    }
  };

  // Non-passive: pointerdown calls preventDefault.
  surface.addEventListener('pointerdown', onPointerDown, { passive: false });
  surface.addEventListener('pointermove', onPointerMove, { passive: true });
  surface.addEventListener('pointerup', onPointerRelease, { passive: true });
  surface.addEventListener('pointercancel', onPointerRelease, { passive: true });
  surface.addEventListener('pointerleave', onPointerLeave, { passive: true });

  return () => {
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointermove', onPointerMove);
    surface.removeEventListener('pointerup', onPointerRelease);
    surface.removeEventListener('pointercancel', onPointerRelease);
    surface.removeEventListener('pointerleave', onPointerLeave);
    activePointers.clear();
  };
}
