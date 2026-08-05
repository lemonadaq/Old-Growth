import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_SECONDS, START_PHASE, dayPeriod, dayPhase, daylight } from './timeOfDay';

describe('timeOfDay', () => {
  it('starts mid-morning so a fresh game opens in daylight', () => {
    expect(dayPhase(0)).toBeCloseTo(START_PHASE);
    expect(dayPeriod(dayPhase(0))).toBe('day');
  });

  it('wraps after a full day and stays within [0, 1)', () => {
    expect(dayPhase(DAY_LENGTH_SECONDS)).toBeCloseTo(START_PHASE);
    for (const seconds of [0, 37, 1000, 12345.6]) {
      const phase = dayPhase(seconds);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });

  it('advances by a quarter day in a quarter of the cycle', () => {
    const quarter = dayPhase(DAY_LENGTH_SECONDS / 4);
    expect(quarter).toBeCloseTo((START_PHASE + 0.25) % 1);
  });

  it('names the coarse periods around the cycle', () => {
    expect(dayPeriod(0)).toBe('night');
    expect(dayPeriod(0.25)).toBe('dawn');
    expect(dayPeriod(0.5)).toBe('day');
    expect(dayPeriod(0.78)).toBe('dusk');
    expect(dayPeriod(0.95)).toBe('night');
    // Out-of-range phases normalise rather than throwing.
    expect(dayPeriod(1.5)).toBe('day');
    expect(dayPeriod(-0.5)).toBe('day');
  });

  it('peaks daylight at noon and floors it at night', () => {
    expect(daylight(0.5)).toBeCloseTo(1);
    expect(daylight(0)).toBe(0);
    expect(daylight(0.25)).toBeLessThan(daylight(0.4));
    expect(daylight(0.4)).toBeLessThan(daylight(0.5));
    expect(daylight(0.75)).toBeLessThan(daylight(0.6));
  });
});
