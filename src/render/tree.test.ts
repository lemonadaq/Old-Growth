import { describe, expect, it } from 'vitest';
import { projectTree, treeBounds, type ScreenSegment, type TreeBounds } from '../engine/tree';
import { TreeGraph } from '../engine/treeGraph';
import { HORIZON_RATIO } from './palette';
import {
  computeTreeLayout,
  cullSegments,
  growProgress,
  isSegmentVisible,
  swayOffset,
  GROW_ANIM_MS,
} from './tree';

/** A grown tree with canopy and roots, so the layout has both halves to fit. */
function demoTree() {
  const graph = TreeGraph.seedling();
  const first = graph.grow(graph.rootId, 'branch');
  const second = graph.grow(graph.rootId, 'branch');
  const root = graph.grow(graph.rootId, 'rootSegment');
  if (!first || !second || !root) throw new Error('fixture failed to grow');

  graph.grow(first.id, 'leafCluster');
  graph.grow(first.id, 'twig');
  graph.grow(second.id, 'leafCluster');
  graph.grow(root.id, 'rootTip');
  return graph.toSegments();
}

const TREE = demoTree();

/** Screen-space extents of the tree once laid out on a `w × h` canvas. */
function fitted(w: number, h: number) {
  const projected = projectTree(TREE, computeTreeLayout(w, h, treeBounds(TREE)));
  const xs = projected.flatMap((s) => [s.a.x, s.b.x]);
  const ys = projected.flatMap((s) => [s.a.y, s.b.y]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
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

  it('encloses the whole tree, roots included', () => {
    const bounds = treeBounds(TREE);
    expect(bounds.maxY).toBeGreaterThan(0); // canopy
    expect(bounds.minY).toBeLessThan(0); // underground
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
  });
});

describe('computeTreeLayout', () => {
  it('stands the trunk base on the horizon line', () => {
    const layout = computeTreeLayout(800, 600, treeBounds(TREE));
    expect(layout.originY).toBe(Math.round(600 * HORIZON_RATIO));
  });

  it('keeps the whole tree on screen at a range of aspect ratios', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1100, 720],
      [800, 600],
      [390, 844], // narrow phone
      [1024, 500], // short and wide
    ]) {
      const { minX, maxX, minY, maxY } = fitted(w, h);
      expect(minY, `top overflow at ${w}×${h}`).toBeGreaterThanOrEqual(0);
      expect(maxY, `bottom overflow at ${w}×${h}`).toBeLessThanOrEqual(h);
      expect(minX, `left overflow at ${w}×${h}`).toBeGreaterThanOrEqual(0);
      expect(maxX, `right overflow at ${w}×${h}`).toBeLessThanOrEqual(w);
    }
  });

  it('fills the space it is given rather than shrinking away from it', () => {
    const { minY } = fitted(1100, 720);
    const groundY = Math.round(720 * HORIZON_RATIO);
    // Canopy reaches into the upper part of the sky.
    expect(minY).toBeLessThan(groundY * 0.35);
  });

  it('does not blow a seedling up to fill the whole sky', () => {
    // Before the reference height existed, a lone trunk was scaled to fill the
    // sky and then visibly shrank with the first branch bought.
    const seedling = TreeGraph.seedling().toSegments();
    const layout = computeTreeLayout(800, 600, treeBounds(seedling));
    const groundY = Math.round(600 * HORIZON_RATIO);
    const top = layout.originY - treeBounds(seedling).maxY * layout.scale;
    expect(top).toBeGreaterThan(groundY * 0.3);
  });

  it('fits the roots into the soil, not just the canopy into the sky', () => {
    // A tree that is mostly underground must still be scaled by its depth.
    const deep: TreeBounds = { minX: -0.2, maxX: 0.2, minY: -4, maxY: 0.6 };
    const layout = computeTreeLayout(800, 600, deep);
    const groundY = Math.round(600 * HORIZON_RATIO);
    const deepest = layout.originY - deep.minY * layout.scale;
    expect(deepest).toBeLessThanOrEqual(600);
    expect(deepest).toBeGreaterThan(groundY);
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

describe('growProgress', () => {
  it('treats parts with no recorded spawn as fully grown', () => {
    expect(growProgress(1000, undefined)).toBe(1);
  });

  it('starts at zero and finishes at one', () => {
    expect(growProgress(1000, 1000)).toBe(0);
    expect(growProgress(1000 + GROW_ANIM_MS, 1000)).toBe(1);
  });

  it('eases out: past halfway by the midpoint of the animation', () => {
    const mid = growProgress(1000 + GROW_ANIM_MS / 2, 1000);
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
  });

  it('clamps rather than overshooting once the animation is over', () => {
    expect(growProgress(9999, 1000)).toBe(1);
  });
});

describe('swayOffset', () => {
  it('is deterministic per node and moment', () => {
    expect(swayOffset('leaf-3', 5000, 20)).toEqual(swayOffset('leaf-3', 5000, 20));
  });

  it('gives neighbouring clusters different phases', () => {
    // A canopy that swayed in lockstep would read as one moving slab.
    const a = swayOffset('leaf-a', 5000, 20).dx;
    const b = swayOffset('leaf-b', 5000, 20).dx;
    expect(a).not.toBeCloseTo(b);
  });

  it('stays within a fraction of the cluster radius', () => {
    for (let now = 0; now < 8000; now += 97) {
      const { dx, dy } = swayOffset('leaf-7', now, 20);
      expect(Math.abs(dx)).toBeLessThanOrEqual(20 * 0.25);
      expect(Math.abs(dy)).toBeLessThanOrEqual(20 * 0.25);
    }
  });

  it('actually moves over time', () => {
    const still = swayOffset('leaf-7', 0, 20);
    const later = swayOffset('leaf-7', 850, 20);
    expect(later.dx).not.toBeCloseTo(still.dx);
  });

  it('scales with the cluster it belongs to', () => {
    expect(swayOffset('leaf-7', 1200, 40).dx).toBeCloseTo(swayOffset('leaf-7', 1200, 20).dx * 2);
  });
});

describe('culling', () => {
  const VIEWPORT = { width: 800, height: 600 };

  /** A segment from `a` to `b` with a modest width. */
  const seg = (ax: number, ay: number, bx: number, by: number): ScreenSegment => ({
    id: `${ax},${ay}-${bx},${by}`,
    kind: 'branch',
    depth: 1,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    width: 4,
  });

  it('keeps what is on screen', () => {
    expect(isSegmentVisible(seg(100, 100, 200, 300), VIEWPORT)).toBe(true);
  });

  it('keeps a segment that merely crosses the viewport', () => {
    expect(isSegmentVisible(seg(-500, 300, 1500, 300), VIEWPORT)).toBe(true);
  });

  it('drops what is well outside on every side', () => {
    expect(isSegmentVisible(seg(-900, 300, -820, 300), VIEWPORT)).toBe(false);
    expect(isSegmentVisible(seg(1600, 300, 1700, 300), VIEWPORT)).toBe(false);
    expect(isSegmentVisible(seg(400, -900, 400, -820), VIEWPORT)).toBe(false);
    expect(isSegmentVisible(seg(400, 1400, 400, 1480), VIEWPORT)).toBe(false);
  });

  it('keeps a segment just off the edge, whose foliage would still show', () => {
    expect(isSegmentVisible(seg(-6, 300, -4, 300), VIEWPORT, 12)).toBe(true);
  });

  it('filters a mixed set and preserves order', () => {
    const kept = cullSegments(
      [seg(0, 0, 50, 50), seg(-9000, 0, -8900, 0), seg(400, 300, 420, 320)],
      VIEWPORT,
    );
    expect(kept.map((s) => s.id)).toEqual(['0,0-50,50', '400,300-420,320']);
  });

  it('leaves an on-screen tree untouched', () => {
    const projected = projectTree(TREE, computeTreeLayout(800, 600, treeBounds(TREE)));
    expect(cullSegments(projected, VIEWPORT)).toHaveLength(projected.length);
  });
});
