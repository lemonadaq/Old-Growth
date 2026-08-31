import { EPSILON } from '../content/units';
import Decimal from 'break_infinity.js';

/** How many powers of ten one suffix tier spans. */
const DIGITS_PER_TIER = 3;

/** The magnitude one tier is worth: 1e3, so K is 1e3 and T is 1e12. */
const TIER_STEP = 10 ** DIGITS_PER_TIER;

/** Suffixes for the K/M/B/T tiers (1e3, 1e6, 1e9, 1e12). */
const SUFFIXES = ['', 'K', 'M', 'B', 'T'] as const;

/** Values at or above this magnitude switch to scientific notation. */
const SCIENTIFIC_THRESHOLD = 1e15;

/** Format a JS number to at most 2 decimals with trailing zeros trimmed. */
function trim(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

/**
 * Format a resource amount for display:
 *
 * - plain up to 999 (fractions shown to at most 2 decimals),
 * - `K` / `M` / `B` / `T` suffixes through the thousands tiers,
 * - scientific notation from `1e15` upward,
 *
 * with a maximum of 2 decimal places throughout.
 */
export function formatNumber(value: Decimal): string {
  if (value.lt(0)) {
    return `-${formatNumber(value.neg())}`;
  }
  if (value.lt(TIER_STEP)) {
    return trim(value.toNumber());
  }

  if (value.gte(SCIENTIFIC_THRESHOLD)) {
    const exponent = Math.floor(value.log10() + EPSILON);
    const mantissa = value.div(Decimal.pow(10, exponent)).toNumber();
    return `${trim(mantissa)}e${exponent}`;
  }

  // K/M/B/T tiers: tier 1..4 for 1e3..1e12.
  const tier = Math.floor(Math.floor(value.log10() + EPSILON) / DIGITS_PER_TIER);
  const scaled = value.div(Decimal.pow(TIER_STEP, tier)).toNumber();
  return `${trim(scaled)}${SUFFIXES[tier]}`;
}
