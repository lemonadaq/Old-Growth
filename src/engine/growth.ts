import Decimal from 'break_infinity.js';
import {
  GROWTH_RULE_BY_TYPE,
  PART_COST_GROWTH,
  partProducerTags,
  type GrowthRule,
  type TreeNodeType,
} from '../content/growth';
import type { ResourceId } from '../content/resources';
import type { Producer } from './economy';
import { applyModifiers, type ModifierSet } from './modifiers';
import type { GrowthOption, TreeGraph, TreeNode } from './treeGraph';

/**
 * What a part costs and what it gives back.
 *
 * The tree graph deals only in shape; this module is where shape meets economy.
 * It prices the options the radial menu offers and turns grown parts into
 * {@link Producer}s, so the menu, the tooltip and the tick loop all quote the
 * same numbers.
 */

/** Producer id for the part grown at `nodeId`. */
export function partProducerId(nodeId: string): string {
  return `part:${nodeId}`;
}

/**
 * Price of the *next* part of a type, given how many the tree already carries:
 * `baseCost × 1.15^owned`.
 */
export function partCost(type: TreeNodeType, owned: number): Decimal {
  const rule = GROWTH_RULE_BY_TYPE[type];
  return new Decimal(rule.baseCost).mul(Decimal.pow(PART_COST_GROWTH, Math.max(0, owned)));
}

/** The producer a grown node contributes, or `null` for structural parts. */
export function partProducer(node: Pick<TreeNode, 'id' | 'type'>): Producer | null {
  const production = GROWTH_RULE_BY_TYPE[node.type].production;
  if (!production) return null;
  return {
    id: partProducerId(node.id),
    resource: production.resource,
    baseRate: production.baseRate,
    tags: partProducerTags(node.type),
  };
}

/** A part's production once modifiers are applied — the true `/s` it will add. */
export interface ProductionDelta {
  readonly resource: ResourceId;
  readonly rate: Decimal;
}

/**
 * How much a part of this type would actually add per second, right now.
 *
 * Production is a plain sum over producers, so evaluating the prospective
 * producer against the live modifiers gives the exact delta the player will see
 * in the HUD — no simulation of the whole pipeline needed.
 */
export function partProductionDelta(
  type: TreeNodeType,
  modifiers: ModifierSet,
): ProductionDelta | null {
  const rule = GROWTH_RULE_BY_TYPE[type];
  if (!rule.production) return null;

  const mods = modifiers.matching(rule.production.resource, partProducerTags(type));
  return {
    resource: rule.production.resource,
    rate: applyModifiers(new Decimal(rule.production.baseRate), mods),
  };
}

/** A {@link GrowthOption} with everything the grow menu needs to render it. */
export interface PricedGrowthOption {
  readonly option: GrowthOption;
  readonly rule: GrowthRule;
  readonly costResource: ResourceId;
  readonly cost: Decimal;
  readonly affordable: boolean;
  /** How much more of `costResource` is needed; zero when affordable. */
  readonly missing: Decimal;
  /** Production the part would add, or `null` for structural parts. */
  readonly production: ProductionDelta | null;
}

/** Price one option against a balance. */
export function priceGrowthOption(
  option: GrowthOption,
  owned: number,
  balance: Decimal,
  modifiers: ModifierSet,
): PricedGrowthOption {
  const rule = GROWTH_RULE_BY_TYPE[option.type];
  const cost = partCost(option.type, owned);
  const affordable = balance.gte(cost);

  return {
    option,
    rule,
    costResource: rule.costResource,
    cost,
    affordable,
    missing: affordable ? new Decimal(0) : cost.sub(balance),
    production: partProductionDelta(option.type, modifiers),
  };
}

/** Reader for current balances — satisfied by the engine's `ResourceRegistry`. */
export interface BalanceSource {
  amount(id: ResourceId): Decimal;
}

/**
 * Every option growable on `nodeId`, priced against the player's balances.
 * Unaffordable options are returned too — the menu greys them out and shows how
 * much is missing rather than hiding them.
 */
export function priceGrowthOptions(
  graph: TreeGraph,
  nodeId: string,
  balances: BalanceSource,
  modifiers: ModifierSet,
): PricedGrowthOption[] {
  return graph
    .getValidGrowthOptions(nodeId)
    .map((option) =>
      priceGrowthOption(
        option,
        graph.countOfType(option.type),
        balances.amount(GROWTH_RULE_BY_TYPE[option.type].costResource),
        modifiers,
      ),
    );
}
