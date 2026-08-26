import { describe, expect, it } from 'vitest';
import Decimal from 'break_infinity.js';
import {
  DROUGHT_DURATION_SECONDS,
  DROUGHT_WATER_MULTIPLIER,
  RAIN_DURATION_SECONDS,
  RAIN_WATER_MULTIPLIER,
  STORM_BRACE_TAPS,
  STORM_DURATION_SECONDS,
  STORM_MAX_SNAPS,
  STORM_SNAP_CHANCE,
  STORM_WIDE_DEGREES,
  WEATHER_MAX_GAP_SECONDS,
  WEATHER_MIN_GAP_SECONDS,
  WEATHER_TELEGRAPH_SECONDS,
} from '../content/balance';
import { STRATA, stratumResourceTag } from '../content/soil';
import { DROUGHT_IMMUNE_STRATUM, WEATHERS, WEATHER_BY_ID } from '../content/weather';
import { applyModifiers, ModifierSet } from './modifiers';
import { createSeededRandom, type RandomSource } from './rng';
import { TreeGraph, type NodePlacement } from './treeGraph';
import {
  braceFraction,
  chooseSnappedLimbs,
  eligibleWeather,
  isWideLimb,
  limbDeviation,
  pickWeather,
  snapChance,
  weatherGap,
  weatherModifiers,
  wideLimbs,
  WeatherScheduler,
  WEATHER_SOURCE,
} from './weather';

const DEG = Math.PI / 180;

/** A source that hands back the same roll every time. */
const always =
  (value: number): RandomSource =>
  () =>
    value;

/** A placement pointing along `degrees` (measured the way the graph does). */
function heading(degrees: number): NodePlacement {
  return { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, direction: degrees * DEG };
}

describe('the weather catalogue', () => {
  it('is rain, storm and drought', () => {
    expect(WEATHERS.map((w) => w.id)).toEqual(['rain', 'storm', 'drought']);
  });

  it('marks the storm — and only the storm — as online-only', () => {
    expect(WEATHERS.filter((w) => w.onlineOnly).map((w) => w.id)).toEqual(['storm']);
  });

  it('runs each event for the length the design gives it', () => {
    expect(WEATHER_BY_ID.rain.durationSeconds).toBe(RAIN_DURATION_SECONDS);
    expect(WEATHER_BY_ID.storm.durationSeconds).toBe(STORM_DURATION_SECONDS);
    expect(WEATHER_BY_ID.drought.durationSeconds).toBe(DROUGHT_DURATION_SECONDS);
    expect(STORM_DURATION_SECONDS).toBe(15);
  });

  it('gives every event a line to announce itself with', () => {
    for (const def of WEATHERS) {
      expect(def.telegraph.length).toBeGreaterThan(0);
      expect(def.effectLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('weatherModifiers', () => {
  it('triples Water in the rain, for every root at once', () => {
    const set = new ModifierSet();
    for (const mod of weatherModifiers(WEATHER_BY_ID.rain)) set.add(mod);

    const rate = applyModifiers(new Decimal(2), set.matching('water', ['root']));
    expect(rate.toNumber()).toBeCloseTo(2 * RAIN_WATER_MULTIPLIER, 9);
  });

  it('dries out every layer of soil but the rock', () => {
    const targets = weatherModifiers(WEATHER_BY_ID.drought).map((m) => m.target);
    for (const stratum of STRATA) {
      const tag = stratumResourceTag(stratum.id, 'water');
      if (stratum.id === DROUGHT_IMMUNE_STRATUM) {
        expect(targets).not.toContain(tag);
      } else {
        expect(targets).toContain(tag);
      }
    }
  });

  it('leaves a root in the rock drawing at full rate through a drought', () => {
    const set = new ModifierSet();
    for (const mod of weatherModifiers(WEATHER_BY_ID.drought)) set.add(mod);

    const shallow = set.matching('water', ['root', stratumResourceTag('topsoil', 'water')]);
    const deep = set.matching('water', ['root', stratumResourceTag('rock', 'water')]);

    expect(applyModifiers(new Decimal(1), shallow).toNumber()).toBeCloseTo(
      DROUGHT_WATER_MULTIPLIER,
      9,
    );
    expect(applyModifiers(new Decimal(1), deep).toNumber()).toBeCloseTo(1, 9);
  });

  it('leaves Minerals alone: a drought takes water, not ore', () => {
    const set = new ModifierSet();
    for (const mod of weatherModifiers(WEATHER_BY_ID.drought)) set.add(mod);

    const tip = set.matching('minerals', [
      'root',
      'soil:clay',
      stratumResourceTag('clay', 'minerals'),
    ]);
    expect(applyModifiers(new Decimal(1), tip).toNumber()).toBeCloseTo(1, 9);
  });

  it('grants a storm no modifiers at all — its damage is to the tree', () => {
    expect(weatherModifiers(WEATHER_BY_ID.storm)).toEqual([]);
  });

  it('publishes under one revocable source', () => {
    const set = new ModifierSet();
    for (const mod of weatherModifiers(WEATHER_BY_ID.drought)) set.add(mod);
    expect(set.all().every((m) => m.source === WEATHER_SOURCE)).toBe(true);

    set.removeBySource(WEATHER_SOURCE);
    expect(set.all()).toEqual([]);
  });
});

describe('picking the next event', () => {
  it('drops the storm from the pool while the player is away', () => {
    expect(eligibleWeather(false).map((d) => d.id)).toEqual(['rain', 'drought']);
    expect(eligibleWeather(true)).toHaveLength(WEATHERS.length);
  });

  it('never draws a storm offline, however the dice fall', () => {
    for (let roll = 0; roll < 1; roll += 0.01) {
      expect(pickWeather(always(roll), false)).not.toBe('storm');
    }
  });

  it('draws by weight, in catalogue order', () => {
    // Weights are 5 / 2 / 3 out of 10.
    expect(pickWeather(always(0))).toBe('rain');
    expect(pickWeather(always(0.49))).toBe('rain');
    expect(pickWeather(always(0.51))).toBe('storm');
    expect(pickWeather(always(0.69))).toBe('storm');
    expect(pickWeather(always(0.71))).toBe('drought');
    expect(pickWeather(always(0.999))).toBe('drought');
  });

  it('draws all three over a run of rolls', () => {
    const random = createSeededRandom(7);
    const drawn = new Set<string>();
    for (let i = 0; i < 200; i += 1) drawn.add(pickWeather(random));
    expect(drawn).toEqual(new Set(['rain', 'storm', 'drought']));
  });

  it('keeps the gap between events inside its bounds', () => {
    const random = createSeededRandom(11);
    for (let i = 0; i < 200; i += 1) {
      const gap = weatherGap(random);
      expect(gap).toBeGreaterThanOrEqual(WEATHER_MIN_GAP_SECONDS);
      expect(gap).toBeLessThanOrEqual(WEATHER_MAX_GAP_SECONDS);
    }
  });
});

describe('WeatherScheduler', () => {
  it('opens on a fixed quiet spell, the same for everybody', () => {
    const scheduler = new WeatherScheduler();
    expect(scheduler.nextRollAt).toBe(WEATHER_MIN_GAP_SECONDS);
    expect(scheduler.update(WEATHER_MIN_GAP_SECONDS - 1, always(0))).toEqual([]);
    expect(scheduler.active).toBeNull();
    expect(scheduler.pending).toBeNull();
  });

  it('announces an event before it lands, and lands it a telegraph later', () => {
    const scheduler = new WeatherScheduler();
    const at = WEATHER_MIN_GAP_SECONDS;

    const announced = scheduler.update(at, always(0));
    expect(announced).toEqual([{ kind: 'telegraph', id: 'rain', at }]);
    expect(scheduler.pending).toEqual({ id: 'rain', startsAt: at + WEATHER_TELEGRAPH_SECONDS });
    expect(scheduler.active).toBeNull();

    // Still only announced a hair before it is due.
    expect(scheduler.update(at + WEATHER_TELEGRAPH_SECONDS - 0.1, always(0))).toEqual([]);

    const landed = scheduler.update(at + WEATHER_TELEGRAPH_SECONDS, always(0));
    expect(landed).toEqual([{ kind: 'start', id: 'rain', at: at + WEATHER_TELEGRAPH_SECONDS }]);
    expect(scheduler.active?.endsAt).toBeCloseTo(
      at + WEATHER_TELEGRAPH_SECONDS + RAIN_DURATION_SECONDS,
      9,
    );
  });

  it('lifts an event exactly when its time is up, and schedules the next', () => {
    const scheduler = new WeatherScheduler();
    const start = WEATHER_MIN_GAP_SECONDS + WEATHER_TELEGRAPH_SECONDS;
    scheduler.update(WEATHER_MIN_GAP_SECONDS, always(0));
    scheduler.update(start, always(0));

    const endsAt = start + RAIN_DURATION_SECONDS;
    expect(scheduler.update(endsAt - 0.1, always(0))).toEqual([]);

    const lifted = scheduler.update(endsAt, always(0));
    expect(lifted[0]).toEqual({ kind: 'end', id: 'rain', at: endsAt });
    expect(scheduler.active).toBeNull();
    expect(scheduler.nextRollAt).toBeGreaterThanOrEqual(endsAt + WEATHER_MIN_GAP_SECONDS);
  });

  it('drops an announced storm when the player leaves before it lands', () => {
    const scheduler = new WeatherScheduler();
    // 0.6 draws the storm.
    scheduler.update(WEATHER_MIN_GAP_SECONDS, always(0.6));
    expect(scheduler.pending?.id).toBe('storm');

    const landed = scheduler.update(
      WEATHER_MIN_GAP_SECONDS + WEATHER_TELEGRAPH_SECONDS,
      always(0),
      false,
    );
    expect(landed.some((event) => event.kind === 'start')).toBe(false);
    expect(scheduler.active).toBeNull();
  });

  it('never runs a storm across a long absence, however far it is jumped', () => {
    const scheduler = new WeatherScheduler();
    const seen: string[] = [];

    let now = 0;
    for (let i = 0; i < 40; i += 1) {
      now += 600;
      for (const event of scheduler.update(now, createSeededRandom(i + 1), false)) {
        seen.push(event.id);
      }
    }

    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain('storm');
  });

  it('replays a jump on the true timeline rather than bunching it on one tick', () => {
    const scheduler = new WeatherScheduler();
    const events = scheduler.update(WEATHER_MIN_GAP_SECONDS + 10_000, always(0));

    // The first event is stamped when it was *due*, not when it was noticed.
    expect(events[0]).toEqual({
      kind: 'telegraph',
      id: 'rain',
      at: WEATHER_MIN_GAP_SECONDS,
    });
    expect(events.filter((e) => e.kind === 'start').length).toBeGreaterThan(0);
    expect(events.every((event) => event.at <= WEATHER_MIN_GAP_SECONDS + 10_000)).toBe(true);
  });

  it('clears back to a quiet sky when a save is loaded', () => {
    const scheduler = new WeatherScheduler();
    scheduler.update(WEATHER_MIN_GAP_SECONDS, always(0));
    scheduler.clear();

    expect(scheduler.active).toBeNull();
    expect(scheduler.pending).toBeNull();
    expect(scheduler.nextRollAt).toBe(WEATHER_MIN_GAP_SECONDS);
  });
});

describe('what the wind can get under', () => {
  it('measures a limb by how far it leans off vertical', () => {
    expect(limbDeviation(Math.PI / 2)).toBeCloseTo(0, 9);
    expect(limbDeviation(0)).toBeCloseTo(Math.PI / 2, 9);
    expect(limbDeviation(Math.PI)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('spares the leader and takes an interest in a limb reaching sideways', () => {
    expect(isWideLimb({ type: 'branch' }, heading(90))).toBe(false);
    expect(isWideLimb({ type: 'branch' }, heading(90 - STORM_WIDE_DEGREES + 1))).toBe(false);
    expect(isWideLimb({ type: 'branch' }, heading(90 - STORM_WIDE_DEGREES - 1))).toBe(true);
    expect(isWideLimb({ type: 'branch' }, heading(20))).toBe(true);
  });

  it('ignores everything that is not structural wood', () => {
    for (const type of ['trunk', 'twig', 'leafCluster', 'blossom', 'rootSegment'] as const) {
      expect(isWideLimb({ type }, heading(10))).toBe(false);
    }
  });

  it('finds nothing to take on a bare seedling', () => {
    expect(wideLimbs(TreeGraph.seedling())).toEqual([]);
  });

  it('only ever names branches that really are leaning', () => {
    const tree = TreeGraph.seedling();
    for (let i = 0; i < 4; i += 1) tree.grow(tree.rootId, 'branch');

    const placements = tree.placements();
    const wide = wideLimbs(tree);
    expect(wide.length).toBeGreaterThan(0);
    for (const limb of wide) {
      expect(limb.type).toBe('branch');
      const placement = placements.get(limb.id);
      expect(limbDeviation(placement?.direction ?? 0)).toBeGreaterThan(STORM_WIDE_DEGREES * DEG);
    }
  });
});

describe('bracing', () => {
  it('fills over the taps the design asks for', () => {
    expect(braceFraction(0)).toBe(0);
    expect(braceFraction(STORM_BRACE_TAPS / 2)).toBeCloseTo(0.5, 9);
    expect(braceFraction(STORM_BRACE_TAPS)).toBe(1);
  });

  it('cannot be over-filled or negatively filled', () => {
    expect(braceFraction(STORM_BRACE_TAPS * 4)).toBe(1);
    expect(braceFraction(-9)).toBe(0);
  });

  it('takes the snap chance to zero at a full brace', () => {
    expect(snapChance(0)).toBeCloseTo(STORM_SNAP_CHANCE, 9);
    expect(snapChance(0.5)).toBeCloseTo(STORM_SNAP_CHANCE / 2, 9);
    expect(snapChance(1)).toBe(0);
  });
});

describe('chooseSnappedLimbs', () => {
  const limbs = Array.from({ length: 8 }, (_, i) => ({
    id: `branch-${i}`,
    type: 'branch' as const,
    parentId: 'trunk-0',
    childIds: [],
    speciesId: 'oak',
    level: 1,
    slot: i,
    angle: 0,
    attachT: 1,
    length: 0.3,
    thickness: 0.02,
    createdAtTick: 0,
  }));

  it('takes nothing from a tree that was fully braced', () => {
    expect(chooseSnappedLimbs(limbs, 1, always(0))).toEqual([]);
  });

  it('never takes more than two, however badly the rolls go', () => {
    expect(chooseSnappedLimbs(limbs, 0, always(0))).toHaveLength(STORM_MAX_SNAPS);
    expect(STORM_MAX_SNAPS).toBe(2);
  });

  it('takes nothing when every roll beats the chance', () => {
    expect(chooseSnappedLimbs(limbs, 0, always(0.99))).toEqual([]);
  });

  it('has nothing to take from a tree with no wide limbs', () => {
    expect(chooseSnappedLimbs([], 0, always(0))).toEqual([]);
  });

  it('rolls each limb separately, so a half-brace still costs less', () => {
    const random = createSeededRandom(3);
    let unbraced = 0;
    let halfBraced = 0;
    for (let i = 0; i < 400; i += 1) {
      unbraced += chooseSnappedLimbs(limbs, 0, random).length;
      halfBraced += chooseSnappedLimbs(limbs, 0.5, random).length;
    }
    expect(halfBraced).toBeLessThan(unbraced);
  });
});
