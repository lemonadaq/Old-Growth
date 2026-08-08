import {
  DEFAULT_SOIL_SEED,
  DEPTH_PRODUCTION_SCALE,
  SOIL_UNITS_PER_CANONICAL,
  STRATA,
  VEIN_COUNT,
  VEIN_HALF_SPAN,
  VEIN_MAX_DEPTH,
  VEIN_RADIUS_MAX,
  VEIN_RADIUS_MIN,
  VEIN_RICHNESS_MAX,
  VEIN_RICHNESS_MIN,
  type Stratum,
} from '../content/soil';
import type { Vec2 } from './geometry';
import { createSeededRandom } from './rng';

/**
 * The underground: how deep a point is, what it is buried in, and whether there
 * is ore there.
 *
 * A {@link SoilMap} is generated once per world from a seed and never changes,
 * so it serialises to a single number and any two clients — or a save and a
 * reload — agree on exactly where every mineral pocket lies. That determinism is
 * load-bearing: the grow menu quotes what a root tip *will* find before it is
 * bought, and it can only make that promise if the answer is fixed.
 *
 * Geometry here is in **canonical tree space** (the same space the tree graph
 * uses, `+y` up, origin at the trunk base). Depths are reported in soil units,
 * which is the player-facing scale the strata table is written in.
 */

/** A pocket of ore buried in the soil. Circular, in canonical space. */
export interface MineralVein {
  readonly id: string;
  /** Centre in canonical tree space (`y` is negative — it is underground). */
  readonly center: Vec2;
  /** Radius in canonical units. */
  readonly radius: number;
  /** Mineral yield multiplier for a root tip inside it. */
  readonly richness: number;
}

/** The generated underground. Fully derived from `seed`. */
export interface SoilMap {
  readonly seed: number;
  readonly veins: readonly MineralVein[];
}

/** What the soil is like at one point, and what it is worth to a root there. */
export interface SoilConditions {
  /** Depth below the surface in soil units; negative above ground. */
  readonly depth: number;
  /** The layer this point sits in. */
  readonly stratum: Stratum;
  /** Production multiplier earned by the depth: `1 + depth / 500`. */
  readonly multiplier: number;
  /** The mineral pocket containing this point, if any. */
  readonly vein: MineralVein | null;
}

/**
 * Depth (soil units) of a canonical `y`. The surface is `0` and depth grows
 * downward, so anything in the canopy comes back negative — callers that only
 * care about the underground clamp it themselves.
 */
export function depthAt(y: number): number {
  return -y * SOIL_UNITS_PER_CANONICAL;
}

/** Canonical `y` of a depth. The inverse of {@link depthAt}. */
export function canonicalYAt(depth: number): number {
  return -depth / SOIL_UNITS_PER_CANONICAL;
}

/**
 * The layer a depth falls in. Bands are half-open (`top ≤ depth < bottom`), so
 * exactly 300 is Clay rather than Topsoil. Anything above the surface reports
 * the topmost band, which is what the layer *below* it would be.
 */
export function stratumAt(depth: number): Stratum {
  for (const stratum of STRATA) {
    if (depth < stratum.bottom) return stratum;
  }
  return STRATA[STRATA.length - 1];
}

/**
 * Depth bonus on root production: `×(1 + depth / 500)`. A root above the
 * surface earns nothing extra rather than being penalised.
 */
export function depthMultiplier(depth: number): number {
  return 1 + Math.max(0, depth) / DEPTH_PRODUCTION_SCALE;
}

/** Pick an index from `weights` proportionally, given a roll in `[0, 1)`. */
function pickWeighted(weights: readonly number[], roll: number): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = roll * total;
  for (let i = 0; i < weights.length; i += 1) {
    cursor -= weights[i];
    if (cursor < 0) return i;
  }
  return weights.length - 1;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Scatter mineral pockets through the column.
 *
 * Each pocket picks its layer by {@link Stratum.veinWeight} first and its depth
 * within that layer second, which is what makes the distribution *read* as
 * geology — a dense belt through the clay and rock with the odd shallow find —
 * rather than as uniform noise. The bottom-most band is unbounded, so
 * generation stops at {@link VEIN_MAX_DEPTH}.
 */
export function createSoilMap(seed: number = DEFAULT_SOIL_SEED): SoilMap {
  const random = createSeededRandom(seed);
  const weights = STRATA.map((stratum) => stratum.veinWeight);
  const veins: MineralVein[] = [];

  for (let i = 0; i < VEIN_COUNT; i += 1) {
    const stratum = STRATA[pickWeighted(weights, random())];
    const top = Math.min(stratum.top, VEIN_MAX_DEPTH);
    const bottom = Math.min(stratum.bottom, VEIN_MAX_DEPTH);

    const depth = lerp(top, bottom, random());
    const x = (random() * 2 - 1) * VEIN_HALF_SPAN;
    const radius = lerp(VEIN_RADIUS_MIN, VEIN_RADIUS_MAX, random()) / SOIL_UNITS_PER_CANONICAL;
    const richness = lerp(VEIN_RICHNESS_MIN, VEIN_RICHNESS_MAX, random());

    veins.push({
      id: `vein-${i}`,
      center: { x, y: canonicalYAt(depth) },
      radius,
      richness,
    });
  }

  return { seed, veins };
}

/** An empty underground: strata but no ore. Useful for tests and for previews. */
export const BARREN_SOIL: SoilMap = { seed: 0, veins: [] };

/**
 * The pocket containing `point`, or `null`. When pockets overlap the richest
 * one wins, so a root tip is never punished for landing in two at once.
 *
 * `reach` widens every pocket's radius without moving it or changing what it is
 * worth — a root that could not *find* the ore now can. It is how the
 * mycorrhiza's hyphae are modelled: a fungal network does not create minerals,
 * it extends how far a root can feel for them. `1` is a root's own senses.
 */
export function veinAt(soil: SoilMap, point: Vec2, reach = 1): MineralVein | null {
  const scale = Math.max(0, reach);
  let best: MineralVein | null = null;

  for (const vein of soil.veins) {
    const dx = point.x - vein.center.x;
    const dy = point.y - vein.center.y;
    const radius = vein.radius * scale;
    if (dx * dx + dy * dy > radius * radius) continue;
    if (best === null || vein.richness > best.richness) best = vein;
  }

  return best;
}

/** Everything the economy needs to know about one point in the ground. */
export function soilConditionsAt(soil: SoilMap, point: Vec2, reach = 1): SoilConditions {
  const depth = depthAt(point.y);
  return {
    depth,
    stratum: stratumAt(depth),
    multiplier: depthMultiplier(depth),
    vein: veinAt(soil, point, reach),
  };
}
