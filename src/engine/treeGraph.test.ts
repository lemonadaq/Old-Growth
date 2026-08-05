import { describe, expect, it } from 'vitest';
import { DEMO_TREE } from '../content/demoTree';
import type { TreeSpec } from '../content/treeSpec';
import {
  buildTreeGraph,
  collectVisibleNodes,
  limbPointAt,
  limbWidthAt,
  visibleNodes,
  type LimbNode,
  type TreeNode,
} from './treeGraph';

const MINIMAL: TreeSpec = {
  species: 'oak',
  seed: 7,
  branches: [
    { id: 'trunk', parent: null, angle: 0, length: 200, width: 36, taper: 0.5, curve: 0.04 },
    { id: 'limb', parent: 'trunk', attach: 0.5, angle: 30, length: 100 },
  ],
  roots: [{ id: 'tap', parent: null, angle: 180, length: 120, width: 24 }],
  leaves: [{ id: 'leaf', parent: 'limb', attach: 1, radius: 30 }],
};

function limb(graph: ReturnType<typeof buildTreeGraph>, id: string): LimbNode {
  const node = graph.byId.get(id);
  if (!node || node.kind === 'leaf') throw new Error(`no limb "${id}"`);
  return node;
}

describe('buildTreeGraph', () => {
  it('places the trunk from the origin straight up', () => {
    const graph = buildTreeGraph(MINIMAL);
    const trunk = limb(graph, 'trunk');

    expect(trunk.start).toEqual({ x: 0, y: 0 });
    expect(trunk.end.x).toBeCloseTo(0);
    expect(trunk.end.y).toBeCloseTo(200);
    expect(trunk.depth).toBe(0);
    // A positive curve bows an upward limb toward +x.
    expect(trunk.control.x).toBeCloseTo(8);
    expect(trunk.control.y).toBeCloseTo(100);
  });

  it('sends the taproot straight down', () => {
    const graph = buildTreeGraph(MINIMAL);
    const tap = limb(graph, 'tap');
    expect(tap.end.y).toBeCloseTo(-120);
    expect(tap.kind).toBe('root');
  });

  it('attaches a child limb exactly at the point on its parent curve', () => {
    const graph = buildTreeGraph(MINIMAL);
    const trunk = limb(graph, 'trunk');
    const child = limb(graph, 'limb');
    const expected = limbPointAt(trunk, 0.5);

    expect(child.start.x).toBeCloseTo(expected.x);
    expect(child.start.y).toBeCloseTo(expected.y);
    expect(child.depth).toBe(1);
    expect(child.attach).toBe(0.5);
  });

  it('inherits width from the parent at the attachment point and tapers', () => {
    const graph = buildTreeGraph(MINIMAL);
    const trunk = limb(graph, 'trunk');
    const child = limb(graph, 'limb');

    expect(trunk.baseWidth).toBe(36);
    expect(trunk.tipWidth).toBeCloseTo(18);
    expect(limbWidthAt(trunk, 0)).toBeCloseTo(36);
    expect(limbWidthAt(trunk, 1)).toBeCloseTo(18);
    expect(limbWidthAt(trunk, 0.5)).toBeCloseTo(27);

    // Default width scale of 0.62 applied to the parent's local width.
    expect(child.baseWidth).toBeCloseTo(27 * 0.62);
    expect(child.tipWidth).toBeLessThan(child.baseWidth);
  });

  it('gives every node bounds that contain its geometry', () => {
    const graph = buildTreeGraph(MINIMAL);
    for (const node of graph.nodes) {
      if (node.kind === 'leaf') {
        expect(node.position.x).toBeGreaterThanOrEqual(node.bounds.minX);
        expect(node.position.x).toBeLessThanOrEqual(node.bounds.maxX);
      } else {
        expect(node.start.x).toBeGreaterThanOrEqual(node.bounds.minX);
        expect(node.end.y).toBeLessThanOrEqual(node.bounds.maxY);
        expect(node.end.y).toBeGreaterThanOrEqual(node.bounds.minY);
      }
    }
    expect(graph.bounds.maxY).toBeGreaterThan(200);
    expect(graph.bounds.minY).toBeLessThan(-100);
  });

  it('builds 3-5 blobs per leaf cluster, deterministically', () => {
    const first = buildTreeGraph(DEMO_TREE);
    const second = buildTreeGraph(DEMO_TREE);

    for (const leaf of first.leaves) {
      expect(leaf.blobs.length).toBeGreaterThanOrEqual(3);
      expect(leaf.blobs.length).toBeLessThanOrEqual(5);
    }
    // Same seed, same decoration: safe to rebuild the graph at any time.
    expect(second.leaves.map((l) => l.blobs)).toEqual(first.leaves.map((l) => l.blobs));
  });

  it('rejects limbs whose parent has not been declared yet', () => {
    expect(() =>
      buildTreeGraph({
        species: 'oak',
        seed: 1,
        branches: [{ id: 'a', parent: 'missing', angle: 0, length: 10 }],
        roots: [],
        leaves: [],
      }),
    ).toThrow(/must attach to a limb/);
  });

  it('draws roots first, then branches by depth, then leaves', () => {
    const graph = buildTreeGraph(DEMO_TREE);
    const kinds = graph.nodes.map((n) => n.kind);
    expect(kinds.indexOf('branch')).toBeGreaterThan(kinds.lastIndexOf('root'));
    expect(kinds.indexOf('leaf')).toBeGreaterThan(kinds.lastIndexOf('branch'));

    const depths = graph.branches.map((b) => b.depth);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
  });
});

describe('demo tree', () => {
  it('matches the STEP 4 acceptance shape: 12 branches, 20 leaves, 8 roots', () => {
    const graph = buildTreeGraph(DEMO_TREE);
    expect(graph.branches).toHaveLength(12);
    expect(graph.leaves).toHaveLength(20);
    expect(graph.roots).toHaveLength(8);
    expect(graph.nodes).toHaveLength(40);
  });

  it('keeps the canopy above ground and the roots below it', () => {
    const graph = buildTreeGraph(DEMO_TREE);
    for (const branch of graph.branches) {
      expect(branch.end.y).toBeGreaterThan(0);
    }
    for (const leaf of graph.leaves) {
      expect(leaf.position.y).toBeGreaterThan(0);
    }
    for (const root of graph.roots) {
      expect(root.end.y).toBeLessThan(0);
    }
  });
});

describe('viewport culling', () => {
  it('returns nothing when the viewport is far from the tree', () => {
    const graph = buildTreeGraph(DEMO_TREE);
    expect(visibleNodes(graph, { minX: 9000, minY: 9000, maxX: 9500, maxY: 9500 })).toHaveLength(0);
  });

  it('returns every node when the viewport contains the whole tree', () => {
    const graph = buildTreeGraph(DEMO_TREE);
    expect(visibleNodes(graph, graph.bounds)).toHaveLength(graph.nodes.length);
  });

  it('culls to the canopy when the viewport is above the soil line', () => {
    const graph = buildTreeGraph(DEMO_TREE);
    const canopy = visibleNodes(graph, { minX: -400, minY: 250, maxX: 400, maxY: 700 });

    expect(canopy.length).toBeGreaterThan(0);
    expect(canopy.length).toBeLessThan(graph.nodes.length);
    expect(canopy.some((node) => node.kind === 'root')).toBe(false);
  });

  it('reuses the output array so the draw loop allocates nothing', () => {
    const graph = buildTreeGraph(DEMO_TREE);
    const out: TreeNode[] = [];

    expect(collectVisibleNodes(graph, graph.bounds, out)).toBe(out);
    expect(out).toHaveLength(graph.nodes.length);
    // Draw order survives culling.
    expect(out[0]).toBe(graph.nodes[0]);

    // A second pass replaces the contents rather than appending to them.
    collectVisibleNodes(graph, { minX: 9000, minY: 9000, maxX: 9500, maxY: 9500 }, out);
    expect(out).toHaveLength(0);
  });
});
