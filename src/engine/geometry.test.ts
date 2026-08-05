import { describe, expect, it } from 'vitest';
import {
  angleFromDirection,
  boundsOfPoints,
  clamp,
  directionFromAngle,
  expandRect,
  lerp,
  normalize,
  quadraticPoint,
  quadraticTangent,
  rectsIntersect,
  unionRect,
} from './geometry';

describe('geometry', () => {
  it('treats angle 0 as straight up and 180 as straight down', () => {
    const up = directionFromAngle(0);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(1);

    const down = directionFromAngle(180);
    expect(down.x).toBeCloseTo(0);
    expect(down.y).toBeCloseTo(-1);

    const right = directionFromAngle(90);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(0);
  });

  it('round-trips an angle through its direction vector', () => {
    for (const angle of [-170, -45, 0, 33.5, 90, 179]) {
      expect(angleFromDirection(directionFromAngle(angle))).toBeCloseTo(angle);
    }
  });

  it('evaluates a quadratic curve at its endpoints and midpoint', () => {
    const p0 = { x: 0, y: 0 };
    const control = { x: 10, y: 5 };
    const p1 = { x: 0, y: 10 };

    expect(quadraticPoint(p0, control, p1, 0)).toEqual(p0);
    expect(quadraticPoint(p0, control, p1, 1)).toEqual(p1);

    const mid = quadraticPoint(p0, control, p1, 0.5);
    expect(mid.x).toBeCloseTo(5);
    expect(mid.y).toBeCloseTo(5);
  });

  it('produces a tangent that points along the curve', () => {
    const p0 = { x: 0, y: 0 };
    const control = { x: 0, y: 5 };
    const p1 = { x: 0, y: 10 };
    const tangent = normalize(quadraticTangent(p0, control, p1, 0.5));
    expect(tangent.x).toBeCloseTo(0);
    expect(tangent.y).toBeCloseTo(1);
  });

  it('normalizes a zero vector to straight up rather than NaN', () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 1 });
  });

  it('bounds a point set with padding', () => {
    const rect = boundsOfPoints(
      [
        { x: -2, y: 4 },
        { x: 6, y: -1 },
      ],
      1,
    );
    expect(rect).toEqual({ minX: -3, minY: -2, maxX: 7, maxY: 5 });
  });

  it('detects rect overlap, including edge contact', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(rectsIntersect(a, { minX: 5, minY: 5, maxX: 20, maxY: 20 })).toBe(true);
    expect(rectsIntersect(a, { minX: 10, minY: 0, maxX: 20, maxY: 10 })).toBe(true);
    expect(rectsIntersect(a, { minX: 11, minY: 0, maxX: 20, maxY: 10 })).toBe(false);
    expect(rectsIntersect(a, { minX: 0, minY: -20, maxX: 10, maxY: -1 })).toBe(false);
  });

  it('unions and expands rects', () => {
    const a = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const b = { minX: -5, minY: 2, maxX: 3, maxY: 4 };
    expect(unionRect(a, b)).toEqual({ minX: -5, minY: 0, maxX: 3, maxY: 4 });
    expect(expandRect(a, 2)).toEqual({ minX: -2, minY: -2, maxX: 3, maxY: 3 });
  });

  it('clamps and lerps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(1, 0, 3)).toBe(1);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
});
