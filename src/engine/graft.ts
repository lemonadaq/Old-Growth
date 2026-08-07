import Decimal from 'break_infinity.js';
import {
  GRAFT_BASE_COST,
  GRAFT_COST_GROWTH,
  GRAFT_MIN_CHILDREN,
  type HybridDef,
} from '../content/hybrids';
import type { ResourceAmount } from './prune';
import { hybridOf } from './species';
import type { TreeGraph, TreeNode } from './treeGraph';

/**
 * Grafting: two limbs, one fork, a third thing.
 *
 * The rule is deliberately narrow — **adjacent, mature, different, and a pair
 * the table knows** — because a graft is meant to be a place on the tree you
 * built toward, not a button that consumes two branches. Every refusal names
 * itself, so the UI can say why rather than greying out in silence.
 *
 * As with pruning, the quote and the transaction are the same read: `quoteGraft`
 * is pure, and `Simulation.graft` pays exactly what it returned.
 *
 * Which limb becomes the hybrid is not arbitrary. The **scion** — the upper of
 * the two, the child — takes the new species along with everything it carries,
 * the way a real graft puts the scion's wood on the rootstock's roots. So the
 * hybrid limb is the one that grows on from here, and the tree keeps a record of
 * where it came from in the wood below it.
 */

/** Why a graft cannot happen. */
export type GraftRefusal =
  | 'unknown-node'
  | 'same-node'
  /** The two limbs do not meet: grafting joins a limb to the one it grew from. */
  | 'not-adjacent'
  /** Only structural branches can be grafted. */
  | 'not-branches'
  /** One of them has grown nothing of its own yet. */
  | 'immature'
  | 'same-species'
  /** No entry in the combo table — a hybrid cannot be grafted again. */
  | 'no-hybrid';

/** A refusal with the pair it refers to. */
export interface GraftRejection {
  readonly ok: false;
  readonly reason: GraftRefusal;
}

/** A graft that would go through, priced. */
export interface GraftQuote {
  readonly ok: true;
  /** The lower limb: keeps its species, and its fork carries the join. */
  readonly rootstockId: string;
  /** The upper limb: it and its whole subtree become the hybrid. */
  readonly scionId: string;
  readonly hybrid: HybridDef;
  /** What it costs, in catalogue order. */
  readonly costs: readonly ResourceAmount[];
  /** Ids that would change species. */
  readonly affected: readonly string[];
  /** True when this hybrid has never been made before. */
  readonly firstDiscovery: boolean;
}

export type GraftAssessment = GraftQuote | GraftRejection;

/** Human-readable reason, for the tooltip. */
export const GRAFT_REFUSAL_TEXT: Readonly<Record<GraftRefusal, string>> = {
  'unknown-node': 'That part is no longer on the tree.',
  'same-node': 'A limb cannot be grafted to itself.',
  'not-adjacent': 'Pick a limb and the limb it grew from — a graft joins at a fork.',
  'not-branches': 'Only branches can be grafted.',
  immature: 'Both limbs must have grown something of their own first.',
  'same-species': 'These are the same wood. A graft needs two different species.',
  'no-hybrid': 'These two make nothing. A grafted limb cannot be grafted again.',
};

/** Whether a branch has grown enough of its own to be worth joining. */
export function isMatureForGraft(node: TreeNode): boolean {
  return node.type === 'branch' && node.childIds.length >= GRAFT_MIN_CHILDREN;
}

/**
 * Order a pair into rootstock (lower) and scion (upper), or `null` when the two
 * do not meet at a fork.
 */
export function orderGraftPair(
  a: TreeNode,
  b: TreeNode,
): { rootstock: TreeNode; scion: TreeNode } | null {
  if (b.parentId === a.id) return { rootstock: a, scion: b };
  if (a.parentId === b.id) return { rootstock: b, scion: a };
  return null;
}

/** What a graft costs after `grafts` have already been made. */
export function graftCost(grafts: number): ResourceAmount[] {
  const scale = Decimal.pow(GRAFT_COST_GROWTH, Math.max(0, grafts));
  return GRAFT_BASE_COST.map((line) => ({
    resource: line.resource,
    amount: new Decimal(line.amount).mul(scale),
  }));
}

/**
 * Assess a prospective graft between two nodes.
 *
 * Returns either a full quote or the single reason it was refused — checked in
 * the order a player would discover them, so the message names the first thing
 * actually wrong rather than the last.
 */
export function quoteGraft(
  graph: TreeGraph,
  aId: string,
  bId: string,
  grafts: number,
  discovered: ReadonlySet<string>,
): GraftAssessment {
  if (aId === bId) return { ok: false, reason: 'same-node' };

  const a = graph.node(aId);
  const b = graph.node(bId);
  if (!a || !b) return { ok: false, reason: 'unknown-node' };

  if (a.type !== 'branch' || b.type !== 'branch') return { ok: false, reason: 'not-branches' };

  const pair = orderGraftPair(a, b);
  if (!pair) return { ok: false, reason: 'not-adjacent' };

  if (!isMatureForGraft(pair.rootstock) || !isMatureForGraft(pair.scion)) {
    return { ok: false, reason: 'immature' };
  }

  if (pair.rootstock.speciesId === pair.scion.speciesId) {
    return { ok: false, reason: 'same-species' };
  }

  const hybrid = hybridOf(pair.rootstock.speciesId, pair.scion.speciesId);
  if (!hybrid) return { ok: false, reason: 'no-hybrid' };

  return {
    ok: true,
    rootstockId: pair.rootstock.id,
    scionId: pair.scion.id,
    hybrid,
    costs: graftCost(grafts),
    affected: graph.subtree(pair.scion.id).map((node) => node.id),
    firstDiscovery: !discovered.has(hybrid.id),
  };
}
