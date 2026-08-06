import { describe, expect, it } from 'vitest';
import { projectTree, treeBounds, type TreeBounds } from '../engine/tree';
import { TreeGraph } from '../engine/treeGraph';
import { HORIZON_RATIO } from './palette';
import { computeTreeLayout, growProgress, GROW_ANIM_MS } from './tree';

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
