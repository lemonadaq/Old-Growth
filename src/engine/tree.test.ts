import { describe, expect, it } from 'vitest';
import { DEFAULT_TREE } from '../content/tree';
import { generateTree, projectTree, type TreeLayout } from './tree';

describe('generateTree', () => {
  it('is deterministic for a given seed', () => {
    expect(generateTree(DEFAULT_TREE)).toEqual(generateTree(DEFAULT_TREE));
  });

  it('produces a different silhouette for a different seed', () => {
    const other = generateTree({ ...DEFAULT_TREE, seed: DEFAULT_TREE.seed + 1 });
    expect(other).not.toEqual(generateTree(DEFAULT_TREE));
  });

  it('roots the trunk at the origin and grows upward', () => {
    const tree = generateTree(DEFAULT_TREE);
    const trunk = tree.filter((s) => s.kind === 'trunk');

    expect(trunk[0].a).toEqual({ x: 0, y: 0 });
    expect(trunk.length).toBe(DEFAULT_TREE.trunkSegments);
    for (const segment of trunk) {
      expect(segment.b.y).toBeGreaterThan(segment.a.y);
    }
  });

  it('chains trunk segments end to end', () => {
    const trunk = generateTree(DEFAULT_TREE).filter((s) => s.kind === 'trunk');
    for (let i = 1; i < trunk.length; i += 1) {
      expect(trunk[i].a).toEqual(trunk[i - 1].b);
    }
  });

  it('gives every segment a unique id and a non-zero length and width', () => {
    const tree = generateTree(DEFAULT_TREE);
    expect(new Set(tree.map((s) => s.id)).size).toBe(tree.length);

    for (const segment of tree) {
      expect(Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y)).toBeGreaterThan(0);
      expect(segment.width).toBeGreaterThan(0);
    }
  });

  it('tapers: branches are thinner than the trunk', () => {
    const tree = generateTree(DEFAULT_TREE);
    const thickestBranch = Math.max(...tree.filter((s) => s.kind === 'branch').map((s) => s.width));
    const thinnestTrunk = Math.min(...tree.filter((s) => s.kind === 'trunk').map((s) => s.width));
    expect(thickestBranch).toBeLessThan(thinnestTrunk);
  });

  it('branches out to the requested depth', () => {
    const tree = generateTree(DEFAULT_TREE);
    const depths = new Set(tree.map((s) => s.depth));
    expect(Math.max(...depths)).toBe(DEFAULT_TREE.depth);
  });
});

describe('projectTree', () => {
  const layout: TreeLayout = { originX: 400, originY: 300, scale: 200 };

  it('places the trunk base at the layout origin', () => {
    const [first] = projectTree(generateTree(DEFAULT_TREE), layout);
    expect(first.a).toEqual({ x: 400, y: 300 });
  });

  it('flips the y axis so canonical “up” draws upward on the canvas', () => {
    const projected = projectTree(
      [{ id: 'up', kind: 'trunk', depth: 0, a: { x: 0, y: 0 }, b: { x: 0, y: 1 }, width: 0.1 }],
      layout,
    );
    expect(projected[0].b).toEqual({ x: 400, y: 100 });
  });

  it('scales widths into pixels alongside positions', () => {
    const projected = projectTree(
      [{ id: 'w', kind: 'trunk', depth: 0, a: { x: 0, y: 0 }, b: { x: 0.5, y: 0 }, width: 0.075 }],
      layout,
    );
    expect(projected[0].b.x).toBe(500);
    expect(projected[0].width).toBeCloseTo(15, 10);
  });

  it('preserves segment identity and count', () => {
    const tree = generateTree(DEFAULT_TREE);
    const projected = projectTree(tree, layout);
    expect(projected.map((s) => s.id)).toEqual(tree.map((s) => s.id));
  });
});
