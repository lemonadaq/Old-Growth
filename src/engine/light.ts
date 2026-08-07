import {
  BLOSSOM_BOOST,
  BLOSSOM_BOOST_MAX_STACKS,
  BLOSSOM_BOOST_RANGE_CANONICAL,
  EXPOSURE_MIN,
  MOONLIGHT_FRACTION,
  OCCLUSION_HALF_ANGLE,
  OCCLUSION_RANGE_CANONICAL,
  SHADE_PER_OCCLUDER,
} from '../content/light';
import { daylightAt } from './daylight';
import type { Vec2 } from './geometry';
import type { Modifier } from './modifiers';
import type { TreeGraph } from './treeGraph';

/**
 * Sunlight: how much of it each leaf cluster actually gets.
 *
 * Two independent things decide what the canopy earns, and they are kept
 * separate on purpose:
 *
 * - **Exposure** is per leaf and positional. A leaf starts at 1.0 and is dimmed
 *   by every leaf shading it from above, then lifted by blossoms beside it. This
 *   is the part the player controls, and it is what makes *where* a leaf goes a
 *   decision rather than a formality.
 * - **The daylight factor** is global and temporal: full sun at midday, a
 *   {@link MOONLIGHT_FRACTION} trickle after dark. It rides on the ordinary
 *   modifier system as a `mul` on the Light resource, so it stacks in the usual
 *   `(base + Σadds) × Πmuls` order alongside hydration and everything else.
 *
 * Everything here is pure and works off plain points, so the exposure a leaf
 * *would* have at a position it has not been bought at yet is the same call as
 * the exposure it has now — which is what lets the grow tooltip warn a player
 * that a spot is already shaded.
 */

/** Source id the daylight modifier is granted under, so it revokes cleanly. */
export const DAYLIGHT_SOURCE = 'daylight';

/** A leaf cluster's light situation, all of it derived from position. */
export interface LeafExposure {
  /** Leaf clusters shading this one from above. */
  readonly occluders: number;
  /** Light left after that shade, in `[EXPOSURE_MIN, 1]`. */
  readonly shade: number;
  /** Blossoms close enough to be worth something (already capped). */
  readonly blossoms: number;
  /** What those blossoms multiply the leaf by (`1` when there are none). */
  readonly boost: number;
  /** `shade × boost` — the multiplier on this leaf's Light production. */
  readonly exposure: number;
}

/** A leaf cluster's working point: the node id and where its foliage sits. */
export interface CanopyLeaf {
  readonly id: string;
  readonly point: Vec2;
}

/**
 * The canopy flattened into just the positions the light model cares about.
 *
 * Built once per sweep and reused for every leaf, which is what keeps the O(n²)
 * scan to arithmetic rather than repeated graph walks.
 */
export interface CanopyIndex {
  readonly leaves: readonly CanopyLeaf[];
  readonly blossoms: readonly Vec2[];
}

/** An empty canopy — nothing shades, nothing boosts. */
export const EMPTY_CANOPY: CanopyIndex = { leaves: [], blossoms: [] };

/**
 * Occluders past which the shade factor is already floored, so counting more
 * cannot change the answer. This is the scan's early exit.
 */
export const MAX_COUNTED_OCCLUDERS = Math.ceil(
  Math.log(EXPOSURE_MIN) / Math.log(1 - SHADE_PER_OCCLUDER),
);

/**
 * Pull the leaf and blossom positions out of a tree.
 *
 * A part's *end* is its working point — a leaf cluster's blobs are drawn around
 * the tip of the twig carrying them, not around the joint — so shading is judged
 * where the foliage actually is.
 */
export function canopyIndex(graph: TreeGraph): CanopyIndex {
  const placements = graph.placements();
  const leaves: CanopyLeaf[] = [];
  const blossoms: Vec2[] = [];

  for (const node of graph.allNodes()) {
    if (node.type !== 'leafCluster' && node.type !== 'blossom') continue;
    const placement = placements.get(node.id);
    if (!placement) continue;

    if (node.type === 'leafCluster') leaves.push({ id: node.id, point: placement.end });
    else blossoms.push(placement.end);
  }

  return { leaves, blossoms };
}

/**
 * Does the foliage at `above` stand between `leaf` and the sky?
 *
 * True when it is genuinely higher (canonical `+y` is up), within
 * {@link OCCLUSION_RANGE_CANONICAL}, and inside the shadow cone rising from the
 * leaf. The cone test is `cos θ ≥ cos(half-angle)` with `cos θ = dy / distance`,
 * which avoids a trig call per pair in the inner loop.
 */
export function occludes(leaf: Vec2, above: Vec2): boolean {
  const dy = above.y - leaf.y;
  // Level with, or below: a leaf cannot be shaded from underneath.
  if (dy <= 0) return false;

  const dx = above.x - leaf.x;
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq > OCCLUSION_RANGE_CANONICAL * OCCLUSION_RANGE_CANONICAL) return false;

  return dy >= Math.cos(OCCLUSION_HALF_ANGLE) * Math.sqrt(distanceSq);
}

/**
 * Light left after `occluders` leaves have taken their cut: `0.85ⁿ`, floored.
 *
 * Compounding rather than subtracting means the tenth leaf over a spot costs
 * less than the second did, and no number of them can take a leaf to zero.
 */
export function shadeFactor(occluders: number): number {
  const count = Math.max(0, occluders);
  return Math.max(EXPOSURE_MIN, Math.pow(1 - SHADE_PER_OCCLUDER, count));
}

/** What `blossoms` nearby flowers multiply a leaf by, capped at the stack limit. */
export function blossomBoost(blossoms: number): number {
  return 1 + BLOSSOM_BOOST * Math.min(Math.max(0, blossoms), BLOSSOM_BOOST_MAX_STACKS);
}

/**
 * Work out the exposure of a leaf standing at `point`.
 *
 * `excludeId` drops one leaf from the scan — a real leaf must not shade itself.
 * Omitting it evaluates a *prospective* leaf, which is what the grow menu
 * quotes before the purchase.
 *
 * The scan stops counting occluders once the shade factor is floored, so a
 * pathological pile of leaves costs a bounded amount of work per leaf.
 */
export function exposureAt(
  point: Vec2,
  canopy: CanopyIndex = EMPTY_CANOPY,
  excludeId?: string,
): LeafExposure {
  let occluders = 0;
  for (const leaf of canopy.leaves) {
    if (leaf.id === excludeId) continue;
    if (!occludes(point, leaf.point)) continue;
    occluders += 1;
    if (occluders >= MAX_COUNTED_OCCLUDERS) break;
  }

  let blossoms = 0;
  for (const blossom of canopy.blossoms) {
    const dx = blossom.x - point.x;
    const dy = blossom.y - point.y;
    if (dx * dx + dy * dy <= BLOSSOM_BOOST_RANGE_CANONICAL * BLOSSOM_BOOST_RANGE_CANONICAL) {
      blossoms += 1;
      if (blossoms >= BLOSSOM_BOOST_MAX_STACKS) break;
    }
  }

  const shade = shadeFactor(occluders);
  const boost = blossomBoost(blossoms);
  return { occluders, shade, blossoms, boost, exposure: shade * boost };
}

/** Exposure for every leaf in a canopy, keyed by node id. */
export function computeLeafExposures(canopy: CanopyIndex): Map<string, LeafExposure> {
  const exposures = new Map<string, LeafExposure>();
  for (const leaf of canopy.leaves) {
    exposures.set(leaf.id, exposureAt(leaf.point, canopy, leaf.id));
  }
  return exposures;
}

/**
 * What the canopy earns at a moment of the day, as a multiplier on Light.
 *
 * The sun's own curve during the lit hours, never falling below the moonlight
 * trickle. Using the same curve the sky is drawn from means the number in the
 * HUD and the colour of the light agree without being wired together.
 */
export function lightFactorAt(t: number): number {
  return Math.max(MOONLIGHT_FRACTION, daylightAt(t));
}

/**
 * The daylight factor as a modifier on the Light resource.
 *
 * Resource-targeted rather than tag-targeted so it covers everything that makes
 * Light — leaves and blossoms alike — without needing every future light source
 * to remember to carry a tag.
 */
export function daylightModifiers(factor: number): Modifier[] {
  return [
    {
      id: 'daylight:light',
      source: DAYLIGHT_SOURCE,
      type: 'mul',
      targetKind: 'resource',
      target: 'light',
      value: factor,
    },
  ];
}
