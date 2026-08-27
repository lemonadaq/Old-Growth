import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { SEASON_BY_ID } from '../content/seasons';
import {
  CANOPY_OFFLINE_RATE,
  CANOPY_TAG,
  OFFLINE_CHUNK_SECONDS,
  OFFLINE_MIN_SECONDS,
} from '../content/offline';
import {
  formatDuration,
  gainBetween,
  offlineModifiers,
  offlineNotes,
  offlineSteps,
  planOffline,
  OFFLINE_SOURCE,
} from './offline';

const HOUR = 3600;

describe('planOffline', () => {
  it('ignores an absence too short to be worth a word', () => {
    const plan = planOffline(OFFLINE_MIN_SECONDS - 1, 12);
    expect(plan.worthRunning).toBe(false);
  });

  it('runs at exactly the threshold', () => {
    expect(planOffline(OFFLINE_MIN_SECONDS, 12).worthRunning).toBe(true);
  });

  it('simulates the whole absence when it fits under the cap', () => {
    const plan = planOffline(2 * HOUR, 12);
    expect(plan.simulatedSeconds).toBe(2 * HOUR);
    expect(plan.capped).toBe(false);
    expect(plan.forfeitedSeconds).toBe(0);
  });

  it('caps a long absence and says how much it threw away', () => {
    const plan = planOffline(20 * HOUR, 12);
    expect(plan.simulatedSeconds).toBe(12 * HOUR);
    expect(plan.capped).toBe(true);
    expect(plan.forfeitedSeconds).toBe(8 * HOUR);
  });

  it('is not capped at exactly the cap', () => {
    const plan = planOffline(12 * HOUR, 12);
    expect(plan.capped).toBe(false);
    expect(plan.simulatedSeconds).toBe(12 * HOUR);
  });

  it('treats a clock that went backwards as no time at all', () => {
    // A timezone change, an NTP correction, a save carried between machines.
    const plan = planOffline(-5000, 12);
    expect(plan.elapsedSeconds).toBe(0);
    expect(plan.simulatedSeconds).toBe(0);
    expect(plan.worthRunning).toBe(false);
  });

  it('refuses a nonsense elapsed rather than inventing time for it', () => {
    // A corrupt timestamp is not an absence. Paying out the cap for one would
    // turn a broken clock into a reward, so both of these simulate nothing.
    expect(planOffline(Number.NaN, 12).worthRunning).toBe(false);
    expect(planOffline(Number.POSITIVE_INFINITY, 12).worthRunning).toBe(false);
    expect(planOffline(Number.POSITIVE_INFINITY, 12).simulatedSeconds).toBe(0);
  });

  it('runs nothing at all on a zero cap', () => {
    const plan = planOffline(5 * HOUR, 0);
    expect(plan.worthRunning).toBe(false);
    expect(plan.forfeitedSeconds).toBe(5 * HOUR);
  });
});

describe('offlineSteps', () => {
  it('splits a span into whole chunks', () => {
    const steps = offlineSteps(5 * OFFLINE_CHUNK_SECONDS);
    expect(steps).toHaveLength(5);
    expect(steps.every((s) => s === OFFLINE_CHUNK_SECONDS)).toBe(true);
  });

  it('keeps the remainder as a final short step', () => {
    const steps = offlineSteps(OFFLINE_CHUNK_SECONDS * 2 + 17);
    expect(steps).toHaveLength(3);
    expect(steps[2]).toBeCloseTo(17, 9);
  });

  it('sums to exactly what it was given', () => {
    const total = 7 * HOUR + 13;
    const sum = offlineSteps(total).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(total, 6);
  });

  it('runs a 12h catch-up in a number of steps a load can afford', () => {
    expect(offlineSteps(12 * HOUR)).toHaveLength(720);
  });

  it('has nothing to do for zero or negative time', () => {
    expect(offlineSteps(0)).toEqual([]);
    expect(offlineSteps(-60)).toEqual([]);
  });
});

describe('offlineModifiers', () => {
  it('quarters the canopy and nothing else', () => {
    const [modifier] = offlineModifiers();
    expect(modifier.target).toBe(CANOPY_TAG);
    expect(modifier.targetKind).toBe('tag');
    expect(modifier.type).toBe('mul');
    expect(modifier.value).toBe(CANOPY_OFFLINE_RATE);
  });

  it('is revocable as one source', () => {
    expect(offlineModifiers().every((m) => m.source === OFFLINE_SOURCE)).toBe(true);
  });

  it('never publishes a negative rate', () => {
    expect(offlineModifiers(-2)[0].value).toBe(0);
  });
});

describe('gainBetween', () => {
  it('reports what was earned', () => {
    expect(gainBetween(new Decimal(10), new Decimal(25)).toNumber()).toBe(15);
  });

  it('floors a loss at zero — being away can never cost anything', () => {
    expect(gainBetween(new Decimal(40), new Decimal(10)).toNumber()).toBe(0);
  });

  it('is zero for no change', () => {
    expect(gainBetween(new Decimal(7), new Decimal(7)).toNumber()).toBe(0);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [45, '45s'],
    [90, '1m'],
    [59 * 60, '59m'],
    [HOUR, '1h'],
    [2 * HOUR + 20 * 60, '2h 20m'],
    [20 * HOUR, '20h'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('offlineNotes', () => {
  const quiet = {
    rings: 0,
    seasonBefore: 'summer' as const,
    seasonAfter: SEASON_BY_ID.summer,
    fragments: 0,
    nuts: 0,
    litter: 0,
  };

  it('says nothing when nothing happened', () => {
    expect(offlineNotes(quiet)).toEqual([]);
  });

  it('reports a winter that closed', () => {
    const notes = offlineNotes({ ...quiet, rings: 1 });
    expect(notes[0]).toMatch(/1 new ring\./);
  });

  it('pluralises like a person', () => {
    expect(offlineNotes({ ...quiet, rings: 3 })[0]).toMatch(/3 new rings\./);
    expect(offlineNotes({ ...quiet, nuts: 1 })[0]).toMatch(/1 nut,/);
    expect(offlineNotes({ ...quiet, nuts: 2 })[0]).toMatch(/2 nuts,/);
  });

  it('names the season only when it actually turned', () => {
    expect(offlineNotes(quiet).some((n) => n.includes('season turned'))).toBe(false);
    const turned = offlineNotes({ ...quiet, seasonAfter: SEASON_BY_ID.winter });
    expect(turned.some((n) => n.includes('It is Winter now.'))).toBe(true);
  });

  it('reports the songbird, the squirrel and the litter', () => {
    const notes = offlineNotes({ ...quiet, fragments: 4, nuts: 2, litter: 3 });
    expect(notes.join(' ')).toMatch(/4 Seed Fragments/);
    expect(notes.join(' ')).toMatch(/2 nuts/);
    expect(notes.join(' ')).toMatch(/3 piles of leaf litter/);
  });
});
