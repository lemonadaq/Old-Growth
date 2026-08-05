import Decimal from 'break_infinity.js';

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
  if (value.lt(1000)) {
    return trim(value.toNumber());
  }

  if (value.gte(SCIENTIFIC_THRESHOLD)) {
    const exponent = Math.floor(value.log10() + 1e-9);
    const mantissa = value.div(Decimal.pow(10, exponent)).toNumber();
    return `${trim(mantissa)}e${exponent}`;
  }

  // K/M/B/T tiers: tier 1..4 for 1e3..1e12.
  const tier = Math.floor(Math.floor(value.log10() + 1e-9) / 3);
  const scaled = value.div(Decimal.pow(1000, tier)).toNumber();
  return `${trim(scaled)}${SUFFIXES[tier]}`;
}
