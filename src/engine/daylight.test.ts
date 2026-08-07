import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_SECONDS, DAY_START_FRACTION, SUNLIT_FRACTION } from '../content/daylight';
import { dayCycle, dayFraction, daylightAt, phaseAt } from './daylight';

describe('dayFraction', () => {
  it('starts a fresh tree in the morning, not in the dark', () => {
    expect(dayFraction(0)).toBeCloseTo(DAY_START_FRACTION);
    expect(phaseAt(dayFraction(0))).toBe('day');
    expect(daylightAt(dayFraction(0))).toBeGreaterThan(0.8);
  });

  it('wraps at the end of the day', () => {
    expect(dayFraction(DAY_LENGTH_SECONDS)).toBeCloseTo(DAY_START_FRACTION);
    expect(dayFraction(DAY_LENGTH_SECONDS * 2.25)).toBeCloseTo((DAY_START_FRACTION + 0.25) % 1);
  });

  it('never reports a negative fraction', () => {
    expect(dayFraction(-1)).toBeGreaterThanOrEqual(0);
    expect(dayFraction(-1)).toBeLessThan(1);
  });
});

describe('phaseAt', () => {
  it('walks dawn → day → dusk → night', () => {
    expect(phaseAt(0)).toBe('dawn');
    expect(phaseAt(0.3)).toBe('day');
    expect(phaseAt(0.55)).toBe('dusk');
    expect(phaseAt(0.9)).toBe('night');
  });

  it('puts a boundary in the later phase', () => {
    expect(phaseAt(0.12)).toBe('day');
    expect(phaseAt(0.5)).toBe('dusk');
  });
});

describe('daylightAt', () => {
  it('is dark at first light and at nightfall', () => {
    expect(daylightAt(0)).toBeCloseTo(0);
    expect(daylightAt(SUNLIT_FRACTION)).toBe(0);
  });

  it('peaks halfway through the sunlit window', () => {
    expect(daylightAt(SUNLIT_FRACTION / 2)).toBeCloseTo(1);
  });

  it('stays dark all night', () => {
    expect(daylightAt(0.7)).toBe(0);
    expect(daylightAt(0.99)).toBe(0);
  });

  it('rises and falls without a step', () => {
    const morning = [0.05, 0.1, 0.2, 0.3].map(daylightAt);
    for (let i = 1; i < morning.length; i += 1) {
      expect(morning[i]).toBeGreaterThan(morning[i - 1]);
    }
    expect(daylightAt(0.55)).toBeLessThan(daylightAt(0.45));
    for (const value of [0, 0.25, 0.5, 0.75, 0.99]) {
      expect(daylightAt(value)).toBeGreaterThanOrEqual(0);
      expect(daylightAt(value)).toBeLessThanOrEqual(1);
    }
  });
});

describe('dayCycle', () => {
  it('counts whole days elapsed', () => {
    expect(dayCycle(0).dayNumber).toBe(0);
    expect(dayCycle(DAY_LENGTH_SECONDS * 3.5).dayNumber).toBe(3);
  });

  it('rolls the day number over exactly when the sky wraps', () => {
    // The first day is short by the starting offset.
    const firstWrap = DAY_LENGTH_SECONDS * (1 - DAY_START_FRACTION);
    expect(dayCycle(firstWrap - 1).dayNumber).toBe(0);
    expect(dayCycle(firstWrap + 1).dayNumber).toBe(1);
  });

  it('agrees with its own parts', () => {
    const elapsed = DAY_LENGTH_SECONDS * 1.4;
    const cycle = dayCycle(elapsed);
    expect(cycle.t).toBeCloseTo(dayFraction(elapsed));
    expect(cycle.phase).toBe(phaseAt(cycle.t));
    expect(cycle.daylight).toBeCloseTo(daylightAt(cycle.t));
  });
});
