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
  /**
   * `'touch'`, `'pen'` or `'mouse'`. Optional because most of this module does
   * not care what pressed it — only the long-press does, and only because a
   * mouse already has hover to ask a limb what it is.
   */
  readonly pointerType?: string;
  preventDefault(): void;
}

/** The subset of `WheelEvent` this module reads. */
export interface WheelLikeEvent {
  readonly clientX: number;
  readonly clientY: number;
  readonly deltaX: number;
  readonly deltaY: number;
  /** Set by trackpad pinch gestures, which browsers report as a ctrl+wheel. */
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  preventDefault(): void;
}

export type PointerEventName =
  'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'pointerleave';

export type PointerListener = (event: PointerLikeEvent) => void;
export type WheelListener = (event: WheelLikeEvent) => void;

/** The subset of `HTMLCanvasElement` this module needs. */
export interface PointerSurface {
  addEventListener(
    type: PointerEventName,
    listener: PointerListener,
    options?: { passive?: boolean },
  ): void;
  addEventListener(type: 'wheel', listener: WheelListener, options?: { passive?: boolean }): void;
  removeEventListener(type: PointerEventName, listener: PointerListener): void;
  removeEventListener(type: 'wheel', listener: WheelListener): void;
  getBoundingClientRect(): { readonly left: number; readonly top: number };
}

/**
 * How far a press must travel before it counts as a drag rather than a tap.
 *
 * The tap has *already* paid out by then — taps resolve on `pointerdown` and
 * that is not negotiable (see above). So this threshold does not decide between
 * tap and drag; it only decides when to also start moving the camera, which is
 * why it can afford to be small.
 */
export const DRAG_THRESHOLD_PX = 6;

/** One notch of wheel zoom, per 100 units of ctrl+wheel delta. */
export const WHEEL_ZOOM_RATE = 1.15;

/**
 * How long a finger has to rest on the tree before it counts as a long press.
 *
 * There is no hover on a touchscreen, so every tooltip in the game — what a
 * leaf is producing, what a dial costs, why a graft is refused — is unreachable
 * on a phone. Holding still is the gesture the platform has trained people to
 * use for "tell me about this", and half a second is the interval iOS itself
 * uses before it shows its own callout.
 */
export const LONG_PRESS_MS = 500;

/**
 * How far a finger may wander and still be holding still.
 *
 * Deliberately smaller than {@link DRAG_THRESHOLD_PX}: once a press has become
 * a camera drag it is definitely not a question about a limb, so the long press
 * has to give up first.
 */
export const LONG_PRESS_SLOP_PX = 4;

/** Zoom factor for a pinch/ctrl+wheel of `deltaY`. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.pow(WHEEL_ZOOM_RATE, -deltaY / 100);
}

export interface TreeInputHandlers {
  /**
   * First refusal on a press, before the tree ever sees it. Return `true` to
   * consume the event — the radial grow menu uses this so that tapping a dial
   * buys a part instead of also paying out Sap underneath it.
   */
  onPress?(point: Vec2): boolean;
  /** Does this CSS-pixel point land on the tree? */
  hitTest(point: Vec2): boolean;
  /** A tap that struck wood, at the hit point in CSS pixels. */
  onHit(point: Vec2): void;
  /** A press that struck neither an overlay nor the tree. */
  onMiss?(point: Vec2): void;
  /** The pointer moved to (or pressed at) a known position. */
  onPointerMove?(point: Vec2): void;
  /** The last pointer left the surface. */
  onPointerLeave?(): void;
  /** A held pointer dragged by `dx, dy` CSS pixels since the last move. */
  onDrag?(dx: number, dy: number): void;
  /** A wheel/trackpad scroll, in CSS pixels of intended travel. */
  onScroll?(deltaX: number, deltaY: number): void;
  /** A pinch or ctrl+wheel: multiply the zoom by `factor`, about `at`. */
  onZoom?(factor: number, at: Vec2): void;
  /**
   * A finger held still on the tree for {@link LONG_PRESS_MS}. The touchscreen's
   * substitute for hovering: the tap has already paid out by the time this
   * fires, so this is purely "and also, tell me what this is".
   */
  onLongPress?(point: Vec2): void;
}

/**
 * Attach tap handling to a surface. Returns a detach function that removes
 * every listener it added.
 */
export function attachTreeInput(surface: PointerSurface, handlers: TreeInputHandlers): () => void {
  // Tracked so one finger lifting does not hide the combo meter while another
  // is still pressed.
  const activePointers = new Set<number>();

  /** Where each held pointer was last seen, and whether it is dragging yet. */
  const drags = new Map<number, { last: Vec2; origin: Vec2; dragging: boolean }>();

  /**
   * Distance between two fingers on the previous move, so a pinch can be read
   * as a ratio. `null` whenever fewer than two are down.
   */
  let pinchDistance: number | null = null;

  /** The pending long press, if a finger is currently resting somewhere. */
  let longPress: ReturnType<typeof setTimeout> | null = null;

  const cancelLongPress = (): void => {
    if (longPress === null) return;
    clearTimeout(longPress);
    longPress = null;
  };

  const toLocal = (event: PointerLikeEvent | WheelLikeEvent): Vec2 => {
    const rect = surface.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /** The point a pinch should zoom about: halfway between the two fingers. */
  const pinchState = (): { distance: number; at: Vec2 } | null => {
    const points = [...drags.values()].map((drag) => drag.last);
    if (points.length !== 2) return null;
    const [a, b] = points;
    return {
      distance: Math.hypot(b.x - a.x, b.y - a.y),
      at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const onPointerDown = (event: PointerLikeEvent): void => {
    // Suppress text selection and synthesised mouse events on touch.
    event.preventDefault();
    activePointers.add(event.pointerId);

    const point = toLocal(event);
    drags.set(event.pointerId, { last: point, origin: point, dragging: false });
    handlers.onPointerMove?.(point);

    // A second finger ends any question the first was asking and starts a pinch.
    cancelLongPress();
    if (activePointers.size === 2) {
      pinchDistance = pinchState()?.distance ?? null;
    } else if (activePointers.size === 1 && event.pointerType !== 'mouse') {
      longPress = setTimeout(() => {
        longPress = null;
        handlers.onLongPress?.(point);
      }, LONG_PRESS_MS);
    }

    if (handlers.onPress?.(point)) return;
    if (handlers.hitTest(point)) {
      handlers.onHit(point);
    } else {
      handlers.onMiss?.(point);
    }
  };

  const onPointerMove = (event: PointerLikeEvent): void => {
    const point = toLocal(event);
    const drag = drags.get(event.pointerId);

    // A second finger means a pinch: panning with either of them would fight the
    // gesture, so the drag branch stands down until one lifts.
    if (drag && activePointers.size === 1) {
      if (!drag.dragging) {
        const travelled = Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y);
        if (travelled >= DRAG_THRESHOLD_PX) drag.dragging = true;
      }
      if (drag.dragging) {
        handlers.onDrag?.(point.x - drag.last.x, point.y - drag.last.y);
      }
    }

    if (drag) {
      // Anything more than a wobble and the finger is going somewhere, not
      // asking about what is under it.
      const wander = Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y);
      if (wander >= LONG_PRESS_SLOP_PX) cancelLongPress();
      drag.last = point;
    }

    if (activePointers.size === 2) {
      const pinch = pinchState();
      if (pinch && pinchDistance !== null && pinchDistance > 0 && pinch.distance > 0) {
        handlers.onZoom?.(pinch.distance / pinchDistance, pinch.at);
      }
      if (pinch) pinchDistance = pinch.distance;
    }

    handlers.onPointerMove?.(point);
  };

  const onPointerRelease = (event: PointerLikeEvent): void => {
    activePointers.delete(event.pointerId);
    drags.delete(event.pointerId);
    cancelLongPress();
    // Lifting one finger of a pinch must not be read as a sudden zoom when the
    // next one comes down: the gesture starts again from wherever it starts.
    if (activePointers.size < 2) pinchDistance = null;
  };

  const onPointerLeave = (event: PointerLikeEvent): void => {
    activePointers.delete(event.pointerId);
    drags.delete(event.pointerId);
    cancelLongPress();
    if (activePointers.size < 2) pinchDistance = null;
    if (activePointers.size === 0) {
      handlers.onPointerLeave?.();
    }
  };

  const onWheel = (event: WheelLikeEvent): void => {
    // Always: the page behind the canvas must not scroll or pinch-zoom.
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      handlers.onZoom?.(wheelZoomFactor(event.deltaY), toLocal(event));
    } else {
      handlers.onScroll?.(event.deltaX, event.deltaY);
    }
  };

  // Non-passive: pointerdown and wheel both call preventDefault.
  surface.addEventListener('pointerdown', onPointerDown, { passive: false });
  surface.addEventListener('pointermove', onPointerMove, { passive: true });
  surface.addEventListener('pointerup', onPointerRelease, { passive: true });
  surface.addEventListener('pointercancel', onPointerRelease, { passive: true });
  surface.addEventListener('pointerleave', onPointerLeave, { passive: true });
  surface.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointermove', onPointerMove);
    surface.removeEventListener('pointerup', onPointerRelease);
    surface.removeEventListener('pointercancel', onPointerRelease);
    surface.removeEventListener('pointerleave', onPointerLeave);
    surface.removeEventListener('wheel', onWheel);
    cancelLongPress();
    activePointers.clear();
    drags.clear();
    pinchDistance = null;
  };
}
