/**
 * The link between the two halves of the tree, as data.
 *
 * The canopy cannot photosynthesise on air: every leaf cluster wants a share of
 * the Water the roots draw up. The ratio of what the roots supply to what the
 * canopy wants becomes a multiplier on all canopy output — Light *and* the Sap
 * a tap is worth — so a player who only ever grows leaves watches them wither
 * to a quarter rate, and a player with roots to spare overcharges them.
 */

/**
 * The three numbers behind the link, tuned in `./balance`:
 *
 * - `WATER_NEED_PER_LEAF` — Water per second one leaf cluster wants to run at
 *   full rate.
 * - `HYDRATION_MIN` — floor on the multiplier: a parched canopy still limps
 *   along rather than switching off.
 * - `HYDRATION_MAX` — ceiling: surplus Water stops paying past here, so roots
 *   are worth building and not worth hoarding.
 */
export { WATER_NEED_PER_LEAF, HYDRATION_MIN, HYDRATION_MAX } from './balance';
