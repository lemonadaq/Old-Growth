import type { TreeLayout } from './tree';

/**
 * The camera looking at the tree.
 *
 * Expressed as *the world point at the centre of the viewport* plus a zoom
 * factor, rather than as a screen offset. That choice pays for itself in the
 * clamp: keeping the view between the clouds and the bedrock is a statement
 * about where the viewport edges are in world space, and this form states it
 * directly instead of unwinding a pixel offset first.
 *
 * Pure math and no DOM, so panning, zooming and clamping are all testable
 * without a canvas. Screen distances arrive in CSS pixels; the renderer owns
 * devicePixelRatio.
 */

/** Zoom limits. 1 fits the tree; below 1 pulls back, above 1 leans in. */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;

/** Highest the view may rise, in canonical units above the ground line. */
export const CLOUD_LEVEL_Y = 2.4;

/** Deepest the view may sink. Roots bottom out well above this. */
export const BEDROCK_Y = -2.4;

/** How far either side of the trunk the view may wander. */
export const HORIZONTAL_SPAN = 2;

/** One notch of keyboard or button zoom. */
export const ZOOM_STEP = 1.2;

/** The visible region of the canvas, in CSS pixels. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface Camera {
  /** World x at the centre of the viewport. */
  readonly x: number;
  /** World y at the centre of the viewport. */
  readonly y: number;
  /** Multiplier over {@link Camera.baseScale}, within the zoom limits. */
  readonly zoom: number;
  /** Screen pixels per canonical unit at zoom 1 — the "fits the tree" scale. */
  readonly baseScale: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Screen pixels per canonical unit at this camera's zoom. */
export function cameraScale(camera: Camera): number {
  return camera.baseScale * camera.zoom;
}

/** The projection this camera implies for a viewport of the given size. */
export function cameraLayout(camera: Camera, viewport: Viewport): TreeLayout {
  const scale = cameraScale(camera);
  return {
    originX: viewport.width / 2 - camera.x * scale,
    // Screen y is flipped: the world point at the centre must land at h/2.
    originY: viewport.height / 2 + camera.y * scale,
    scale,
  };
}

/**
 * Pull a camera back out of a plain fitted layout.
 *
 * The auto-fit is the camera the player starts behind, so rather than keeping
 * two ways of framing the tree, the fit is converted into a camera once and
 * everything downstream reads the camera.
 */
export function cameraFromLayout(layout: TreeLayout, viewport: Viewport): Camera {
  return {
    x: (viewport.width / 2 - layout.originX) / layout.scale,
    y: (layout.originY - viewport.height / 2) / layout.scale,
    zoom: 1,
    baseScale: layout.scale,
  };
}

/**
 * Keep the view inside the world.
 *
 * When the viewport is taller than the whole cloud-to-bedrock column — which a
 * zoomed-out camera on a tall window can be — there is no valid pan, so the
 * axis centres instead of clamping. Doing it the other way round leaves the
 * camera pinned to one edge and the tree sliding off the other.
 */
export function clampCamera(camera: Camera, viewport: Viewport): Camera {
  const zoom = clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM);
  const scale = camera.baseScale * zoom;
  const halfHeight = viewport.height / 2 / scale;
  const halfWidth = viewport.width / 2 / scale;

  const y =
    CLOUD_LEVEL_Y - BEDROCK_Y <= halfHeight * 2
      ? (CLOUD_LEVEL_Y + BEDROCK_Y) / 2
      : clamp(camera.y, BEDROCK_Y + halfHeight, CLOUD_LEVEL_Y - halfHeight);

  const x =
    HORIZONTAL_SPAN * 2 <= halfWidth * 2
      ? 0
      : clamp(camera.x, -HORIZONTAL_SPAN + halfWidth, HORIZONTAL_SPAN - halfWidth);

  return { ...camera, x, y, zoom };
}

/**
 * Drag the world by a screen-space delta.
 *
 * The world follows the finger: dragging down reveals what is above, so the
 * camera's target rises.
 */
export function panCamera(
  camera: Camera,
  dxScreen: number,
  dyScreen: number,
  viewport: Viewport,
): Camera {
  const scale = cameraScale(camera);
  return clampCamera(
    { ...camera, x: camera.x - dxScreen / scale, y: camera.y + dyScreen / scale },
    viewport,
  );
}

/**
 * Scroll the view by a wheel/trackpad delta.
 *
 * Opposite sign to a drag: scrolling down moves the *view* down the tree, the
 * same way a scrollbar does, which is what a two-finger swipe on a trackpad is
 * asking for.
 */
export function scrollCamera(
  camera: Camera,
  deltaX: number,
  deltaY: number,
  viewport: Viewport,
): Camera {
  const scale = cameraScale(camera);
  return clampCamera(
    { ...camera, x: camera.x + deltaX / scale, y: camera.y - deltaY / scale },
    viewport,
  );
}

/**
 * Zoom by `factor`, holding the world point under `cursor` in place.
 *
 * Anchoring on the cursor is what makes a pinch feel like handling the thing
 * rather than driving a slider: whatever you had your finger on stays there.
 * Passing the viewport centre as the cursor gives a plain centred zoom.
 */
export function zoomCameraAt(
  camera: Camera,
  cursor: { readonly x: number; readonly y: number },
  factor: number,
  viewport: Viewport,
): Camera {
  const zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  // Bail before dividing if the zoom was already against its limit.
  if (zoom === camera.zoom) return camera;

  const layout = cameraLayout(camera, viewport);
  // The world point currently under the cursor, which must not move.
  const worldX = (cursor.x - layout.originX) / layout.scale;
  const worldY = (layout.originY - cursor.y) / layout.scale;

  const scale = camera.baseScale * zoom;
  return clampCamera(
    {
      ...camera,
      zoom,
      x: worldX + (viewport.width / 2 - cursor.x) / scale,
      y: worldY + (cursor.y - viewport.height / 2) / scale,
    },
    viewport,
  );
}

/**
 * Adopt a new base scale (a fresh auto-fit) while holding the player's zoom and
 * their place in the world — how a resize should feel from the player's side.
 */
export function refitCamera(camera: Camera, baseScale: number, viewport: Viewport): Camera {
  return clampCamera({ ...camera, baseScale }, viewport);
}
