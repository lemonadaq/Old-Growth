import { BLOSSOM_BOOST_RANGE, OCCLUSION_CONE_DEGREES, OCCLUSION_RANGE } from './balance';
import { RADIANS_PER_DEGREE } from './units';
import { SOIL_UNITS_PER_CANONICAL } from './soil';

/**
 * Sunlight as data: how leaves shade one another, what a blossom is worth to its
 * neighbours, and how much the canopy earns after dark.
 *
 * `src/content/daylight.ts` owns the *shape of the day* — how long it is and
 * where dawn and dusk fall. This file owns what that day is worth, which is the
 * part the player can actually change by moving leaves around.
 *
 * ## Units
 *
 * Distances here are quoted in **world units**, the same player-facing scale the
 * strata table uses: {@link SOIL_UNITS_PER_CANONICAL} of them make one canonical
 * tree unit. The design specifies the occlusion range as 250px, and 250 world
 * units is that number at the scale the rest of the game is written in — while
 * the geometry itself stays resolution-independent.
 */

/**
 * Every number below is tuned in `./balance` and re-exported here, because this
 * is the module a reader comes to when they want to know how shade works:
 *
 * - `OCCLUSION_RANGE` — how far above a leaf another leaf can be and still shade
 *   it, in world units.
 * - `OCCLUSION_CONE_DEGREES` — full width of the cone a leaf casts its shadow
 *   down. A leaf is shaded by anything inside a 60° cone rising from it. Wider
 *   and a canopy could never be spread wide enough to escape itself; narrower
 *   and stacking leaves would go unpunished.
 * - `SHADE_PER_OCCLUDER` — the fraction each shading leaf takes of the light
 *   that reaches through the ones above it. Compounding, not subtracting, so a
 *   crowded cluster gets steadily dimmer without any single leaf being able to
 *   switch another off.
 * - `EXPOSURE_MIN` — floor on a leaf's shade factor. Deep inside a thicket the
 *   compounding would run to almost nothing, and a leaf that earns *literally*
 *   nothing is a dead purchase the player cannot diagnose. The floor also bounds
 *   the occlusion scan — see `MAX_COUNTED_OCCLUDERS` in `src/engine/light.ts`.
 * - `BLOSSOM_BOOST_RANGE` / `BLOSSOM_BOOST` — how close a blossom must be to a
 *   leaf to be worth anything to it, and what it adds.
 * - `BLOSSOM_BOOST_MAX_STACKS` — how many blossoms one leaf may be paid for.
 *   Uncapped, a ring of blossoms around a single leaf would beat any amount of
 *   canopy spreading, which is the exact lesson this system exists to teach.
 * - `MOONLIGHT_FRACTION` — what the canopy earns at night. Not zero: the tree
 *   idles rather than stopping, and an overnight tab should not read as broken.
 * - `EXPOSURE_INTERVAL_SECONDS` — how often exposure is recomputed. Shading is
 *   O(n²) over the canopy and only changes when the tree does; growing or
 *   pruning recomputes immediately regardless.
 * - `DEW_SECONDS` / `DEW_MIN_TAPS` — the dawn burst, priced at a minute of Sap
 *   income with a floor in taps. Nothing produces Sap passively yet, so the
 *   floor is what keeps the bonus a real event.
 */
export {
  BLOSSOM_BOOST,
  BLOSSOM_BOOST_MAX_STACKS,
  BLOSSOM_BOOST_RANGE,
  DEW_MIN_TAPS,
  DEW_SECONDS,
  EXPOSURE_INTERVAL_SECONDS,
  EXPOSURE_MIN,
  MOONLIGHT_FRACTION,
  OCCLUSION_CONE_DEGREES,
  OCCLUSION_RANGE,
  SHADE_PER_OCCLUDER,
} from './balance';

/** {@link OCCLUSION_RANGE} in canonical tree units. */
export const OCCLUSION_RANGE_CANONICAL = OCCLUSION_RANGE / SOIL_UNITS_PER_CANONICAL;

/** Half-angle of the occlusion cone, in radians. */
export const OCCLUSION_HALF_ANGLE = (OCCLUSION_CONE_DEGREES / 2) * RADIANS_PER_DEGREE;

/** {@link BLOSSOM_BOOST_RANGE} in canonical tree units. */
export const BLOSSOM_BOOST_RANGE_CANONICAL = BLOSSOM_BOOST_RANGE / SOIL_UNITS_PER_CANONICAL;
