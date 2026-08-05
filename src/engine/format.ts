import Decimal from 'break_infinity.js';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/**
 * Format a resource amount for display. Small values show plainly; large values
 * are abbreviated with letter suffixes, and anything beyond the suffix table
 * falls back to `break_infinity`'s exponential formatting.
 */
export function formatNumber(value: Decimal, decimals = 1): string {
  if (value.lt(0)) {
    return `-${formatNumber(value.neg(), decimals)}`;
  }
  if (value.lt(1000)) {
    // Show integers cleanly, fractions with limited precision.
    const n = value.toNumber();
    return Number.isInteger(n) ? n.toString() : n.toFixed(decimals);
  }

  const exponent = Math.floor(value.log10());
  const tier = Math.floor(exponent / 3);

  if (tier < SUFFIXES.length) {
    const scaled = value.div(Decimal.pow(1000, tier));
    return `${scaled.toNumber().toFixed(decimals)}${SUFFIXES[tier]}`;
  }

  // Beyond our suffix table: use scientific-ish notation.
  return value.toExponential(decimals);
}
