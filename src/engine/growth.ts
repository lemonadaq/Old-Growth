import Decimal from 'break_infinity.js';
import {
  GROWTH_RULE_BY_TYPE,
  PART_COST_GROWTH,
  partProducerTags,
  type GrowthRule,
  type TreeNodeType,
} from '../content/growth';
import { GROWTH_COST_TAG } from '../content/prune';
import type { ResourceId } from '../content/resources';
import type { Stratum } from '../content/soil';
import { STARTER_SPECIES_ID } from '../content/species';
import type { Producer } from './economy';
import { canopyIndex, exposureAt } from './light';
import { applyModifiers, type ModifierSet } from './modifiers';
import { speciesCostMultiplier } from './species';
import {
  BARREN_SOIL,
  soilConditionsAt,
  type MineralVein,
  type SoilConditions,
  type SoilMap,
} from './soil';
import {
  placeOption,
  type GrowthOption,
  type NodePlacement,
  type TreeGraph,
  type TreeNode,
} from './treeGraph';

/**
 * What a part costs and what it gives back.
 *
 * The tree graph deals only in shape; this module is where shape meets economy.
 * It prices the options the radial menu offers and turns grown parts into
 * {@link Producer}s, so the menu, the tooltip and the tick loop all quote the
 * same numbers.
 *
 * Underground parts are worth what the *ground* makes them worth: a root's rate
 * is scaled by its depth, and a root tip only finds Minerals inside a vein.
 * Above ground the equivalent is light: a leaf is worth what the sky it can see
 * makes it worth. All of that is resolved from the part's placement, so the same
 * function answers both "what is this part earning" and "what would a part here
 * earn" — which is what lets the grow tooltip quote an honest number before the
 * purchase.
 */

/** Producer id for the part grown at `nodeId`. */
export function partProducerId(nodeId: string): string {
  return `part:${nodeId}`;
}

/**
 * Price of the *next* part of a type, given how many the tree already carries:
 * `baseCost × 1.15^owned`, then whatever the {@link GROWTH_COST_TAG} modifiers
 * make of it.
 *
 * Passing `modifiers` is what lets a discount (apical dominance today, a species
 * or a season later) reach prices without any caller having to know a discount
 * exists. Omitting them prices the part at list, which is what a catalogue view
 * or a test with no simulation behind it wants. A discount can never take a
 * price below zero.
 */
export function partCost(
  type: TreeNodeType,
  owned: number,
  modifiers?: ModifierSet,
  speciesId?: string,
): Decimal {
  const rule = GROWTH_RULE_BY_TYPE[type];
  let list = new Decimal(rule.baseCost).mul(Decimal.pow(PART_COST_GROWTH, Math.max(0, owned)));

  // The species' own price break lands on the list price, *before* the
  // `growth.cost` modifiers, so a cheap species and a growth buff compose
  // instead of one swallowing the other.
  if (speciesId) list = list.mul(speciesCostMultiplier(speciesId, type));

  if (!modifiers) return list;

  const priced = applyModifiers(list, modifiers.matchingTag(GROWTH_COST_TAG));
  return priced.lt(0) ? new Decimal(0) : priced;
}

/**
 * Where a part sits, in what, and in how much light. Everything positional the
 * economy needs.
 *
 * `placement` is omitted only where the caller genuinely has no position (a
 * bare type, in tests or in a catalogue view); an underground part evaluated
 * without one is treated as sitting at the surface in barren ground, which is
 * the pessimistic reading rather than an optimistic guess. `exposure` is the
 * optimistic default in the same situation — an unplaced leaf is quoted in full
 * sun, because the alternative is inventing a shadow nobody cast.
 */
export interface PartContext {
  readonly soil: SoilMap;
  readonly placement?: NodePlacement;
  /** Light multiplier for a `shaded` part; `1` (full sun) when unknown. */
  readonly exposure?: number;
  /**
   * How far out a root tip can feel for ore, as a multiplier on every pocket's
   * radius. `1` is a bare root; the mycorrhiza raises it. Defaulted rather than
   * required so a caller with no simulation behind it still prices a part.
   */
  readonly veinReach?: number;
}

/** No position, no ore, full sun — the default when nothing better is known. */
export const NO_PART_CONTEXT: PartContext = { soil: BARREN_SOIL };

/**
 * A part's production before modifiers, resolved against the ground it sits in.
 *
 * Canopy parts ignore the soil entirely. Root parts earn the depth bonus, and a
 * part whose production `requiresVein` earns nothing at all outside a pocket —
 * so `rate` is already zero for a root tip that struck plain clay.
 */
interface SitedProduction {
  readonly resource: ResourceId;
  /** Rate after depth, vein and light exposure, before modifiers. */
  readonly rate: number;
  /** Soil facts at the part's working tip; `null` for canopy parts. */
  readonly conditions: SoilConditions | null;
  /** Whether this production needs a vein to happen at all. */
  readonly requiresVein: boolean;
  /** Light multiplier applied; `null` for parts the sky does not reach. */
  readonly exposure: number | null;
}

/**
 * Resolve a part type's production against a position.
 *
 * The working point is the part's **far end** — the root tip that actually sits
 * in the ore, the foliage at the twig's tip rather than the joint it grew from —
 * so a part is judged by where it reached rather than where it started.
 */
function siteProduction(type: TreeNodeType, ctx: PartContext): SitedProduction | null {
  const rule = GROWTH_RULE_BY_TYPE[type];
  const production = rule.production;
  if (!production) return null;

  if (rule.domain !== 'root') {
    const exposure = production.shaded ? (ctx.exposure ?? 1) : null;
    return {
      resource: production.resource,
      rate: production.baseRate * (exposure ?? 1),
      conditions: null,
      requiresVein: false,
      exposure,
    };
  }

  const conditions = ctx.placement
    ? soilConditionsAt(ctx.soil, ctx.placement.end, ctx.veinReach ?? 1)
    : null;
  const multiplier = conditions?.multiplier ?? 1;
  const vein = conditions?.vein ?? null;

  let rate = production.baseRate * multiplier;
  if (production.requiresVein) {
    rate = vein ? rate * vein.richness : 0;
  }

  return {
    resource: production.resource,
    rate,
    conditions,
    requiresVein: production.requiresVein === true,
    exposure: null,
  };
}

/**
 * The producer a grown node contributes, or `null` when it contributes nothing
 * — either because it is structural, or because it is a root tip that found no
 * vein. An empty producer is deliberately *not* registered: a tip in barren
 * ground should stay barren even if a later global bonus adds a flat rate.
 */
export function partProducer(
  node: Pick<TreeNode, 'id' | 'type'> & Partial<Pick<TreeNode, 'speciesId'>>,
  ctx: PartContext = NO_PART_CONTEXT,
): Producer | null {
  const sited = siteProduction(node.type, ctx);
  if (!sited || sited.rate <= 0) return null;

  return {
    id: partProducerId(node.id),
    resource: sited.resource,
    baseRate: sited.rate,
    // The layer goes on the producer, so weather that spares the deep roots can
    // find the shallow ones. A part with no placement has no layer to name.
    tags: partProducerTags(node.type, node.speciesId, sited.conditions?.stratum.id),
  };
}

/** A part's production once modifiers are applied — the true `/s` it will add. */
export interface ProductionDelta {
  readonly resource: ResourceId;
  /** Final rate: catalogue × depth × vein richness × modifiers. */
  readonly rate: Decimal;
  /** Depth of the part's working tip in soil units; `null` for canopy parts. */
  readonly depth: number | null;
  /** The layer that tip sits in; `null` for canopy parts. */
  readonly stratum: Stratum | null;
  /** Bonus earned by depth alone (`1` when it earns none). */
  readonly depthMultiplier: number;
  /** The mineral pocket backing this production, if any. */
  readonly vein: MineralVein | null;
  /** True when this part needs a vein it has not got, and so produces nothing. */
  readonly missingVein: boolean;
  /** Light multiplier at this position; `null` for parts the sky does not reach. */
  readonly exposure: number | null;
}

/**
 * How much a part of this type would actually add per second, right now, in the
 * ground it would occupy.
 *
 * Production is a plain sum over producers, so evaluating the prospective
 * producer against the live modifiers gives the exact delta the player will see
 * in the HUD — no simulation of the whole pipeline needed.
 */
export function partProductionDelta(
  type: TreeNodeType,
  modifiers: ModifierSet,
  ctx: PartContext = NO_PART_CONTEXT,
  speciesId?: string,
): ProductionDelta | null {
  const sited = siteProduction(type, ctx);
  if (!sited) return null;

  const mods = modifiers.matching(
    sited.resource,
    partProducerTags(type, speciesId, sited.conditions?.stratum.id),
  );
  const vein = sited.conditions?.vein ?? null;

  return {
    resource: sited.resource,
    rate: sited.rate > 0 ? applyModifiers(new Decimal(sited.rate), mods) : new Decimal(0),
    depth: sited.conditions?.depth ?? null,
    stratum: sited.conditions?.stratum ?? null,
    depthMultiplier: sited.conditions?.multiplier ?? 1,
    vein,
    missingVein: sited.requiresVein && vein === null,
    exposure: sited.exposure,
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
  /** What the part would be grown as — whatever the species picker is showing. */
  readonly speciesId: string;
}

/** Price one option against a balance, as a given species. */
export function priceGrowthOption(
  option: GrowthOption,
  owned: number,
  balance: Decimal,
  modifiers: ModifierSet,
  ctx: PartContext = NO_PART_CONTEXT,
  speciesId: string = STARTER_SPECIES_ID,
): PricedGrowthOption {
  const rule = GROWTH_RULE_BY_TYPE[option.type];
  const cost = partCost(option.type, owned, modifiers, speciesId);
  const affordable = balance.gte(cost);

  return {
    option,
    rule,
    costResource: rule.costResource,
    cost,
    affordable,
    missing: affordable ? new Decimal(0) : cost.sub(balance),
    production: partProductionDelta(option.type, modifiers, ctx, speciesId),
    speciesId,
  };
}

/** Reader for current balances — satisfied by the engine's `ResourceRegistry`. */
export interface BalanceSource {
  amount(id: ResourceId): Decimal;
}

/**
 * Every option growable on `nodeId`, priced against the player's balances and
 * against the ground each part would land in. Unaffordable options are returned
 * too — the menu greys them out and shows how much is missing rather than
 * hiding them.
 *
 * Each option is placed exactly where growing it would put it, so the quoted
 * `/s` already accounts for the depth it will reach and the vein it will (or
 * will not) strike — and, above ground, the shade already standing over the spot
 * a leaf would land in.
 */
export function priceGrowthOptions(
  graph: TreeGraph,
  nodeId: string,
  balances: BalanceSource,
  modifiers: ModifierSet,
  soil: SoilMap = BARREN_SOIL,
  speciesId: string = STARTER_SPECIES_ID,
  veinReach = 1,
): PricedGrowthOption[] {
  const parent = graph.placements().get(nodeId);
  // Built once for the whole menu rather than per option: the canopy does not
  // change while the player is deciding.
  const canopy = canopyIndex(graph);

  return graph.getValidGrowthOptions(nodeId).map((option) => {
    const placement = parent ? placeOption(parent, option) : undefined;
    const shaded = GROWTH_RULE_BY_TYPE[option.type].production?.shaded === true;

    return priceGrowthOption(
      option,
      graph.countOfType(option.type),
      balances.amount(GROWTH_RULE_BY_TYPE[option.type].costResource),
      modifiers,
      {
        soil,
        placement,
        exposure: shaded && placement ? exposureAt(placement.end, canopy).exposure : undefined,
        veinReach,
      },
      speciesId,
    );
  });
}
