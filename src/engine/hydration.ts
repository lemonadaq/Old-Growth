import Decimal from 'break_infinity.js';
import { HYDRATION_MAX, HYDRATION_MIN, WATER_NEED_PER_LEAF } from '../content/hydration';
import { CLICK_STAT_TAG } from './clicker';
import type { Modifier } from './modifiers';

/**
 * Hydration: what the roots owe the canopy.
 *
 * Every leaf cluster wants a share of the Water the roots draw up. The supply
 * divided by the demand, clamped, becomes a plain multiplier on canopy output —
 * both the Light the leaves make and the Sap a tap is worth — and it is applied
 * through the ordinary {@link Modifier} system so it stacks with everything else
 * in the normal `(base + Σadds) × Πmuls` order.
 *
 * Water production itself is never touched by hydration (roots are tagged
 * `'root'`, not `'canopy'`), and {@link Simulation} recomputes the value with the
 * hydration modifiers *removed*, so there is no path by which hydration can feed
 * back into its own input.
 */

/** Source id every hydration modifier is granted under, so they revoke cleanly. */
export const HYDRATION_SOURCE = 'hydration';

export interface HydrationState {
  /** Water per second the roots are drawing up. */
  readonly income: Decimal;
  /** Water per second the canopy wants. */
  readonly need: Decimal;
  /** Leaf clusters the need was computed from. */
  readonly leaves: number;
  /** Raw supply ÷ demand, before clamping. `1` when there is nothing to water. */
  readonly ratio: number;
  /** The multiplier actually applied to canopy output. */
  readonly value: number;
}

/**
 * Water per second a canopy of `leaves` clusters wants.
 *
 * Proportional, with no floor: a tree with no leaves needs no water, so a fresh
 * sapling is not throttled before it has anything to throttle.
 */
export function waterNeed(leaves: number): Decimal {
  return new Decimal(Math.max(0, leaves) * WATER_NEED_PER_LEAF);
}

/**
 * Work out the hydration multiplier from what the roots supply and how many
 * leaves are drinking:
 *
 * ```
 * hydration = clamp(waterIncome / waterNeed, 0.25, 1.5)
 * ```
 *
 * A canopy with no roots under it still limps along at the floor rather than
 * stopping dead, and surplus Water stops paying at the ceiling so roots cannot
 * be farmed indefinitely in place of a canopy.
 */
export function computeHydration(income: Decimal, leaves: number): HydrationState {
  const need = waterNeed(leaves);

  // Nothing is drinking, so nothing can be thirsty.
  if (need.lte(0)) {
    return { income, need, leaves, ratio: 1, value: 1 };
  }

  const ratio = income.div(need).toNumber();
  const value = Math.min(HYDRATION_MAX, Math.max(HYDRATION_MIN, ratio));
  return { income, need, leaves, ratio, value };
}

/**
 * The modifiers that carry a hydration value into the economy: one on canopy
 * producers (Light), one on click power (Sap per tap). Both are granted under
 * {@link HYDRATION_SOURCE} so recomputing is a remove-then-add.
 */
export function hydrationModifiers(value: number): Modifier[] {
  return [
    {
      id: 'hydration:canopy',
      source: HYDRATION_SOURCE,
      type: 'mul',
      targetKind: 'tag',
      target: 'canopy',
      value,
    },
    {
      id: 'hydration:click',
      source: HYDRATION_SOURCE,
      type: 'mul',
      targetKind: 'tag',
      target: CLICK_STAT_TAG.clickPower,
      value,
    },
  ];
}
