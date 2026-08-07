/**
 * The link between the two halves of the tree, as data.
 *
 * The canopy cannot photosynthesise on air: every leaf cluster wants a share of
 * the Water the roots draw up. The ratio of what the roots supply to what the
 * canopy wants becomes a multiplier on all canopy output — Light *and* the Sap
 * a tap is worth — so a player who only ever grows leaves watches them wither
 * to a quarter rate, and a player with roots to spare overcharges them.
 */

/** Water per second one leaf cluster wants in order to run at full rate. */
export const WATER_NEED_PER_LEAF = 0.35;

/** Floor on the hydration multiplier: a parched canopy still limps along. */
export const HYDRATION_MIN = 0.25;

/** Ceiling on the hydration multiplier: surplus Water stops paying past here. */
export const HYDRATION_MAX = 1.5;
