/**
 * Small pure geometry helpers shared by the tree graph and the renderer.
 *
 * ## World space
 *
 * The game world uses **y-up** coordinates with the origin at the base of the
 * trunk, on the soil line:
 *
 * - `y > 0` is above ground (trunk, branches, leaves, sky).
 * - `y < 0` is below ground (roots, soil, bedrock).
 * - `x` grows to the right; one world unit is one CSS pixel at zoom `1`.
 *
 * Canvas is y-down, so the camera transform performs the flip once. Everything
 * upstream of the camera stays in the natural y-up space.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Axis-aligned bounding box in world space (y-up, so `maxY` is the top). */
export interface Rect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

/** Clamp `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation; `t` is not clamped. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Unit direction for a world angle in degrees, where `0` points straight up
 * (`+y`) and positive angles rotate toward `+x`. `180` therefore points straight
 * down, which is how root systems are authored.
 */
export function directionFromAngle(degrees: number): Vec2 {
  const rad = degToRad(degrees);
  return { x: Math.sin(rad), y: Math.cos(rad) };
}

/** Inverse of {@link directionFromAngle}: world angle in degrees for a vector. */
export function angleFromDirection(d: Vec2): number {
  return (Math.atan2(d.x, d.y) * 180) / Math.PI;
}

/** Point at parameter `t` on the quadratic Bézier `p0 → control → p1`. */
export function quadraticPoint(p0: Vec2, control: Vec2, p1: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u;
  const b = 2 * u * t;
  const c = t * t;
  return {
    x: a * p0.x + b * control.x + c * p1.x,
    y: a * p0.y + b * control.y + c * p1.y,
  };
}

/** Unnormalized tangent at parameter `t` on the quadratic Bézier. */
export function quadraticTangent(p0: Vec2, control: Vec2, p1: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: 2 * u * (control.x - p0.x) + 2 * t * (p1.x - control.x),
    y: 2 * u * (control.y - p0.y) + 2 * t * (p1.y - control.y),
  };
}

/** Normalize a vector; zero-length input returns `(0, 1)` (straight up). */
export function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) return { x: 0, y: 1 };
  return { x: v.x / len, y: v.y / len };
}

/** Bounding box of a point set, optionally grown by `padding` on every side. */
export function boundsOfPoints(points: readonly Vec2[], padding = 0): Rect {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

/** Union of two rects. */
export function unionRect(a: Rect, b: Rect): Rect {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Whether two rects overlap (touching edges count as overlapping). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Grow a rect by `padding` on every side. */
export function expandRect(rect: Rect, padding: number): Rect {
  return {
    minX: rect.minX - padding,
    minY: rect.minY - padding,
    maxX: rect.maxX + padding,
    maxY: rect.maxY + padding,
  };
}
