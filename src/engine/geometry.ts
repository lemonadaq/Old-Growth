/**
 * Minimal 2D geometry helpers used for pointer hit-testing against the tree.
 *
 * Pure math, no DOM. Distances are expressed in whatever space the caller works
 * in — the click path projects the tree into screen (CSS pixel) space first so
 * the hit tolerance can be specified in pixels.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** A straight line segment from `a` to `b`. */
export interface Segment {
  readonly a: Vec2;
  readonly b: Vec2;
}

/**
 * Shortest distance from point `p` to the *segment* `a→b` (not the infinite
 * line): the projection parameter is clamped to `[0, 1]` so points beyond an
 * endpoint measure to that endpoint.
 */
export function distanceToSegment(p: Vec2, seg: Segment): number {
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const lengthSq = dx * dx + dy * dy;

  // Degenerate segment (a === b): fall back to point distance.
  if (lengthSq === 0) {
    return Math.hypot(p.x - seg.a.x, p.y - seg.a.y);
  }

  const t = Math.min(1, Math.max(0, ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / lengthSq));
  const closestX = seg.a.x + t * dx;
  const closestY = seg.a.y + t * dy;
  return Math.hypot(p.x - closestX, p.y - closestY);
}

/**
 * The segment nearest to `p`, or `null` when `segments` is empty.
 *
 * Ties resolve to the earliest segment in iteration order.
 */
export function nearestSegment<T extends Segment>(
  p: Vec2,
  segments: readonly T[],
): { segment: T; distance: number } | null {
  let best: T | null = null;
  let bestDistance = Infinity;

  for (const segment of segments) {
    const distance = distanceToSegment(p, segment);
    if (distance < bestDistance) {
      best = segment;
      bestDistance = distance;
    }
  }

  return best === null ? null : { segment: best, distance: bestDistance };
}

/**
 * Hit-test `p` against a set of segments.
 *
 * A segment's own half-width counts toward the hit area, so thick trunk pieces
 * are easier to hit than twigs, and `tolerance` is added on top of that as a
 * forgiving margin (see `CLICK_TOLERANCE_PX`). Returns the nearest hit segment
 * or `null`.
 */
export function hitTestSegments<T extends Segment & { readonly width?: number }>(
  p: Vec2,
  segments: readonly T[],
  tolerance: number,
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;

  for (const segment of segments) {
    const reach = tolerance + (segment.width ?? 0) / 2;
    const distance = distanceToSegment(p, segment);
    if (distance <= reach && distance < bestDistance) {
      best = segment;
      bestDistance = distance;
    }
  }

  return best;
}
