import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import {
  RING_PRODUCTION_BONUS,
  SEASONS_PER_YEAR,
  SEASON_LENGTH_DAYS,
  SEASON_LENGTH_SECONDS,
  SPRING_GROWTH_DISCOUNT,
  SUMMER_LIGHT_BONUS,
  WINTER_PENALTY,
  YEAR_LENGTH_SECONDS,
} from '../content/balance';
import { DAY_LENGTH_SECONDS } from '../content/daylight';
import { GROWTH_COST_TAG } from '../content/prune';
import { RESOURCE_IDS } from '../content/resources';
import { SEASONS, SEASON_BY_ID, type SeasonId } from '../content/seasons';
import { applyModifiers, ModifierSet } from './modifiers';
import {
  absoluteSeasonIndex,
  ringModifiers,
  ringMultiplier,
  ringsEarnedBetween,
  seasonAt,
  seasonDefAt,
  seasonModifiers,
  RING_SOURCE,
  SEASON_SOURCE,
} from './seasons';

/** A short season, so a test can run whole years without a stopwatch. */
const FAST = 40;

describe('the season catalogue', () => {
  it('is the four seasons, in turning order, starting in Spring', () => {
    expect(SEASONS.map((s) => s.id)).toEqual(['spring', 'summer', 'autumn', 'winter']);
    expect(SEASONS).toHaveLength(SEASONS_PER_YEAR);
  });

  it('sheds litter in exactly one season and lays a ring in exactly one', () => {
    expect(SEASONS.filter((s) => s.shedsLitter).map((s) => s.id)).toEqual(['autumn']);
    expect(SEASONS.filter((s) => s.earnsRing).map((s) => s.id)).toEqual(['winter']);
  });

  it('runs 20 engine days a season, and four of those to the year', () => {
    expect(SEASON_LENGTH_DAYS).toBe(20);
    expect(SEASON_LENGTH_SECONDS).toBe(SEASON_LENGTH_DAYS * DAY_LENGTH_SECONDS);
    expect(YEAR_LENGTH_SECONDS).toBe(SEASON_LENGTH_SECONDS * SEASONS_PER_YEAR);
  });

  it('gives every season a colour cast to be recognised by', () => {
    for (const season of SEASONS) {
      expect(season.tint.leaf).toMatch(/^#[0-9a-f]{6}$/i);
      expect(season.tint.leafStrength).toBeGreaterThan(0);
      expect(season.tint.leafStrength).toBeLessThanOrEqual(1);
    }
  });
});

describe('seasonAt', () => {
  it('opens a new save in Spring, on day one', () => {
    const spring = seasonAt(0);
    expect(spring.id).toBe('spring');
    expect(spring.index).toBe(0);
    expect(spring.day).toBe(1);
    expect(spring.year).toBe(0);
    expect(spring.t).toBe(0);
  });

  it('turns the wheel one season at a time', () => {
    const ids: SeasonId[] = [];
    for (let index = 0; index < 4; index += 1) {
      ids.push(seasonAt(index * FAST + 1, FAST).id);
    }
    expect(ids).toEqual(['spring', 'summer', 'autumn', 'winter']);
  });

  it('wraps into the next year without a seam', () => {
    const lastWinter = seasonAt(4 * FAST - 0.001, FAST);
    const newSpring = seasonAt(4 * FAST, FAST);

    expect(lastWinter.id).toBe('winter');
    expect(lastWinter.year).toBe(0);
    expect(newSpring.id).toBe('spring');
    expect(newSpring.year).toBe(1);
    expect(newSpring.index).toBe(4);
  });

  it('counts days within the season, never past its end', () => {
    const days = seasonAt(0, FAST).days;
    expect(seasonAt(0, FAST).day).toBe(1);
    expect(seasonAt(FAST * 0.5, FAST).day).toBe(Math.floor(days / 2) + 1);
    // A hair short of the boundary is still the last day of this season.
    expect(seasonAt(FAST - 1e-9, FAST).day).toBe(days);
  });

  it('counts down the seconds left of the season', () => {
    expect(seasonAt(0, FAST).secondsRemaining).toBeCloseTo(FAST, 9);
    expect(seasonAt(FAST * 0.25, FAST).secondsRemaining).toBeCloseTo(FAST * 0.75, 9);
  });

  it('treats a negative clock as the start of time rather than as a past year', () => {
    expect(seasonAt(-500, FAST).index).toBe(0);
    expect(absoluteSeasonIndex(-500, FAST)).toBe(0);
  });

  it('agrees with seasonDefAt', () => {
    expect(seasonDefAt(FAST * 2 + 5, FAST)).toBe(SEASON_BY_ID.autumn);
  });

  it('is a pure function of the clock — no state, no drift', () => {
    expect(seasonAt(12345, FAST)).toEqual(seasonAt(12345, FAST));
  });
});

describe('ringsEarnedBetween', () => {
  it('owes nothing for a season that has not turned', () => {
    expect(ringsEarnedBetween(0, 0)).toBe(0);
    expect(ringsEarnedBetween(3, 3)).toBe(0);
  });

  it('owes nothing for the three seasons that are not winter', () => {
    expect(ringsEarnedBetween(0, 3)).toBe(0);
  });

  it('pays exactly once the year has moved past a winter', () => {
    expect(ringsEarnedBetween(0, 4)).toBe(1);
    expect(ringsEarnedBetween(3, 4)).toBe(1);
  });

  it('pays one per winter over a long absence', () => {
    expect(ringsEarnedBetween(0, 12)).toBe(3);
    expect(ringsEarnedBetween(0, 41)).toBe(10);
  });

  it('never pays backwards', () => {
    expect(ringsEarnedBetween(8, 4)).toBe(0);
  });
});

describe('seasonModifiers', () => {
  it('discounts growth in Spring', () => {
    const set = new ModifierSet();
    for (const mod of seasonModifiers(SEASON_BY_ID.spring)) set.add(mod);

    const priced = applyModifiers(new Decimal(100), set.matchingTag(GROWTH_COST_TAG));
    expect(priced.toNumber()).toBeCloseTo(100 * (1 - SPRING_GROWTH_DISCOUNT), 9);
  });

  it('lifts Light in Summer and leaves prices alone', () => {
    const set = new ModifierSet();
    for (const mod of seasonModifiers(SEASON_BY_ID.summer)) set.add(mod);

    expect(applyModifiers(new Decimal(10), set.matching('light', [])).toNumber()).toBeCloseTo(
      10 * (1 + SUMMER_LIGHT_BONUS),
      9,
    );
    expect(set.matchingTag(GROWTH_COST_TAG)).toEqual([]);
  });

  it('grants nothing at all in Autumn — its mechanic is the litter', () => {
    expect(seasonModifiers(SEASON_BY_ID.autumn)).toEqual([]);
  });

  it('takes Light *and* makes growth dearer in Winter', () => {
    const set = new ModifierSet();
    for (const mod of seasonModifiers(SEASON_BY_ID.winter)) set.add(mod);

    expect(applyModifiers(new Decimal(10), set.matching('light', [])).toNumber()).toBeCloseTo(
      10 * (1 - WINTER_PENALTY),
      9,
    );
    expect(
      applyModifiers(new Decimal(100), set.matchingTag(GROWTH_COST_TAG)).toNumber(),
    ).toBeCloseTo(100 * (1 + WINTER_PENALTY), 9);
  });

  it('publishes everything under one revocable source', () => {
    const set = new ModifierSet();
    for (const mod of seasonModifiers(SEASON_BY_ID.winter)) set.add(mod);
    expect(set.all().every((m) => m.source === SEASON_SOURCE)).toBe(true);

    set.removeBySource(SEASON_SOURCE);
    expect(set.all()).toEqual([]);
  });
});

describe('rings', () => {
  it('are worth nothing before the first winter', () => {
    expect(ringMultiplier(0)).toBe(1);
    expect(ringModifiers(0)).toEqual([]);
  });

  it('compound at 1.05 apiece', () => {
    expect(ringMultiplier(1)).toBeCloseTo(1 + RING_PRODUCTION_BONUS, 9);
    expect(ringMultiplier(3)).toBeCloseTo(Math.pow(1 + RING_PRODUCTION_BONUS, 3), 9);
  });

  it('reach every resource, so nothing can opt out of a winter survived', () => {
    const mods = ringModifiers(2);
    expect(mods).toHaveLength(RESOURCE_IDS.length);
    expect(new Set(mods.map((m) => m.target))).toEqual(new Set(RESOURCE_IDS));
    expect(mods.every((m) => m.targetKind === 'resource' && m.type === 'mul')).toBe(true);
  });

  it('multiply production through the ordinary pipeline', () => {
    const set = new ModifierSet();
    for (const mod of ringModifiers(2)) set.add(mod);

    const rate = applyModifiers(new Decimal(10), set.matching('water', ['root']));
    expect(rate.toNumber()).toBeCloseTo(10 * ringMultiplier(2), 9);
  });

  it('are revocable as one group, so a republish never doubles them', () => {
    const set = new ModifierSet();
    for (const mod of ringModifiers(1)) set.add(mod);
    set.removeBySource(RING_SOURCE);
    for (const mod of ringModifiers(2)) set.add(mod);

    expect(applyModifiers(new Decimal(1), set.matching('light', [])).toNumber()).toBeCloseTo(
      ringMultiplier(2),
      9,
    );
  });

  it('ignore a nonsense count rather than inventing a bonus', () => {
    expect(ringMultiplier(-4)).toBe(1);
    expect(ringMultiplier(2.7)).toBeCloseTo(ringMultiplier(2), 9);
  });
});
