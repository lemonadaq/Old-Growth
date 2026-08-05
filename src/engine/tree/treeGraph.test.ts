import { describe, expect, it } from 'vitest';
import { NODE_RULES, type NodeType } from './treeTypes';
import { TreeGraph, computeWorldPositions, type SerializedTreeGraph } from './treeGraph';

/** Grow a fixed, reasonably rich tree used by several tests. */
function buildSampleTree(seed = 12345): TreeGraph {
  const graph = TreeGraph.create(seed, 'oak');
  const branchA = graph.grow(graph.rootId, 'branch', 'oak');
  const branchB = graph.grow(graph.rootId, 'branch', 'oak');
  const root = graph.grow(graph.rootId, 'rootSegment', 'oak');
  const twig = graph.grow(branchA.id, 'twig', 'oak');
  graph.grow(twig.id, 'leafCluster', 'oak');
  graph.grow(twig.id, 'blossom', 'oak');
  graph.grow(branchB.id, 'twig', 'oak');
  graph.grow(root.id, 'rootTip', 'oak');
  return graph;
}

describe('TreeGraph creation', () => {
  it('starts with a single trunk root', () => {
    const graph = TreeGraph.create(1, 'oak');
    expect(graph.size).toBe(1);
    const trunk = graph.root;
    expect(trunk.type).toBe('trunk');
    expect(trunk.parentId).toBeNull();
    expect(trunk.level).toBe(0);
    expect(trunk.childIds).toEqual([]);
    expect(trunk.speciesId).toBe('oak');
  });
});

describe('growth constraints', () => {
  it('offers exactly the allowed child types for a node', () => {
    const graph = TreeGraph.create(1, 'oak');
    expect(new Set(graph.getValidGrowthOptions(graph.rootId))).toEqual(
      new Set<NodeType>(['branch', 'rootSegment']),
    );
    const branch = graph.grow(graph.rootId, 'branch', 'oak');
    expect(new Set(graph.getValidGrowthOptions(branch.id))).toEqual(
      new Set<NodeType>(['branch', 'twig']),
    );
  });

  it('rejects a child type the parent does not allow', () => {
    const graph = TreeGraph.create(1, 'oak');
    // A trunk cannot directly grow a leafCluster.
    expect(() => graph.grow(graph.rootId, 'leafCluster', 'oak')).toThrow();
  });

  it('returns no options and refuses growth once a node hits its child cap', () => {
    const graph = TreeGraph.create(1, 'oak');
    const branch = graph.grow(graph.rootId, 'branch', 'oak');
    const cap = NODE_RULES.branch.maxChildren;
    for (let i = 0; i < cap; i += 1) {
      graph.grow(branch.id, 'twig', 'oak');
    }
    expect(graph.getChildren(branch.id)).toHaveLength(cap);
    expect(graph.getValidGrowthOptions(branch.id)).toEqual([]);
    expect(() => graph.grow(branch.id, 'twig', 'oak')).toThrow();
  });

  it('terminal node types allow no children', () => {
    const graph = TreeGraph.create(1, 'oak');
    const branch = graph.grow(graph.rootId, 'branch', 'oak');
    const twig = graph.grow(branch.id, 'twig', 'oak');
    const leaf = graph.grow(twig.id, 'leafCluster', 'oak');
    expect(graph.getValidGrowthOptions(leaf.id)).toEqual([]);
  });

  it('records parent/child links, level and tick on grown nodes', () => {
    const graph = TreeGraph.create(1, 'oak');
    graph.setTick(42);
    const branch = graph.grow(graph.rootId, 'branch', 'maple');
    expect(branch.parentId).toBe(graph.rootId);
    expect(branch.level).toBe(1);
    expect(branch.speciesId).toBe('maple');
    expect(branch.createdAtTick).toBe(42);
    expect(graph.root.childIds).toContain(branch.id);
  });

  it('throws on unknown node ids', () => {
    const graph = TreeGraph.create(1, 'oak');
    expect(() => graph.getValidGrowthOptions('nope')).toThrow();
    expect(() => graph.grow('nope', 'branch', 'oak')).toThrow();
    expect(() => graph.prune('nope')).toThrow();
  });
});

describe('angle constraints', () => {
  it('keeps every child angle within its allowed range', () => {
    const graph = buildSampleTree();
    for (const node of graph.allNodes()) {
      if (node.parentId === null) continue;
      const spread = NODE_RULES[node.type].maxAngleFromParent;
      expect(Math.abs(node.angle)).toBeLessThanOrEqual(spread + 1e-9);
    }
  });

  it("grows the trunk's canopy children up and its root children down", () => {
    // Angles are relative to the parent, so deviations accumulate and deep
    // nodes may drift; only the trunk's direct children are guaranteed to point
    // into their domain's hemisphere (angle offset from the domain base only).
    const graph = buildSampleTree();
    const geometry = computeWorldPositions(graph, { x: 0, y: 0 });
    for (const child of graph.getChildren(graph.rootId)) {
      const geo = geometry.get(child.id);
      expect(geo).toBeDefined();
      if (!geo) continue;
      if (NODE_RULES[child.type].domain === 'canopy') {
        expect(geo.endY).toBeLessThan(geo.startY); // moved up on screen
      } else {
        expect(geo.endY).toBeGreaterThan(geo.startY); // moved down on screen
      }
    }
  });

  it('keeps each segment within its allowed spread of its parent direction', () => {
    const graph = buildSampleTree();
    const geometry = computeWorldPositions(graph);
    for (const node of graph.allNodes()) {
      if (node.parentId === null) continue;
      const parent = graph.getNode(node.parentId);
      if (!parent) continue;
      const geo = geometry.get(node.id);
      const parentGeo = geometry.get(parent.id);
      if (!geo || !parentGeo) continue;
      // Same-domain children inherit the parent's world direction; a domain
      // switch (root off trunk) resets to the domain base instead.
      if (NODE_RULES[node.type].domain !== NODE_RULES[parent.type].domain) continue;
      const spread = NODE_RULES[node.type].maxAngleFromParent;
      const delta = Math.abs(geo.worldAngle - parentGeo.worldAngle);
      expect(delta).toBeLessThanOrEqual(spread + 1e-9);
    }
  });
});

describe('subtree pruning', () => {
  it('removes the whole subtree and detaches it from the parent', () => {
    const graph = TreeGraph.create(1, 'oak');
    const branch = graph.grow(graph.rootId, 'branch', 'oak');
    const twig = graph.grow(branch.id, 'twig', 'oak');
    const leaf = graph.grow(twig.id, 'leafCluster', 'oak');
    const survivor = graph.grow(graph.rootId, 'branch', 'oak');

    const sizeBefore = graph.size;
    const removed = graph.prune(branch.id);
    const removedIds = new Set(removed.map((n) => n.id));

    expect(removedIds).toEqual(new Set([branch.id, twig.id, leaf.id]));
    expect(removed[0].id).toBe(branch.id); // subtree root first
    expect(graph.size).toBe(sizeBefore - 3);
    expect(graph.hasNode(branch.id)).toBe(false);
    expect(graph.hasNode(twig.id)).toBe(false);
    expect(graph.hasNode(leaf.id)).toBe(false);
    // The parent no longer references the pruned child, but keeps its sibling.
    expect(graph.root.childIds).not.toContain(branch.id);
    expect(graph.root.childIds).toContain(survivor.id);
    expect(graph.hasNode(survivor.id)).toBe(true);
  });

  it('refuses to prune the trunk root', () => {
    const graph = TreeGraph.create(1, 'oak');
    expect(() => graph.prune(graph.rootId)).toThrow();
    expect(graph.size).toBe(1);
  });
});

describe('determinism', () => {
  it('same seed + same action log yields identical geometry', () => {
    const a = buildSampleTree(999);
    const b = buildSampleTree(999);

    expect(a.serialize()).toEqual(b.serialize());

    const geoA = computeWorldPositions(a, { x: 5, y: 7 });
    const geoB = computeWorldPositions(b, { x: 5, y: 7 });
    expect([...geoA.entries()]).toEqual([...geoB.entries()]);
    // The seeded jitter actually varies angles between siblings (not all zero).
    const angles = a
      .allNodes()
      .filter((n) => n.parentId !== null)
      .map((n) => n.angle);
    expect(new Set(angles).size).toBeGreaterThan(1);
  });

  it('different seeds diverge in angle jitter', () => {
    const a = buildSampleTree(1);
    const b = buildSampleTree(2);
    expect(a.serialize().nodes).not.toEqual(b.serialize().nodes);
  });

  it('continues deterministically across a serialize/deserialize boundary', () => {
    // One graph grown straight through.
    const straight = TreeGraph.create(77, 'oak');
    const s1 = straight.grow(straight.rootId, 'branch', 'oak');
    straight.grow(s1.id, 'twig', 'oak');
    straight.grow(straight.rootId, 'branch', 'oak');

    // The same log, but with a save/load in the middle.
    let split = TreeGraph.create(77, 'oak');
    const p1 = split.grow(split.rootId, 'branch', 'oak');
    split.grow(p1.id, 'twig', 'oak');
    split = TreeGraph.deserialize(JSON.parse(JSON.stringify(split.serialize())));
    split.grow(split.rootId, 'branch', 'oak');

    expect(split.serialize()).toEqual(straight.serialize());
  });
});

describe('serialization round-trip', () => {
  it('survives a JSON round-trip unchanged', () => {
    const graph = buildSampleTree(2024);
    const json = JSON.stringify(graph.serialize());
    const restored = TreeGraph.deserialize(JSON.parse(json) as SerializedTreeGraph);

    expect(restored.serialize()).toEqual(graph.serialize());
    expect(restored.size).toBe(graph.size);
    expect(restored.rootId).toBe(graph.rootId);
    expect(computeWorldPositions(restored)).toEqual(computeWorldPositions(graph));
  });

  it('preserves node fields exactly', () => {
    const graph = TreeGraph.create(5, 'birch', 3);
    const branch = graph.grow(graph.rootId, 'branch', 'birch');
    const restored = TreeGraph.deserialize(
      JSON.parse(JSON.stringify(graph.serialize())) as SerializedTreeGraph,
    );
    expect(restored.getNode(branch.id)).toEqual(graph.getNode(branch.id));
    expect(restored.getNode(graph.rootId)?.createdAtTick).toBe(3);
  });

  it('rejects an unknown serialization version', () => {
    const graph = TreeGraph.create(1, 'oak');
    const bad = { ...graph.serialize(), version: 999 };
    expect(() => TreeGraph.deserialize(bad as SerializedTreeGraph)).toThrow();
  });
});
