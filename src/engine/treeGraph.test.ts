import { describe, expect, it } from 'vitest';
import { GROWTH_RULE_BY_TYPE, type TreeNodeType } from '../content/growth';
import {
  computePlacements,
  placeOption,
  TreeGraph,
  type TreeNode,
  type TreeGraphData,
} from './treeGraph';

/** Shortest angular distance between two headings, in `[0, π]`. */
function angularDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

/** Grow a chain of parts, asserting each one lands. */
function growOrThrow(graph: TreeGraph, parentId: string, type: TreeNodeType): TreeNode {
  const node = graph.grow(parentId, type);
  if (!node) throw new Error(`could not grow ${type} on ${parentId}`);
  return node;
}

/** A tree with canopy and roots, grown through the public API. */
function grownTree(seed?: number) {
  const graph = seed === undefined ? TreeGraph.seedling() : TreeGraph.seedling(seed);
  const branch = growOrThrow(graph, graph.rootId, 'branch');
  const twig = growOrThrow(graph, branch.id, 'twig');
  growOrThrow(graph, twig.id, 'leafCluster');
  growOrThrow(graph, branch.id, 'leafCluster');
  const root = growOrThrow(graph, graph.rootId, 'rootSegment');
  growOrThrow(graph, root.id, 'rootTip');
  return { graph, branch, twig, root };
}

describe('seedling', () => {
  it('starts as a lone trunk at the origin, pointing up', () => {
    const graph = TreeGraph.seedling();
    expect(graph.size).toBe(1);

    const trunk = graph.node(graph.rootId);
    expect(trunk?.type).toBe('trunk');
    expect(trunk?.parentId).toBeNull();

    const placement = graph.placements().get(graph.rootId);
    expect(placement?.start).toEqual({ x: 0, y: 0 });
    expect(placement?.end.y).toBeGreaterThan(0);
    expect(placement?.end.x).toBeCloseTo(0, 10);
  });
});

describe('growth constraints', () => {
  it('offers only the child types the rules allow', () => {
    const graph = TreeGraph.seedling();
    const offered = graph.getValidGrowthOptions(graph.rootId).map((o) => o.type);
    expect(offered).toEqual([...GROWTH_RULE_BY_TYPE.trunk.allowedChildren]);
  });

  it('refuses a child type the parent does not allow', () => {
    const graph = TreeGraph.seedling();
    // Leaves grow on branches and twigs, never straight out of the trunk.
    expect(graph.grow(graph.rootId, 'leafCluster')).toBeNull();
    expect(graph.size).toBe(1);
  });

  it('offers nothing on a terminal part', () => {
    const { graph, twig } = grownTree();
    const leaf = graph.children(twig.id)[0];
    expect(leaf.type).toBe('leafCluster');
    expect(graph.getValidGrowthOptions(leaf.id)).toEqual([]);
    expect(graph.grow(leaf.id, 'leafCluster')).toBeNull();
  });

  it('stops offering options once the parent is full', () => {
    const graph = TreeGraph.seedling();
    const max = GROWTH_RULE_BY_TYPE.trunk.maxChildren;
    for (let i = 0; i < max; i += 1) {
      expect(graph.grow(graph.rootId, 'branch')).not.toBeNull();
    }
    expect(graph.getValidGrowthOptions(graph.rootId)).toEqual([]);
    expect(graph.grow(graph.rootId, 'branch')).toBeNull();
  });

  it('gives every sibling its own slot', () => {
    const graph = TreeGraph.seedling();
    growOrThrow(graph, graph.rootId, 'branch');
    growOrThrow(graph, graph.rootId, 'branch');
    growOrThrow(graph, graph.rootId, 'rootSegment');

    const slots = graph.children(graph.rootId).map((c) => c.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('reuses a freed slot after a prune', () => {
    const graph = TreeGraph.seedling();
    const first = growOrThrow(graph, graph.rootId, 'branch');
    growOrThrow(graph, graph.rootId, 'branch');
    expect(first.slot).toBe(0);

    graph.prune(first.id);
    const replacement = growOrThrow(graph, graph.rootId, 'branch');
    expect(replacement.slot).toBe(0);
  });

  it('returns options with the exact geometry the grown part receives', () => {
    const graph = TreeGraph.seedling();
    const [option] = graph.getValidGrowthOptions(graph.rootId);
    const grown = growOrThrow(graph, graph.rootId, option.type);

    expect(grown.angle).toBe(option.angle);
    expect(grown.attachT).toBe(option.attachT);
    expect(grown.length).toBe(option.length);
    expect(grown.thickness).toBe(option.thickness);
    expect(grown.slot).toBe(option.slot);
  });

  it('records the tick a part was grown at', () => {
    const graph = TreeGraph.seedling();
    const node = graph.grow(graph.rootId, 'branch', 'oak', 42);
    expect(node?.createdAtTick).toBe(42);
  });
});

describe('growth directions', () => {
  it('grows canopy parts upward, never into the ground', () => {
    const { graph } = grownTree();
    const placements = graph.placements();

    for (const node of graph.allNodes()) {
      if (GROWTH_RULE_BY_TYPE[node.type].domain !== 'canopy') continue;
      const placement = placements.get(node.id);
      expect(placement, node.id).toBeDefined();
      expect(Math.sin(placement?.direction ?? 0), node.id).toBeGreaterThan(0);
    }
  });

  it('keeps a child within its spread of the limb it grows on', () => {
    const { graph } = grownTree();
    const placements = graph.placements();

    for (const node of graph.allNodes()) {
      const rule = GROWTH_RULE_BY_TYPE[node.type];
      if (node.parentId === null) continue;

      const parent = graph.node(node.parentId);
      // Roots leaving the trunk are referenced to "down", not to the trunk.
      if (!parent || GROWTH_RULE_BY_TYPE[parent.type].domain !== rule.domain) continue;

      const spread = rule.spreadDegrees * (Math.PI / 180);
      expect(angularDistance(node.angle, 0), node.id).toBeLessThanOrEqual(spread + 1e-9);
      expect(placements.get(node.id), node.id).toBeDefined();
    }
  });

  it('stops an over-leaning limb at vertical instead of flinging it across', () => {
    // A twig leaning far left can accumulate past straight up. A naive numeric
    // clamp would normalise that to a large negative angle and snap it to the
    // *right* horizon, throwing the leaf to the other side of the tree.
    const graph = TreeGraph.seedling();
    let node = growOrThrow(graph, graph.rootId, 'branch');
    for (let i = 0; i < 6; i += 1) {
      node = growOrThrow(graph, node.id, 'branch');
    }

    const placements = graph.placements();
    let previous = placements.get(graph.rootId)?.direction ?? 0;
    for (const current of graph.allNodes()) {
      if (current.parentId === null) continue;
      const direction = placements.get(current.id)?.direction ?? 0;
      const maxTurn = GROWTH_RULE_BY_TYPE[current.type].spreadDegrees * (Math.PI / 180);
      expect(angularDistance(direction, previous), current.id).toBeLessThanOrEqual(maxTurn + 1e-9);
      previous = direction;
    }
  });

  it('sends roots downward even though the trunk points up', () => {
    const { graph, root } = grownTree();
    const placements = graph.placements();

    expect(Math.sin(placements.get(root.id)?.direction ?? 0)).toBeLessThan(0);
    const tip = graph.children(root.id)[0];
    expect(Math.sin(placements.get(tip.id)?.direction ?? 0)).toBeLessThan(0);
    expect(placements.get(tip.id)?.end.y).toBeLessThan(0);
  });

  it('attaches roots at the very base of the trunk', () => {
    const { graph, root } = grownTree();
    expect(root.attachT).toBe(0);
    expect(placementOf(graph, root.id).start).toEqual({ x: 0, y: 0 });
  });

  it('thins each generation of wood', () => {
    const graph = TreeGraph.seedling();
    const first = growOrThrow(graph, graph.rootId, 'branch');
    const second = growOrThrow(graph, first.id, 'branch');
    expect(second.thickness).toBeLessThan(first.thickness);
    expect(second.length).toBeLessThan(first.length);
  });
});

function placementOf(graph: TreeGraph, id: string) {
  const placement = graph.placements().get(id);
  if (!placement) throw new Error(`no placement for ${id}`);
  return placement;
}

describe('derived placements', () => {
  it('joins every child onto its parent’s line', () => {
    const { graph } = grownTree();
    const placements = graph.placements();

    for (const node of graph.allNodes()) {
      if (node.parentId === null) continue;
      const parent = placements.get(node.parentId);
      const self = placements.get(node.id);
      if (!parent || !self) throw new Error('missing placement');

      const expected = {
        x: parent.start.x + (parent.end.x - parent.start.x) * node.attachT,
        y: parent.start.y + (parent.end.y - parent.start.y) * node.attachT,
      };
      expect(self.start.x).toBeCloseTo(expected.x, 10);
      expect(self.start.y).toBeCloseTo(expected.y, 10);
    }
  });

  it('gives every node a segment of its own stated length', () => {
    const { graph } = grownTree();
    for (const node of graph.allNodes()) {
      const { start, end } = placementOf(graph, node.id);
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(node.length, 10);
    }
  });

  it('previews an option exactly where growing it lands', () => {
    const graph = TreeGraph.seedling();
    const [option] = graph.getValidGrowthOptions(graph.rootId);
    const preview = placeOption(placementOf(graph, graph.rootId), option);

    const grown = growOrThrow(graph, graph.rootId, option.type);
    expect(placementOf(graph, grown.id)).toEqual(preview);
  });

  it('is a pure function of the node table', () => {
    const { graph } = grownTree();
    const nodes = new Map(graph.allNodes().map((n) => [n.id, n]));
    expect(computePlacements(nodes, graph.rootId)).toEqual(computePlacements(nodes, graph.rootId));
  });
});

describe('pruning', () => {
  it('removes the whole subtree and returns it', () => {
    const { graph, branch, twig } = grownTree();
    const before = graph.size;

    const removed = graph.prune(branch.id);
    const removedIds = removed.map((n) => n.id);

    expect(removedIds).toContain(branch.id);
    expect(removedIds).toContain(twig.id);
    expect(removed).toHaveLength(4); // branch + twig + two leaf clusters
    expect(graph.size).toBe(before - removed.length);
    for (const id of removedIds) expect(graph.node(id)).toBeUndefined();
  });

  it('detaches the pruned node from its parent', () => {
    const { graph, branch } = grownTree();
    graph.prune(branch.id);
    expect(graph.node(graph.rootId)?.childIds).not.toContain(branch.id);
  });

  it('leaves the rest of the tree standing', () => {
    const { graph, branch, root } = grownTree();
    graph.prune(branch.id);
    expect(graph.node(root.id)).toBeDefined();
    expect(graph.children(root.id)).toHaveLength(1);
  });

  it('keeps per-type counts honest, which is what drives pricing', () => {
    const { graph, branch } = grownTree();
    expect(graph.countOfType('leafCluster')).toBe(2);
    graph.prune(branch.id);
    expect(graph.countOfType('leafCluster')).toBe(0);
    expect(graph.countOfType('branch')).toBe(0);
    expect(graph.countOfType('rootSegment')).toBe(1);
  });

  it('refuses to prune the trunk', () => {
    const { graph } = grownTree();
    const before = graph.size;
    expect(graph.prune(graph.rootId)).toEqual([]);
    expect(graph.size).toBe(before);
  });

  it('is a no-op for an unknown id', () => {
    const { graph } = grownTree();
    const before = graph.size;
    expect(graph.prune('nope')).toEqual([]);
    expect(graph.size).toBe(before);
  });
});

describe('determinism', () => {
  it('yields identical geometry for the same action log', () => {
    expect(grownTree().graph.toJSON()).toEqual(grownTree().graph.toJSON());
  });

  it('yields a different silhouette for a different seed', () => {
    const a = grownTree(1).graph.toSegments();
    const b = grownTree(2).graph.toSegments();
    expect(a).not.toEqual(b);
    // …but the same shape of tree: only the wobble differs.
    expect(a.map((s) => s.kind)).toEqual(b.map((s) => s.kind));
  });

  it('previews the same option no matter how often it is asked', () => {
    const { graph } = grownTree();
    expect(graph.getValidGrowthOptions(graph.rootId)).toEqual(
      graph.getValidGrowthOptions(graph.rootId),
    );
  });
});

describe('serialisation', () => {
  it('round-trips through plain JSON', () => {
    const { graph } = grownTree();
    const data = JSON.parse(JSON.stringify(graph.toJSON())) as TreeGraphData;
    const restored = TreeGraph.fromJSON(data);

    expect(restored.toJSON()).toEqual(graph.toJSON());
    expect(restored.toSegments()).toEqual(graph.toSegments());
    expect(restored.size).toBe(graph.size);
    expect(restored.countOfType('leafCluster')).toBe(graph.countOfType('leafCluster'));
  });

  it('keeps growing consistently after a round-trip', () => {
    const { graph } = grownTree();
    const restored = TreeGraph.fromJSON(graph.toJSON());

    const fromOriginal = graph.grow(graph.rootId, 'branch');
    const fromRestored = restored.grow(restored.rootId, 'branch');
    expect(fromRestored).toEqual(fromOriginal);
  });

  it('does not share mutable child lists with its source', () => {
    const { graph } = grownTree();
    const restored = TreeGraph.fromJSON(graph.toJSON());
    restored.grow(restored.rootId, 'branch');
    expect(restored.node(restored.rootId)?.childIds.length).toBe(
      (graph.node(graph.rootId)?.childIds.length ?? 0) + 1,
    );
  });
});

describe('revision', () => {
  it('advances on growth and on pruning, but not on reads', () => {
    const graph = TreeGraph.seedling();
    const start = graph.revision;

    const branch = growOrThrow(graph, graph.rootId, 'branch');
    expect(graph.revision).toBe(start + 1);

    graph.toSegments();
    graph.getValidGrowthOptions(graph.rootId);
    expect(graph.revision).toBe(start + 1);

    graph.prune(branch.id);
    expect(graph.revision).toBe(start + 2);
  });

  it('does not advance on a rejected grow', () => {
    const graph = TreeGraph.seedling();
    const start = graph.revision;
    graph.grow(graph.rootId, 'leafCluster');
    expect(graph.revision).toBe(start);
  });
});

describe('toSegments', () => {
  it('emits one segment per node, parents before children', () => {
    const { graph } = grownTree();
    const segments = graph.toSegments();
    expect(segments).toHaveLength(graph.size);

    const seen = new Set<string>();
    for (const segment of segments) {
      const parentId = graph.node(segment.id)?.parentId;
      if (parentId !== null && parentId !== undefined) expect(seen.has(parentId)).toBe(true);
      seen.add(segment.id);
    }
  });
});

describe('species on the graph', () => {
  it('tallies the trunk from the start and every part after it', () => {
    const tree = TreeGraph.seedling();
    expect(tree.countBySpecies().get('oak')).toBe(1);

    tree.grow(tree.rootId, 'branch', 'birch');
    expect(tree.countBySpecies().get('oak')).toBe(1);
    expect(tree.countBySpecies().get('birch')).toBe(1);
  });

  it('drops a species from the tally entirely once its last part is gone', () => {
    const tree = TreeGraph.seedling();
    const branch = tree.grow(tree.rootId, 'branch', 'birch');
    tree.prune(branch?.id ?? '');
    expect(tree.countBySpecies().has('birch')).toBe(false);
  });

  it('re-species a subtree and nothing above it', () => {
    const tree = TreeGraph.seedling();
    const lower = tree.grow(tree.rootId, 'branch', 'oak');
    const upper = tree.grow(lower?.id ?? '', 'branch', 'birch');
    const leaf = tree.grow(upper?.id ?? '', 'leafCluster', 'birch');

    const changed = tree.respeciate(upper?.id ?? '', 'ghostwood');

    expect(changed.map((node) => node.id).sort()).toEqual([leaf?.id, upper?.id].sort());
    expect(tree.node(upper?.id ?? '')?.speciesId).toBe('ghostwood');
    expect(tree.node(leaf?.id ?? '')?.speciesId).toBe('ghostwood');
    expect(tree.node(lower?.id ?? '')?.speciesId).toBe('oak');
    expect(tree.node(tree.rootId)?.speciesId).toBe('oak');
  });

  it('keeps the tally straight across a re-species', () => {
    const tree = TreeGraph.seedling();
    const branch = tree.grow(tree.rootId, 'branch', 'birch');
    tree.grow(branch?.id ?? '', 'leafCluster', 'birch');

    tree.respeciate(branch?.id ?? '', 'ghostwood');

    expect(tree.countBySpecies().has('birch')).toBe(false);
    expect(tree.countBySpecies().get('ghostwood')).toBe(2);
    expect(tree.countBySpecies().get('oak')).toBe(1);
  });

  it('bumps the revision only when something actually changed', () => {
    const tree = TreeGraph.seedling();
    const branch = tree.grow(tree.rootId, 'branch', 'birch');
    const before = tree.revision;

    expect(tree.respeciate(branch?.id ?? '', 'birch')).toEqual([]);
    expect(tree.revision).toBe(before);

    tree.respeciate(branch?.id ?? '', 'ghostwood');
    expect(tree.revision).toBeGreaterThan(before);
  });

  it('carries the species out onto the drawable segments', () => {
    const tree = TreeGraph.seedling();
    tree.grow(tree.rootId, 'branch', 'birch');
    const segments = tree.toSegments();
    expect(segments.find((s) => s.kind === 'branch')?.speciesId).toBe('birch');
    expect(segments.find((s) => s.kind === 'trunk')?.speciesId).toBe('oak');
  });

  it('round-trips species through JSON', () => {
    const tree = TreeGraph.seedling();
    const branch = tree.grow(tree.rootId, 'branch', 'birch');
    tree.respeciate(branch?.id ?? '', 'ghostwood');

    const restored = TreeGraph.fromJSON(JSON.parse(JSON.stringify(tree.toJSON())));
    expect(restored.node(branch?.id ?? '')?.speciesId).toBe('ghostwood');
    expect(restored.countBySpecies().get('ghostwood')).toBe(1);
  });
});
