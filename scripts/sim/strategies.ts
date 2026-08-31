import type Decimal from 'break_infinity.js';
import { PRESTIGE_HEIGHT_UNITS } from '../../src/content/balance';
import type { ResourceId } from '../../src/content/resources';
import type { TreeNodeType } from '../../src/content/growth';
import type { PricedGrowthOption } from '../../src/engine/growth';
import type { Simulation } from '../../src/engine/simulation';
import { treeHeight } from '../../src/engine/prestige';
import type { TreeNode } from '../../src/engine/treeGraph';

/**
 * The three bots the balance is measured against.
 *
 * A bot is not a model of a player — it is a **corner of the strategy space**.
 * The point of running three is not to find out how long a run takes but to
 * find out whether one way of playing runs away from the others: if the
 * clicker-focused bot reaches its first prestige in a third of the time the
 * root-focused one does, the game has a dominant strategy and no amount of
 * average-case tuning will hide it.
 *
 * All three share one body and differ only in weights, for the same reason: two
 * bots with two different purchase loops would be measuring two different games.
 */

/** How a strategy values one thing it could buy. */
export interface Weights {
  /** Multiplier on a producing part's rate-per-Sap. */
  readonly leaf: number;
  readonly blossom: number;
  readonly root: number;
  readonly rootTip: number;
  /** Flat appetite for structure — branches and twigs buy slots, not income. */
  readonly branch: number;
  readonly twig: number;
  /** Hydration the bot tries to hold. Below it, roots jump the queue. */
  readonly hydrationTarget: number;
  /** Fraction of spare Sap it is willing to sink into click upgrades. */
  readonly upgradeAppetite: number;
}

export interface Strategy {
  readonly id: string;
  readonly label: string;
  /** One line for the table's legend. */
  readonly blurb: string;
  readonly weights: Weights;
}

export const STRATEGIES: readonly Strategy[] = [
  {
    id: 'clicker',
    label: 'Clicker',
    blurb: 'Taps hard, buys click upgrades, grows canopy. Roots only to stay watered.',
    weights: {
      leaf: 1.4,
      blossom: 0.9,
      root: 0.6,
      rootTip: 0.5,
      branch: 1,
      twig: 1.1,
      hydrationTarget: 0.75,
      upgradeAppetite: 0.7,
    },
  },
  {
    id: 'root',
    label: 'Root',
    blurb: 'Digs first. Canopy only as far as maturity and the Light gate demand.',
    weights: {
      leaf: 0.7,
      blossom: 0.4,
      root: 1.5,
      rootTip: 1.3,
      branch: 0.9,
      twig: 0.8,
      hydrationTarget: 1.4,
      upgradeAppetite: 0.35,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    blurb: 'Holds hydration near 1, spreads spending across both halves.',
    weights: {
      leaf: 1,
      blossom: 0.7,
      root: 1,
      rootTip: 0.9,
      branch: 1,
      twig: 1,
      hydrationTarget: 1,
      upgradeAppetite: 0.4,
    },
  },
];

/** One purchase a bot would like to make. */
interface Candidate {
  readonly nodeId: string;
  readonly type: TreeNodeType;
  readonly score: number;
}

/**
 * Score one option.
 *
 * Producing parts are valued at **rate per Sap** — the only currency-free way to
 * compare a leaf against a root tip — times the strategy's appetite for that
 * kind of part. Structure has no rate, so it is valued at what it *unlocks*: a
 * branch is worth buying because leaves have to hang off something, and worth
 * more while the tree is still short of the maturity gate, because height is the
 * one thing only wood can buy.
 */
function score(
  option: PricedGrowthOption,
  node: TreeNode,
  weights: Weights,
  heightFraction: number,
  slotPressure: number,
): number | null {
  if (!option.affordable) return null;

  const cost = Math.max(1, option.cost.toNumber());
  const rate = option.production?.rate.toNumber() ?? 0;

  switch (option.rule.type) {
    case 'leafCluster':
      return (weights.leaf * rate) / cost;
    case 'blossom':
      return (weights.blossom * rate) / cost;
    case 'rootSegment':
      return (weights.root * rate) / cost;
    case 'rootTip':
      // A tip outside every vein produces literally nothing. Buying one is not a
      // slow purchase, it is a wasted one.
      return rate <= 0 ? null : (weights.rootTip * rate) / cost;
    case 'branch': {
      // Canopy branches carry the height gate; a branch high on the tree is
      // worth more than one low down while the tree is still short.
      const climb = node.type === 'trunk' || node.type === 'branch' ? 1 : 0;
      const height = (1 - heightFraction) * climb;
      return (weights.branch * (slotPressure + height)) / cost;
    }
    case 'twig':
      return (weights.twig * slotPressure) / cost;
    default:
      return null;
  }
}

/**
 * The single best purchase on the whole tree right now, or `null` when nothing
 * is worth (or possible to) buy.
 *
 * Deliberately a full sweep rather than a cached frontier. It is O(nodes) once a
 * simulated second, which is nothing next to the tick it sits inside, and a
 * cached frontier would be a second model of the tree to keep in step with the
 * one the engine owns.
 */
export function bestPurchase(
  sim: Simulation,
  weights: Weights,
  /** Balances that must survive the purchase — see `spend` in `run.ts`. */
  reserve: ReadonlyMap<ResourceId, Decimal> = new Map(),
): Candidate | null {
  const tree = sim.state.tree;
  const heightFraction = Math.min(1, treeHeight(tree) / PRESTIGE_HEIGHT_UNITS);

  // How badly the tree needs somewhere to put a leaf: 1 when nothing on the
  // whole tree can take one, 0 when something can.
  let leafSlots = 0;
  const options = new Map<string, PricedGrowthOption[]>();
  for (const node of tree.allNodes()) {
    const priced = sim.growthOptions(node.id);
    options.set(node.id, priced);
    if (priced.some((o) => o.rule.type === 'leafCluster')) leafSlots += 1;
  }
  const slotPressure = leafSlots === 0 ? 1 : 1 / (1 + leafSlots);

  // Parched canopies are the one case where the ordinary scoring is wrong: a
  // leaf bought at 0.25 hydration earns a quarter of its quoted rate, and the
  // quote the bot is reading already reflects that, so it would keep buying
  // leaves that keep getting worse. Roots jump the queue instead.
  const thirsty = sim.state.hydration.value < weights.hydrationTarget;

  let best: Candidate | null = null;
  for (const node of tree.allNodes()) {
    for (const option of options.get(node.id) ?? []) {
      const held = reserve.get(option.costResource);
      if (held) {
        const left = sim.state.resources.amount(option.costResource).sub(option.cost);
        if (left.lt(held)) continue;
      }
      let value = score(option, node, weights, heightFraction, slotPressure);
      if (value === null) continue;
      if (thirsty && option.rule.domain === 'root') value *= 4;
      if (best === null || value > best.score) {
        best = { nodeId: node.id, type: option.rule.type, score: value };
      }
    }
  }
  return best;
}
