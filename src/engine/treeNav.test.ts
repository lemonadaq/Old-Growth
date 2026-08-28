import { describe, expect, it } from 'vitest';
import type { TreeNodeType } from '../content/growth';
import { TreeGraph, type TreeNode } from './treeGraph';
import { focusOrTrunk, navigate, siblingsLeftToRight } from './treeNav';

function growOrThrow(graph: TreeGraph, parentId: string, type: TreeNodeType): TreeNode {
  const node = graph.grow(parentId, type);
  if (!node) throw new Error(`could not grow ${type} on ${parentId}`);
  return node;
}

/** A trunk with three branches, one of which carries a twig and a leaf. */
function tree() {
  const graph = TreeGraph.seedling(7);
  const first = growOrThrow(graph, graph.rootId, 'branch');
  const second = growOrThrow(graph, graph.rootId, 'branch');
  const third = growOrThrow(graph, graph.rootId, 'branch');
  const twig = growOrThrow(graph, first.id, 'twig');
  const leaf = growOrThrow(graph, twig.id, 'leafCluster');
  return { graph, first, second, third, twig, leaf };
}

describe('entering the tree', () => {
  it('lands on the trunk from nothing, whichever way the player pressed', () => {
    const { graph } = tree();
    for (const direction of ['out', 'in', 'left', 'right'] as const) {
      expect(navigate(graph, null, direction)).toBe(graph.rootId);
    }
  });

  it('recovers to the trunk when the focused part no longer exists', () => {
    const { graph, first } = tree();
    graph.prune(first.id);
    expect(focusOrTrunk(graph, first.id)).toBe(graph.rootId);
  });

  it('leaves a part that still exists alone', () => {
    const { graph, second } = tree();
    expect(focusOrTrunk(graph, second.id)).toBe(second.id);
  });
});

describe('out and in', () => {
  it('steps to a child and back to the parent', () => {
    const { graph, first, twig } = tree();
    expect(navigate(graph, first.id, 'out')).toBe(twig.id);
    expect(navigate(graph, twig.id, 'in')).toBe(first.id);
  });

  it('follows the straightest child rather than the oldest', () => {
    const { graph } = tree();
    const trunk = graph.node(graph.rootId);
    if (!trunk) throw new Error('no trunk');

    const children = trunk.childIds
      .map((id) => graph.node(id))
      .filter((n): n is TreeNode => n !== undefined);
    const straightest = children.reduce((best, node) =>
      Math.abs(node.angle) < Math.abs(best.angle) ? node : best,
    );

    expect(navigate(graph, graph.rootId, 'out')).toBe(straightest.id);
  });

  it('stays put at the tip and at the trunk', () => {
    const { graph, leaf } = tree();
    expect(navigate(graph, leaf.id, 'out')).toBe(leaf.id);
    expect(navigate(graph, graph.rootId, 'in')).toBe(graph.rootId);
  });
});

describe('left and right', () => {
  it('orders siblings by where they are on screen, not when they were bought', () => {
    const { graph, first } = tree();
    const row = siblingsLeftToRight(graph, first).map((node) => node.id);
    const placements = graph.placements();
    const xs = row.map((id) => placements.get(id)?.end.x ?? 0);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('walks the row one step at a time', () => {
    const { graph, first } = tree();
    const row = siblingsLeftToRight(graph, first).map((node) => node.id);
    expect(navigate(graph, row[0], 'right')).toBe(row[1]);
    expect(navigate(graph, row[1], 'left')).toBe(row[0]);
  });

  it('clamps at the ends instead of wrapping across the canopy', () => {
    const { graph, first } = tree();
    const row = siblingsLeftToRight(graph, first).map((node) => node.id);
    const leftmost = row[0];
    const rightmost = row[row.length - 1];
    expect(navigate(graph, leftmost, 'left')).toBe(leftmost);
    expect(navigate(graph, rightmost, 'right')).toBe(rightmost);
  });

  it('leaves the trunk alone — it has no siblings', () => {
    const { graph } = tree();
    expect(navigate(graph, graph.rootId, 'left')).toBe(graph.rootId);
    expect(navigate(graph, graph.rootId, 'right')).toBe(graph.rootId);
  });
});

describe('reachability', () => {
  it('can reach every part of the tree from the trunk', () => {
    const { graph } = tree();
    growOrThrow(graph, graph.rootId, 'rootSegment');

    // Breadth-first over the moves a keyboard actually has, so this fails if a
    // part exists that no sequence of arrow presses can land on.
    const seen = new Set<string>([graph.rootId]);
    const queue = [graph.rootId];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      for (const direction of ['out', 'in', 'left', 'right'] as const) {
        const next = navigate(graph, id, direction);
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }

    expect(seen.size).toBe(graph.size);
  });
});
