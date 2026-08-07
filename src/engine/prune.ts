import Decimal from 'break_infinity.js';
import { GROWTH_RULE_BY_TYPE, type TreeNodeType } from '../content/growth';
import { DEADWOOD_PER_WOOD, PRUNE_REFUND_FRACTION } from '../content/prune';
import type { ResourceId } from '../content/resources';
import { partCost } from './growth';
import type { ModifierSet } from './modifiers';
import type { TreeGraph, TreeNode } from './treeGraph';

/**
 * Pruning arithmetic: what a cut is worth before it is made.
 *
 * Everything here is a pure read of the graph, so the tooltip the player hovers
 * and the transaction the engine executes are quoted by the *same* function —
 * a preview can never promise a number the cut does not pay.
 *
 * Two returns, measured two different ways:
 *
 * - **The refund** is priced forward. Parts cost `baseCost × 1.15^owned`, so the
 *   price of putting a subtree back is fully determined by what the tree carries
 *   now; the cut hands back {@link PRUNE_REFUND_FRACTION} of exactly that. No
 *   purchase history is needed and none is kept.
 * - **The Deadwood** is measured from bulk: `Σ(thickness × length)` over the
 *   subtree, scaled by {@link DEADWOOD_PER_WOOD}. A fat old branch is worth more
 *   timber than a spray of twigs that happened to cost the same.
 */

/** Some amount of one resource — a refund line, or a rebuild price. */
export interface ResourceAmount {
  readonly resource: ResourceId;
  readonly amount: Decimal;
}

/**
 * Slack allowed when deciding whether a cut takes the tree's highest point.
 *
 * Apex heights are derived by walking the graph in floating point, so two parts
 * that are geometrically level can differ in the last bits. Requiring an exact
 * tie would make apical dominance fire or not fire on rounding noise.
 */
export const APICAL_EPSILON = 1e-9;

/** What cutting a subtree would remove, and what it would pay. */
export interface PruneQuote {
  /** The node the cut is rooted at. */
  readonly nodeId: string;
  /** Ids of every node that comes off, the cut node first. */
  readonly nodeIds: readonly string[];
  /** How many of each part type come off. */
  readonly byType: Readonly<Partial<Record<TreeNodeType, number>>>;
  /** What rebuilding this exact set would cost right now, per resource. */
  readonly rebuild: readonly ResourceAmount[];
  /** The share of that which the cut hands back. */
  readonly refunds: readonly ResourceAmount[];
  /** Σ(thickness × length) over the subtree, in canonical units. */
  readonly wood: number;
  /** Deadwood the cut yields. */
  readonly deadwood: Decimal;
  /** True when this cut takes the tree's highest point with it. */
  readonly apical: boolean;
}

/** Whether a node can be cut at all. The trunk is the graph root and cannot. */
export function isPrunable(graph: TreeGraph, nodeId: string): boolean {
  const node = graph.node(nodeId);
  return node !== undefined && node.parentId !== null;
}

/** Canonical `y` of the highest working point in the tree, or `null` if empty. */
export function apexHeight(graph: TreeGraph): number | null {
  let highest: number | null = null;
  for (const placement of graph.placements().values()) {
    if (highest === null || placement.end.y > highest) highest = placement.end.y;
  }
  return highest;
}

/** Total `thickness × length` of a set of nodes, in canonical units. */
export function woodVolume(nodes: readonly TreeNode[]): number {
  let total = 0;
  for (const node of nodes) total += node.thickness * node.length;
  return total;
}

/** Deadwood yielded by that much wood. */
export function deadwoodFor(wood: number): Decimal {
  return new Decimal(Math.max(0, wood) * DEADWOOD_PER_WOOD);
}

/**
 * What it would cost to grow `removing` parts of `type` back onto a tree that
 * currently carries `owned` of them.
 *
 * The last `removing` price points, summed: cutting three of eight leaves and
 * regrowing them pays the 6th, 7th and 8th prices again. That symmetry is what
 * makes the refund quotable without a purchase log — and what makes rebuilding
 * a canopy differently cost the same as rebuilding it identically.
 */
export function rebuildCostOfType(
  type: TreeNodeType,
  owned: number,
  removing: number,
  modifiers?: ModifierSet,
): Decimal {
  let total = new Decimal(0);
  const count = Math.min(Math.max(0, removing), Math.max(0, owned));
  for (let i = 0; i < count; i += 1) {
    total = total.add(partCost(type, owned - 1 - i, modifiers));
  }
  return total;
}

/** Sum a per-resource map into stable, catalogue-ordered lines. */
function toLines(totals: Map<ResourceId, Decimal>): ResourceAmount[] {
  return [...totals.entries()]
    .filter(([, amount]) => amount.gt(0))
    .map(([resource, amount]) => ({ resource, amount }));
}

/**
 * Price a prospective cut at `nodeId`.
 *
 * Returns `null` when there is nothing to cut there — an unknown id, or the
 * trunk, which has no parent to be cut from.
 *
 * `modifiers` is optional and only affects the *price* half: with a growth
 * discount running, putting the limb back costs less, so the refund quoted for
 * taking it off is the matching fraction of that lower price. Quoting the two
 * against different price lists is what would actually be surprising.
 */
export function quotePrune(
  graph: TreeGraph,
  nodeId: string,
  modifiers?: ModifierSet,
): PruneQuote | null {
  if (!isPrunable(graph, nodeId)) return null;

  const removed = graph.subtree(nodeId);
  if (removed.length === 0) return null;

  const byType: Partial<Record<TreeNodeType, number>> = {};
  for (const node of removed) {
    byType[node.type] = (byType[node.type] ?? 0) + 1;
  }

  const rebuildTotals = new Map<ResourceId, Decimal>();
  for (const [type, count] of Object.entries(byType) as [TreeNodeType, number][]) {
    const resource = GROWTH_RULE_BY_TYPE[type].costResource;
    const cost = rebuildCostOfType(type, graph.countOfType(type), count, modifiers);
    rebuildTotals.set(resource, (rebuildTotals.get(resource) ?? new Decimal(0)).add(cost));
  }

  const refundTotals = new Map<ResourceId, Decimal>();
  for (const [resource, amount] of rebuildTotals) {
    refundTotals.set(resource, amount.mul(PRUNE_REFUND_FRACTION));
  }

  const wood = woodVolume(removed);

  // Apical dominance: does this cut take the tree's leader with it? Measured
  // against the whole subtree rather than the cut node alone — a branch whose
  // topmost leaf is the highest point on the tree still loses the tree its
  // leader when it comes off.
  const placements = graph.placements();
  const apex = apexHeight(graph);
  let cutApex: number | null = null;
  for (const node of removed) {
    const y = placements.get(node.id)?.end.y;
    if (y === undefined) continue;
    if (cutApex === null || y > cutApex) cutApex = y;
  }

  return {
    nodeId,
    nodeIds: removed.map((node) => node.id),
    byType,
    rebuild: toLines(rebuildTotals),
    refunds: toLines(refundTotals),
    wood,
    deadwood: deadwoodFor(wood),
    apical: apex !== null && cutApex !== null && cutApex >= apex - APICAL_EPSILON,
  };
}
