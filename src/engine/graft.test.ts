import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { GRAFT_BASE_COST, GRAFT_COST_GROWTH } from '../content/hybrids';
import { graftCost, isMatureForGraft, orderGraftPair, quoteGraft } from './graft';
import { TreeGraph, type TreeNode } from './treeGraph';

/**
 * A trunk carrying an oak branch, a birch branch grown on it, and a leaf on each
 * so both count as mature.
 *
 * Returns the two branches by the role they play in a graft: `lower` is the
 * rootstock, `upper` the scion.
 */
function grove(): { tree: TreeGraph; lower: TreeNode; upper: TreeNode } {
  const tree = TreeGraph.seedling();
  const lower = tree.grow(tree.rootId, 'branch', 'oak') as TreeNode;
  const upper = tree.grow(lower.id, 'branch', 'birch') as TreeNode;
  tree.grow(lower.id, 'leafCluster', 'oak');
  tree.grow(upper.id, 'leafCluster', 'birch');
  return { tree, lower, upper };
}

const NOTHING_DISCOVERED: ReadonlySet<string> = new Set();

describe('graftCost', () => {
  it('starts at the catalogue price', () => {
    const costs = graftCost(0);
    expect(costs.map((line) => line.resource)).toEqual(
      GRAFT_BASE_COST.map((line) => line.resource),
    );
    expect(costs[0].amount.toNumber()).toBeCloseTo(GRAFT_BASE_COST[0].amount, 9);
  });

  it('escalates with every graft already made', () => {
    const first = graftCost(0)[0].amount.toNumber();
    const third = graftCost(2)[0].amount.toNumber();
    expect(third).toBeCloseTo(first * GRAFT_COST_GROWTH ** 2, 6);
  });

  it('treats a negative count as none rather than a discount', () => {
    expect(graftCost(-3)[0].amount.toNumber()).toBeCloseTo(GRAFT_BASE_COST[0].amount, 9);
  });
});

describe('maturity and adjacency', () => {
  it('counts a branch as mature once it carries something of its own', () => {
    const tree = TreeGraph.seedling();
    const bare = tree.grow(tree.rootId, 'branch', 'oak') as TreeNode;
    expect(isMatureForGraft(bare)).toBe(false);

    tree.grow(bare.id, 'leafCluster', 'oak');
    expect(isMatureForGraft(tree.node(bare.id) as TreeNode)).toBe(true);
  });

  it('orders a parent/child pair the same way round either way', () => {
    const { lower, upper } = grove();
    expect(orderGraftPair(lower, upper)?.scion.id).toBe(upper.id);
    expect(orderGraftPair(upper, lower)?.scion.id).toBe(upper.id);
  });

  it('refuses two limbs that do not meet', () => {
    const { tree, lower } = grove();
    const sibling = tree.grow(tree.rootId, 'branch', 'birch') as TreeNode;
    tree.grow(sibling.id, 'leafCluster', 'birch');

    expect(orderGraftPair(lower, sibling)).toBeNull();
    const assessment = quoteGraft(tree, lower.id, sibling.id, 0, NOTHING_DISCOVERED);
    expect(assessment.ok).toBe(false);
    if (!assessment.ok) expect(assessment.reason).toBe('not-adjacent');
  });
});

describe('quoteGraft', () => {
  it('quotes an adjacent, mature, mixed pair', () => {
    const { tree, lower, upper } = grove();
    const assessment = quoteGraft(tree, lower.id, upper.id, 0, NOTHING_DISCOVERED);

    expect(assessment.ok).toBe(true);
    if (!assessment.ok) return;
    expect(assessment.hybrid.id).toBe('ghostwood');
    expect(assessment.rootstockId).toBe(lower.id);
    expect(assessment.scionId).toBe(upper.id);
    expect(assessment.firstDiscovery).toBe(true);
  });

  it('names the whole scion subtree as affected, and nothing below it', () => {
    const { tree, lower, upper } = grove();
    const assessment = quoteGraft(tree, upper.id, lower.id, 0, NOTHING_DISCOVERED);

    expect(assessment.ok).toBe(true);
    if (!assessment.ok) return;
    // The scion and its leaf; not the rootstock, not the rootstock's leaf.
    expect(assessment.affected).toHaveLength(2);
    expect(assessment.affected).toContain(upper.id);
    expect(assessment.affected).not.toContain(lower.id);
  });

  it('reports a hybrid already made as no longer a discovery', () => {
    const { tree, lower, upper } = grove();
    const assessment = quoteGraft(tree, lower.id, upper.id, 0, new Set(['ghostwood']));
    expect(assessment.ok).toBe(true);
    if (assessment.ok) expect(assessment.firstDiscovery).toBe(false);
  });

  it('prices the quote at the current graft count', () => {
    const { tree, lower, upper } = grove();
    const assessment = quoteGraft(tree, lower.id, upper.id, 2, NOTHING_DISCOVERED);
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) return;
    expect(assessment.costs[0].amount.toNumber()).toBeCloseTo(
      new Decimal(GRAFT_BASE_COST[0].amount).mul(GRAFT_COST_GROWTH ** 2).toNumber(),
      6,
    );
  });

  it('refuses a limb grafted to itself', () => {
    const { tree, lower } = grove();
    const assessment = quoteGraft(tree, lower.id, lower.id, 0, NOTHING_DISCOVERED);
    expect(assessment.ok).toBe(false);
    if (!assessment.ok) expect(assessment.reason).toBe('same-node');
  });

  it('refuses a node that is not on the tree', () => {
    const { tree, lower } = grove();
    const assessment = quoteGraft(tree, lower.id, 'branch-404', 0, NOTHING_DISCOVERED);
    expect(assessment.ok).toBe(false);
    if (!assessment.ok) expect(assessment.reason).toBe('unknown-node');
  });

  it('refuses anything that is not a branch', () => {
    const { tree, lower } = grove();
    const leaf = tree.children(lower.id).find((node) => node.type === 'leafCluster') as TreeNode;
    const assessment = quoteGraft(tree, lower.id, leaf.id, 0, NOTHING_DISCOVERED);
    expect(assessment.ok).toBe(false);
    if (!assessment.ok) expect(assessment.reason).toBe('not-branches');
  });

  it('refuses a bare stub', () => {
    const { tree, upper } = grove();
    const stub = tree.grow(upper.id, 'branch', 'oak') as TreeNode;
    const assessment = quoteGraft(tree, upper.id, stub.id, 0, NOTHING_DISCOVERED);
    expect(assessment.ok).toBe(false);
    if (!assessment.ok) expect(assessment.reason).toBe('immature');
  });

  it('refuses two limbs of the same wood', () => {
    const tree = TreeGraph.seedling();
    const lower = tree.grow(tree.rootId, 'branch', 'oak') as TreeNode;
    const upper = tree.grow(lower.id, 'branch', 'oak') as TreeNode;
    tree.grow(lower.id, 'leafCluster', 'oak');
    tree.grow(upper.id, 'leafCluster', 'oak');

    const assessment = quoteGraft(tree, lower.id, upper.id, 0, NOTHING_DISCOVERED);
    expect(assessment.ok).toBe(false);
    if (!assessment.ok) expect(assessment.reason).toBe('same-species');
  });

  it('refuses to graft a limb that is already a hybrid', () => {
    const { tree, lower, upper } = grove();
    tree.respeciate(upper.id, 'ghostwood');
    const assessment = quoteGraft(tree, lower.id, upper.id, 0, NOTHING_DISCOVERED);
    expect(assessment.ok).toBe(false);
    if (!assessment.ok) expect(assessment.reason).toBe('no-hybrid');
  });
});
