import Decimal from 'break_infinity.js';
import { comboMultiplier } from './combo';
import { applyModifiers, scopedTag, type ModifierSet } from './modifiers';

/**
 * Active play: what one tap on the tree is worth.
 *
 * The four click stats are ordinary engine stats driven by {@link Modifier}s —
 * upgrades, symbionts, and seasons all move them by adding tag-targeted
 * modifiers under {@link CLICK_STAT_TAG}. Resolution and the payout roll are
 * pure functions so the maths is testable without a running simulation.
 */

/** Modifier tags that drive each click stat. */
export const CLICK_STAT_TAG = {
  clickPower: 'click.power',
  critChance: 'click.critChance',
  critMult: 'click.critMult',
  comboCap: 'combo.cap',
} as const;

/** Unmodified starting values for the click stats. */
export const BASE_CLICK_STATS = {
  /** Sap per tap. */
  clickPower: 1,
  /** Probability of a critical tap, in `[0, 1]`. */
  critChance: 0.02,
  /** Payout multiplier on a critical tap. */
  critMult: 10,
  /** Combo stacks the meter can hold. */
  comboCap: 50,
} as const;

/** Pointer distance (CSS px) within which a tap still counts as hitting wood. */
export const CLICK_TOLERANCE_PX = 16;

export interface ClickStats {
  readonly clickPower: Decimal;
  readonly critChance: number;
  readonly critMult: number;
  readonly comboCap: number;
}

export interface ClickResult {
  /** Sap granted by this tap. */
  readonly gain: Decimal;
  readonly crit: boolean;
  /** Combo stacks *after* this tap. */
  readonly comboStacks: number;
  /** Click power multiplier the combo contributed. */
  readonly comboMultiplier: number;
  /** The stats the tap was resolved against. */
  readonly stats: ClickStats;
}

/**
 * Resolve the current click stats from the active modifiers, each stat reading
 * only its own tag with the standard `(base + Σadds) × Πmuls` stacking.
 *
 * `scopes` narrows the resolution to a particular piece of wood: a tap knows
 * which limb it landed on, so it also reads each stat scoped to that limb's
 * species (`species:cherry::click.critChance`). Passing none — as the HUD does —
 * resolves the tree-wide stats, which is what a readout should show.
 *
 * Crit chance is clamped to `[0, 1]`; the cap is at least one whole stack.
 */
export function resolveClickStats(
  modifiers: ModifierSet,
  scopes: readonly string[] = [],
): ClickStats {
  const stat = (tag: string, base: number): Decimal => {
    const mods = modifiers.matchingTag(tag);
    for (const scope of scopes) {
      mods.push(...modifiers.matchingTag(scopedTag(scope, tag)));
    }
    return applyModifiers(new Decimal(base), mods);
  };

  const clickPower = stat(CLICK_STAT_TAG.clickPower, BASE_CLICK_STATS.clickPower);
  const critChance = stat(CLICK_STAT_TAG.critChance, BASE_CLICK_STATS.critChance).toNumber();
  const critMult = stat(CLICK_STAT_TAG.critMult, BASE_CLICK_STATS.critMult).toNumber();
  const comboCap = stat(CLICK_STAT_TAG.comboCap, BASE_CLICK_STATS.comboCap).toNumber();

  return {
    clickPower: clickPower.lt(0) ? new Decimal(0) : clickPower,
    critChance: Math.min(1, Math.max(0, critChance)),
    critMult: Math.max(1, critMult),
    comboCap: Math.max(1, Math.floor(comboCap)),
  };
}

/**
 * Work out a tap's payout:
 *
 * ```
 * gain = clickPower × comboMultiplier × (crit ? critMult : 1)
 * ```
 *
 * `roll` is a value in `[0, 1)` from a {@link RandomSource}; the tap crits when
 * it lands below `critChance`. Combo and crit are independent multipliers, so a
 * critical tap during a full combo pays both.
 */
export function resolveClick(stats: ClickStats, comboStacks: number, roll: number): ClickResult {
  const multiplier = comboMultiplier(comboStacks, stats.comboCap);
  const crit = roll < stats.critChance;

  let gain = stats.clickPower.mul(multiplier);
  if (crit) {
    gain = gain.mul(stats.critMult);
  }

  return { gain, crit, comboStacks, comboMultiplier: multiplier, stats };
}
