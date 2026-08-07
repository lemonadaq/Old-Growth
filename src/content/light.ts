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

/** How far above a leaf another leaf can be and still shade it. */
export const OCCLUSION_RANGE = 250;

/** {@link OCCLUSION_RANGE} in canonical tree units. */
export const OCCLUSION_RANGE_CANONICAL = OCCLUSION_RANGE / SOIL_UNITS_PER_CANONICAL;

/**
 * Full width of the cone a leaf casts its shadow down, in degrees.
 *
 * A leaf is shaded by anything inside a 60° cone rising from it — 30° either
 * side of straight up. Wider and a canopy could never be spread wide enough to
 * escape itself; narrower and stacking leaves would go unpunished.
 */
export const OCCLUSION_CONE_DEGREES = 60;

/** Half-angle of the occlusion cone, in radians. */
export const OCCLUSION_HALF_ANGLE = ((OCCLUSION_CONE_DEGREES / 2) * Math.PI) / 180;

/**
 * Each shading leaf takes this fraction of the light that reaches through the
 * ones above it — compounding, not subtracting, so a crowded cluster gets
 * steadily dimmer without any single leaf being able to switch another off.
 */
export const SHADE_PER_OCCLUDER = 0.15;

/**
 * Floor on a leaf's shade factor.
 *
 * Deep inside a thicket the compounding would run to almost nothing; a leaf that
 * earns *literally* nothing is a dead purchase the player cannot diagnose. The
 * floor keeps a buried leaf faintly productive and bounds the occlusion scan
 * (see `MAX_COUNTED_OCCLUDERS` in `src/engine/light.ts`).
 */
export const EXPOSURE_MIN = 0.1;

/** How close a blossom must be to a leaf to be worth anything to it. */
export const BLOSSOM_BOOST_RANGE = 150;

/** {@link BLOSSOM_BOOST_RANGE} in canonical tree units. */
export const BLOSSOM_BOOST_RANGE_CANONICAL = BLOSSOM_BOOST_RANGE / SOIL_UNITS_PER_CANONICAL;

/** Exposure a nearby blossom adds to a leaf cluster. */
export const BLOSSOM_BOOST = 0.25;

/**
 * How many blossoms one leaf may be paid for.
 *
 * Uncapped, a ring of blossoms around a single leaf would beat any amount of
 * canopy spreading, which is the exact lesson this step exists to teach. Two is
 * enough to make placing a blossom deliberate and not enough to make it a
 * strategy on its own.
 */
export const BLOSSOM_BOOST_MAX_STACKS = 2;

/**
 * What the canopy earns at night, as a fraction of its daytime rate.
 *
 * The tree does not stop, it idles: a moonlight trickle keeps the HUD alive
 * through the dark quarter of the day and keeps an overnight tab from reading as
 * a broken game.
 */
export const MOONLIGHT_FRACTION = 0.1;

/**
 * How often leaf exposure is recomputed, in simulation seconds.
 *
 * Shading is O(n²) over the canopy, and it only changes when the tree does —
 * once a second is far more often than it needs to be and cheap enough to not
 * think about. Growing or pruning recomputes immediately regardless, so a
 * purchase never has to wait for the next sweep.
 */
export const EXPOSURE_INTERVAL_SECONDS = 1;

/** Seconds of current Sap income the dawn Dew burst is worth. */
export const DEW_SECONDS = 60;

/**
 * Floor on the Dew burst, in taps' worth of Sap.
 *
 * The design prices Dew at 60 seconds of Sap income — but nothing produces Sap
 * passively yet (clicks are the only source until later steps), so that formula
 * pays exactly zero for the whole of the current game. The floor keeps the dawn
 * bonus a real event; once passive Sap exists it will be the smaller of the two
 * and stop mattering.
 */
export const DEW_MIN_TAPS = 30;
