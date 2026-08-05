import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { formatNumber } from './format';

describe('formatNumber', () => {
  // Ten canonical cases spanning plain / K,M,B,T / scientific with ≤2 decimals.
  const cases: ReadonlyArray<readonly [number, string]> = [
    [0, '0'],
    [42, '42'],
    [999, '999'],
    [1000, '1K'],
    [1500, '1.5K'],
    [1_234_567, '1.23M'],
    [1_000_000_000, '1B'],
    [1_000_000_000_000, '1T'],
    [1e15, '1e15'],
    [1.23e18, '1.23e18'],
  ];

  it.each(cases)('formats %d as %s', (input, expected) => {
    expect(formatNumber(new Decimal(input))).toBe(expected);
  });

  it('shows fractions below 1000 with at most 2 decimals', () => {
    expect(formatNumber(new Decimal(3.14159))).toBe('3.14');
    expect(formatNumber(new Decimal(999.99))).toBe('999.99');
  });

  it('keeps at most 2 decimals in suffixed tiers', () => {
    expect(formatNumber(new Decimal(12_340_000_000))).toBe('12.34B');
  });

  it('formats negatives with a leading minus sign', () => {
    expect(formatNumber(new Decimal(-1500))).toBe('-1.5K');
    expect(formatNumber(new Decimal(-42))).toBe('-42');
  });
});
