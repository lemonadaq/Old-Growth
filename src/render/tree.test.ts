import { describe, expect, it } from 'vitest';
import { generateTree, projectTree, treeBounds, type TreeBounds } from '../engine/tree';
import { HORIZON_RATIO } from './palette';
import { computeTreeLayout } from './tree';

const TREE = generateTree();

/** Screen-space extents of the tree once laid out on a `w × h` canvas. */
function fitted(w: number, h: number) {
  const projected = projectTree(TREE, computeTreeLayout(w, h, treeBounds(TREE)));
  const xs = projected.flatMap((s) => [s.a.x, s.b.x]);
  const ys = projected.flatMap((s) => [s.a.y, s.b.y]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys) };
}

describe('treeBounds', () => {
  it('collapses to the origin for an empty tree', () => {
    expect(treeBounds([])).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });

  it('measures both endpoints of every segment', () => {
    const bounds = treeBounds([
      { id: 'a', kind: 'trunk', depth: 0, a: { x: -3, y: 0 }, b: { x: 1, y: 7 }, width: 1 },
      { id: 'b', kind: 'branch', depth: 1, a: { x: 1, y: 7 }, b: { x: 9, y: 2 }, width: 1 },
    ]);
    expect(bounds).toEqual({ minX: -3, maxX: 9, minY: 0, maxY: 7 });
  });

  it('encloses the whole generated tree', () => {
    const bounds = treeBounds(TREE);
    expect(bounds.minY).toBe(0); // the trunk base
    expect(bounds.maxY).toBeGreaterThan(0);
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
  });
});

describe('computeTreeLayout', () => {
  it('stands the trunk base on the horizon line', () => {
    const layout = computeTreeLayout(800, 600, treeBounds(TREE));
    expect(layout.originY).toBe(Math.round(600 * HORIZON_RATIO));
  });

  it('keeps the whole canopy on screen at a range of aspect ratios', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1100, 720],
      [800, 600],
      [390, 844], // narrow phone
      [1024, 500], // short and wide
    ]) {
      const { minX, maxX, minY } = fitted(w, h);
      expect(minY, `top overflow at ${w}×${h}`).toBeGreaterThanOrEqual(0);
      expect(minX, `left overflow at ${w}×${h}`).toBeGreaterThanOrEqual(0);
      expect(maxX, `right overflow at ${w}×${h}`).toBeLessThanOrEqual(w);
    }
  });

  it('fills the space it is given rather than shrinking away from it', () => {
    const { minY } = fitted(1100, 720);
    const groundY = Math.round(720 * HORIZON_RATIO);
    // Canopy reaches into the upper part of the sky.
    expect(minY).toBeLessThan(groundY * 0.3);
  });

  it('centres the silhouette, not the trunk, when the canopy is lopsided', () => {
    // A tree leaning entirely to the right of its base.
    const lopsided: TreeBounds = { minX: 0, maxX: 2, minY: 0, maxY: 1 };
    const layout = computeTreeLayout(800, 600, lopsided);
    const left = layout.originX + lopsided.minX * layout.scale;
    const right = layout.originX + lopsided.maxX * layout.scale;
    expect((left + right) / 2).toBeCloseTo(400, 6);
  });

  it('survives a degenerate zero-extent tree', () => {
    const layout = computeTreeLayout(800, 600, { minX: 0, maxX: 0, minY: 0, maxY: 0 });
    expect(Number.isFinite(layout.scale)).toBe(true);
    expect(Number.isFinite(layout.originX)).toBe(true);
  });
});
