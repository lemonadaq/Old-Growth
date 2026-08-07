import { describe, expect, it } from 'vitest';
import { GROWTH_RULE_BY_TYPE, PART_COST_GROWTH } from '../content/growth';
import { DEADWOOD_PER_WOOD, GROWTH_COST_TAG, PRUNE_REFUND_FRACTION } from '../content/prune';
import { partCost } from './growth';
import { ModifierSet } from './modifiers';
import {
  apexHeight,
  deadwoodFor,
  isPrunable,
  quotePrune,
  rebuildCostOfType,
  woodVolume,
} from './prune';
import { TreeGraph, type TreeNode } from './treeGraph';

/** Sum of the `n` most recent price points for a type on a tree owning `owned`. */
function priceSum(type: Parameters<typeof partCost>[0], owned: number, n: number): number {
  let total = 0;
  for (let i = 0; i < n; i += 1) total += partCost(type, owned - 1 - i).toNumber();
  return total;
}

/** A tree with one branch carrying a twig and two leaves. Returns the branch. */
function limbedTree(): { graph: TreeGraph; branch: TreeNode } {
  const graph = TreeGraph.seedling();
  const branch = graph.grow(graph.rootId, 'branch') as TreeNode;
  const twig = graph.grow(branch.id, 'twig') as TreeNode;
  graph.grow(twig.id, 'leafCluster');
  graph.grow(branch.id, 'leafCluster');
  return { graph, branch };
}

describe('woodVolume', () => {
  it('sums thickness × length over the nodes', () => {
    const nodes = [
      { thickness: 2, length: 3 },
      { thickness: 0.5, length: 4 },
    ] as TreeNode[];
    expect(woodVolume(nodes)).toBeCloseTo(8, 9);
  });

  it('is zero for nothing at all', () => {
    expect(woodVolume([])).toBe(0);
  });

  it('measures bulk, not price: a fat short limb beats a long thin one', () => {
    const fat = [{ thickness: 0.04, length: 0.2 }] as TreeNode[];
    const thin = [{ thickness: 0.01, length: 0.5 }] as TreeNode[];
    expect(woodVolume(fat)).toBeGreaterThan(woodVolume(thin));
  });
});

describe('deadwoodFor', () => {
  it('scales linearly with wood', () => {
    expect(deadwoodFor(0.01).toNumber()).toBeCloseTo(0.01 * DEADWOOD_PER_WOOD, 9);
    expect(deadwoodFor(0.02).toNumber()).toBeCloseTo(0.02 * DEADWOOD_PER_WOOD, 9);
  });

  it('never yields negative timber', () => {
    expect(deadwoodFor(-5).toNumber()).toBe(0);
  });
});

describe('rebuildCostOfType', () => {
  it('charges the last price points, which is what regrowing would cost', () => {
    // Eight leaves owned, three cut: the 6th, 7th and 8th prices come back.
    expect(rebuildCostOfType('leafCluster', 8, 3).toNumber()).toBeCloseTo(
      priceSum('leafCluster', 8, 3),
      9,
    );
  });

  it('matches the base cost when the only one owned is the one removed', () => {
    expect(rebuildCostOfType('branch', 1, 1).toNumber()).toBeCloseTo(
      GROWTH_RULE_BY_TYPE.branch.baseCost,
      9,
    );
  });

  it('is symmetric with regrowth: cut k, rebuild k, pay the same', () => {
    const owned = 6;
    const cut = rebuildCostOfType('twig', owned, 2).toNumber();
    // Regrowing from `owned - 2` back to `owned` pays those same two prices.
    const regrow =
      partCost('twig', owned - 2).toNumber() + partCost('twig', owned - 1).toNumber();
    expect(cut).toBeCloseTo(regrow, 9);
  });

  it('never charges for more parts than the tree carries', () => {
    expect(rebuildCostOfType('branch', 2, 9).toNumber()).toBeCloseTo(priceSum('branch', 2, 2), 9);
  });

  it('is zero when nothing is removed', () => {
    expect(rebuildCostOfType('branch', 5, 0).toNumber()).toBe(0);
  });

  it('follows a growth discount down', () => {
    const modifiers = new ModifierSet();
    modifiers.add({
      source: 'test',
      type: 'mul',
      targetKind: 'tag',
      target: GROWTH_COST_TAG,
      value: 0.5,
    });
    expect(rebuildCostOfType('branch', 3, 2, modifiers).toNumber()).toBeCloseTo(
      priceSum('branch', 3, 2) * 0.5,
      9,
    );
  });
});

describe('isPrunable', () => {
  it('refuses the trunk, which is the graph root', () => {
    const graph = TreeGraph.seedling();
    expect(isPrunable(graph, graph.rootId)).toBe(false);
  });

  it('refuses an unknown id', () => {
    expect(isPrunable(TreeGraph.seedling(), 'nope')).toBe(false);
  });

  it('accepts anything with a parent', () => {
    const { graph, branch } = limbedTree();
    expect(isPrunable(graph, branch.id)).toBe(true);
  });
});

describe('apexHeight', () => {
  it('reports the highest working point in the tree', () => {
    const { graph } = limbedTree();
    const heights = [...graph.placements().values()].map((p) => p.end.y);
    expect(apexHeight(graph)).toBeCloseTo(Math.max(...heights), 12);
  });

  it('is the trunk tip on a bare seedling', () => {
    const graph = TreeGraph.seedling();
    expect(apexHeight(graph)).toBeCloseTo(GROWTH_RULE_BY_TYPE.trunk.baseLength, 9);
  });
});

describe('quotePrune', () => {
  it('returns null for the trunk and for unknown ids', () => {
    const graph = TreeGraph.seedling();
    expect(quotePrune(graph, graph.rootId)).toBeNull();
    expect(quotePrune(graph, 'nope')).toBeNull();
  });

  it('takes the whole subtree, not just the node', () => {
    const { graph, branch } = limbedTree();
    const quote = quotePrune(graph, branch.id);
    expect(quote?.nodeIds).toHaveLength(4);
    expect(quote?.byType).toEqual({ branch: 1, twig: 1, leafCluster: 2 });
  });

  it('refunds exactly 40% of what rebuilding the subtree would cost', () => {
    const { graph, branch } = limbedTree();
    const quote = quotePrune(graph, branch.id);

    const rebuild =
      priceSum('branch', 1, 1) + priceSum('twig', 1, 1) + priceSum('leafCluster', 2, 2);

    expect(quote?.rebuild).toHaveLength(1);
    expect(quote?.rebuild[0].resource).toBe('sap');
    expect(quote?.rebuild[0].amount.toNumber()).toBeCloseTo(rebuild, 9);
    expect(quote?.refunds[0].amount.toNumber()).toBeCloseTo(rebuild * PRUNE_REFUND_FRACTION, 9);
  });

  it('yields Deadwood from the subtree bulk, not from its price', () => {
    const { graph, branch } = limbedTree();
    const quote = quotePrune(graph, branch.id);
    const wood = woodVolume(graph.subtree(branch.id));

    expect(quote?.wood).toBeCloseTo(wood, 12);
    expect(quote?.deadwood.toNumber()).toBeCloseTo(wood * DEADWOOD_PER_WOOD, 9);
  });

  it('pays more for a bigger limb, on both counts', () => {
    const graph = TreeGraph.seedling();
    const big = graph.grow(graph.rootId, 'branch') as TreeNode;
    graph.grow(big.id, 'leafCluster');
    graph.grow(big.id, 'leafCluster');
    const small = graph.grow(graph.rootId, 'branch') as TreeNode;

    const bigQuote = quotePrune(graph, big.id);
    const smallQuote = quotePrune(graph, small.id);

    expect(bigQuote?.deadwood.gt(smallQuote?.deadwood ?? 0)).toBe(true);
    expect(bigQuote?.refunds[0].amount.gt(smallQuote?.refunds[0].amount ?? 0)).toBe(true);
  });

  it('quotes the refund against discounted prices when growth is cheap', () => {
    const { graph, branch } = limbedTree();
    const full = quotePrune(graph, branch.id);

    const modifiers = new ModifierSet();
    modifiers.add({
      source: 'surge',
      type: 'mul',
      targetKind: 'tag',
      target: GROWTH_COST_TAG,
      value: 0.75,
    });
    const discounted = quotePrune(graph, branch.id, modifiers);

    expect(discounted?.refunds[0].amount.toNumber()).toBeCloseTo(
      (full?.refunds[0].amount.toNumber() ?? 0) * 0.75,
      9,
    );
    // Timber is physical: a price change cannot touch it.
    expect(discounted?.deadwood.toNumber()).toBeCloseTo(full?.deadwood.toNumber() ?? 0, 9);
  });

  it('flags a cut that takes the tree apex with it', () => {
    const { graph } = limbedTree();
    const apex = apexHeight(graph) as number;
    const placements = graph.placements();

    // Find the node standing at the apex and cut the limb it hangs off.
    const highest = [...placements.entries()].find(([, p]) => p.end.y === apex);
    const highestId = highest?.[0] as string;

    expect(quotePrune(graph, highestId)?.apical).toBe(true);
  });

  it('does not flag a cut that leaves something taller standing', () => {
    const graph = TreeGraph.seedling();
    const tall = graph.grow(graph.rootId, 'branch') as TreeNode;
    graph.grow(tall.id, 'branch');
    const root = graph.grow(graph.rootId, 'rootSegment') as TreeNode;

    // A root is the lowest thing on the tree; cutting it cannot top the tree.
    expect(quotePrune(graph, root.id)?.apical).toBe(false);
    expect(quotePrune(graph, tall.id)?.apical).toBe(true);
  });

  it('flags a cut whose subtree — not its own node — holds the apex', () => {
    const graph = TreeGraph.seedling();
    const branch = graph.grow(graph.rootId, 'branch') as TreeNode;
    const leaf = graph.grow(branch.id, 'leafCluster') as TreeNode;

    const placements = graph.placements();
    const branchTop = placements.get(branch.id)?.end.y ?? 0;
    const leafTop = placements.get(leaf.id)?.end.y ?? 0;
    expect(leafTop).toBeGreaterThan(branchTop);

    // The branch's own tip is not the apex, but its leaf's is.
    expect(quotePrune(graph, branch.id)?.apical).toBe(true);
  });

  it('prices only what comes off, leaving the rest of the tree alone', () => {
    const graph = TreeGraph.seedling();
    const keep = graph.grow(graph.rootId, 'branch') as TreeNode;
    graph.grow(keep.id, 'leafCluster');
    const cut = graph.grow(graph.rootId, 'branch') as TreeNode;

    const quote = quotePrune(graph, cut.id);
    expect(quote?.byType).toEqual({ branch: 1 });
    // The second branch is the second one owned, so it refunds the 2nd price.
    expect(quote?.rebuild[0].amount.toNumber()).toBeCloseTo(
      GROWTH_RULE_BY_TYPE.branch.baseCost * PART_COST_GROWTH,
      9,
    );
  });
});
