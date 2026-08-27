import type { ResourceId } from './resources';
import { stratumResourceTag, stratumTag, type StratumId } from './soil';
import { speciesResourceTag, speciesTag, STARTER_SPECIES_ID } from './species';

/**
 * Growth rules as data: what each part of the tree is, what it may grow, where
 * that child sits, what it costs, and what it produces.
 *
 * This is the single source of truth behind the radial grow menu. The engine's
 * `TreeGraph` reads these rules to answer `getValidGrowthOptions`, and the
 * economy reads them to price a purchase and to register the part's producer —
 * so adding a new part type is a data edit, never an engine edit.
 *
 * Layer note: content stays free of engine imports. Lengths and thicknesses are
 * in **canonical tree space** (1 unit ≈ a mature tree's height), the same space
 * `src/engine/tree.ts` projects into pixels.
 */

/** Every kind of node the tree graph can contain. */
export type TreeNodeType =
  'trunk' | 'branch' | 'twig' | 'leafCluster' | 'blossom' | 'rootSegment' | 'rootTip';

/** Which half of the tree a part belongs to. Canopy grows up, roots grow down. */
export type TreeDomain = 'canopy' | 'root';

/** Where a part's children attach along it. */
export type ChildAttachment =
  /** All children hang off the parent's far end (twigs, root tips). */
  | 'tip'
  /** Children are spaced down the parent's upper length (trunk, branches). */
  | 'spread';

/** Passive production a part contributes once grown. */
export interface PartProduction {
  readonly resource: ResourceId;
  /** Units per second before modifiers. */
  readonly baseRate: number;
  /**
   * When set, the part produces *only* inside a mineral vein, and its yield is
   * scaled by that vein's richness. A part placed outside every pocket produces
   * nothing at all — which is what makes where a root tip lands matter.
   */
  readonly requiresVein?: boolean;
  /**
   * When set, the part's yield is scaled by its light exposure — dimmed by the
   * foliage above it, lifted by the blossoms beside it. See `src/content/light.ts`.
   */
  readonly shaded?: boolean;
}

export interface GrowthRule {
  readonly type: TreeNodeType;
  /** Full name, used in tooltips. */
  readonly label: string;
  /** Two or three characters for the radial menu dial. */
  readonly shortLabel: string;
  readonly domain: TreeDomain;
  /** One line of flavour + mechanics for the tooltip. */
  readonly description: string;
  /** Child types this part may grow. Empty means terminal. */
  readonly allowedChildren: readonly TreeNodeType[];
  /** Hard cap on direct children. */
  readonly maxChildren: number;
  /** Half-angle (degrees) a child may deviate from its reference direction. */
  readonly spreadDegrees: number;
  /** Deterministic per-child wobble (degrees) so no two forks look alike. */
  readonly jitterDegrees: number;
  /** Where this part's children attach along it. */
  readonly childAttach: ChildAttachment;
  /** Length of a first-generation part of this type. */
  readonly baseLength: number;
  /** Stroke width (or blob radius, for leaves and blossoms) of the same. */
  readonly baseThickness: number;
  /** Per generation of depth, dimensions shrink by this factor (1 = never). */
  readonly depthFalloff: number;
  readonly costResource: ResourceId;
  /** Price of the very first part of this type. */
  readonly baseCost: number;
  /** What the part produces once grown, if anything. */
  readonly production?: PartProduction;
}

/**
 * Every part costs `baseCost × 1.15^(parts of that type already owned)`, so the
 * hundredth leaf is a real decision and the first is nearly free.
 */
export const PART_COST_GROWTH = 1.15;

/**
 * Fraction of the parent's length below which spread children never attach —
 * limbs sprout from the upper half, not out of the base.
 */
export const ATTACH_SPREAD_MIN = 0.45;

/**
 * The part catalogue.
 *
 * Costs and rates here are first-pass values chosen so the STEP 6 loop reads
 * clearly (a handful of taps buys the first branch); STEP 19 owns real balance.
 */
export const GROWTH_RULES: readonly GrowthRule[] = [
  {
    type: 'trunk',
    label: 'Trunk',
    shortLabel: 'TR',
    domain: 'canopy',
    description: 'The heart of the tree. Tap it for Sap; grow limbs and roots from it.',
    allowedChildren: ['branch', 'rootSegment'],
    maxChildren: 5,
    spreadDegrees: 70,
    jitterDegrees: 9,
    childAttach: 'spread',
    baseLength: 0.6,
    baseThickness: 0.046,
    depthFalloff: 1,
    costResource: 'sap',
    baseCost: 0,
  },
  {
    type: 'branch',
    label: 'Branch',
    shortLabel: 'BR',
    domain: 'canopy',
    description: 'Structural wood. Carries twigs, leaves and blossoms further into the light.',
    allowedChildren: ['branch', 'twig', 'leafCluster', 'blossom'],
    maxChildren: 4,
    spreadDegrees: 70,
    jitterDegrees: 10,
    childAttach: 'spread',
    baseLength: 0.3,
    baseThickness: 0.023,
    depthFalloff: 0.86,
    costResource: 'sap',
    baseCost: 15,
  },
  {
    type: 'twig',
    label: 'Twig',
    shortLabel: 'TW',
    domain: 'canopy',
    description: 'A cheap reach outward. Holds leaves where a branch would be wasteful.',
    allowedChildren: ['leafCluster', 'blossom'],
    maxChildren: 3,
    spreadDegrees: 70,
    jitterDegrees: 12,
    childAttach: 'tip',
    baseLength: 0.16,
    baseThickness: 0.012,
    depthFalloff: 0.9,
    costResource: 'sap',
    baseCost: 8,
  },
  {
    type: 'leafCluster',
    label: 'Leaf Cluster',
    shortLabel: 'LF',
    domain: 'canopy',
    description: 'Catches sunlight. The canopy is where Light comes from.',
    allowedChildren: [],
    maxChildren: 0,
    spreadDegrees: 70,
    jitterDegrees: 16,
    childAttach: 'tip',
    baseLength: 0.07,
    baseThickness: 0.052,
    depthFalloff: 1,
    costResource: 'sap',
    baseCost: 10,
    production: { resource: 'light', baseRate: 0.4, shaded: true },
  },
  {
    type: 'blossom',
    label: 'Blossom',
    shortLabel: 'BL',
    domain: 'canopy',
    description: 'A flush of flower. A little Light, and what draws the bees in time.',
    allowedChildren: [],
    maxChildren: 0,
    spreadDegrees: 70,
    jitterDegrees: 18,
    childAttach: 'tip',
    baseLength: 0.05,
    baseThickness: 0.03,
    depthFalloff: 1,
    costResource: 'sap',
    baseCost: 60,
    production: { resource: 'light', baseRate: 0.15 },
  },
  {
    type: 'rootSegment',
    label: 'Root Segment',
    shortLabel: 'RT',
    domain: 'root',
    description: 'Reaches down through the soil, drawing up Water even while you are away.',
    allowedChildren: ['rootSegment', 'rootTip'],
    maxChildren: 3,
    spreadDegrees: 55,
    jitterDegrees: 10,
    childAttach: 'spread',
    baseLength: 0.26,
    baseThickness: 0.02,
    depthFalloff: 0.88,
    costResource: 'sap',
    baseCost: 12,
    production: { resource: 'water', baseRate: 0.3 },
  },
  {
    type: 'rootTip',
    label: 'Root Tip',
    shortLabel: 'RP',
    domain: 'root',
    description: 'The hungry end of a root. Worries Minerals out of the soil.',
    allowedChildren: [],
    maxChildren: 0,
    spreadDegrees: 45,
    jitterDegrees: 14,
    childAttach: 'tip',
    baseLength: 0.14,
    baseThickness: 0.011,
    depthFalloff: 1,
    costResource: 'sap',
    baseCost: 35,
    production: { resource: 'minerals', baseRate: 0.12, requiresVein: true },
  },
] as const;

/** Lookup map from part type → rule. */
export const GROWTH_RULE_BY_TYPE: Readonly<Record<TreeNodeType, GrowthRule>> = Object.fromEntries(
  GROWTH_RULES.map((r) => [r.type, r]),
) as Record<TreeNodeType, GrowthRule>;

/** All part types in catalogue order. */
export const TREE_NODE_TYPES: readonly TreeNodeType[] = GROWTH_RULES.map((r) => r.type);

/**
 * Tag carried by production that keeps running while the player is away.
 *
 * The tree rests but the roots do not: STEP 14's offline calculator pays this
 * tag in full and everything else at a fraction, so the tag has to be on the
 * producers from the moment roots exist rather than retrofitted later.
 */
export const OFFLINE_TAG = 'offline';

/**
 * Producer tags a grown part carries, so modifiers can target "everything in
 * the canopy" or "every leaf cluster" without naming individual nodes.
 *
 * A part also carries what it is *made of*: `species:willow`, and — when it
 * produces — `species:willow/water`. The two-part tag is what lets a species
 * trait reach one resource on its own parts and nothing else, since a modifier
 * matches a producer by resource or by tag but never by both at once.
 *
 * Underground parts additionally carry {@link OFFLINE_TAG} and, when the caller
 * knows where the part is working, the layer it is working in — `soil:clay` and
 * `soil:clay/water`. That is what lets a drought dry out the shallow roots and
 * leave the ones that reached the rock alone, without naming a single node.
 */
export function partProducerTags(
  type: TreeNodeType,
  speciesId: string = STARTER_SPECIES_ID,
  stratum?: StratumId,
): readonly string[] {
  const rule = GROWTH_RULE_BY_TYPE[type];
  const tags: string[] = [rule.domain, type, speciesTag(speciesId)];
  if (rule.production) tags.push(speciesResourceTag(speciesId, rule.production.resource));
  if (rule.domain === 'root') {
    tags.push(OFFLINE_TAG);
    if (stratum) {
      tags.push(stratumTag(stratum));
      if (rule.production) tags.push(stratumResourceTag(stratum, rule.production.resource));
    }
  }
  return tags;
}
