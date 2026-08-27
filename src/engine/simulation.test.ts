import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { Simulation } from './simulation';
import { createInitialState } from './types';
import { disableTestProducers, enableTestProducers } from './debugProducers';
import { COMBO_DECAY_MS, COMBO_FULL_STACKS } from './combo';
import { RESOURCE_IDS } from '../content/resources';
import {
  DROUGHT_WATER_MULTIPLIER,
  LITTER_INTERVAL_SECONDS,
  LITTER_PER_LEAF,
  RAIN_DURATION_SECONDS,
  RAIN_WATER_MULTIPLIER,
  RING_PRODUCTION_BONUS,
  SPRING_GROWTH_DISCOUNT,
  STORM_BRACE_TAPS,
  STORM_DURATION_SECONDS,
  STORM_MAX_SNAPS,
  SEASON_LENGTH_SECONDS,
  SUMMER_LIGHT_BONUS,
  WEATHER_MIN_GAP_SECONDS,
  WEATHER_TELEGRAPH_SECONDS,
  WINTER_PENALTY,
} from '../content/balance';
import { RAKE_ID } from '../content/upgrades';
import {
  CEREMONY_SECONDS,
  FOREST_PRODUCTION_BONUS,
  PRESTIGE_LIGHT_REQUIREMENT,
} from '../content/prestige';
import { applyModifiers } from './modifiers';
import { partCost } from './growth';
import { createSeededRandom, type RandomSource } from './rng';
import { HYDRATION_MAX, HYDRATION_MIN, WATER_NEED_PER_LEAF } from '../content/hydration';
import { OFFLINE_TAG } from '../content/growth';
import { DEW_MIN_TAPS, DEW_SECONDS, MOONLIGHT_FRACTION } from '../content/light';
import { DAY_LENGTH_SECONDS } from '../content/daylight';
import { dayCycle } from './daylight';
import type { Vec2 } from './geometry';
import { HYDRATION_SOURCE } from './hydration';
import { graftCost } from './graft';
import { partProducerId } from './growth';
import { STARTER_SPECIES_ID } from '../content/species';
import {
  SONGBIRD_INTERVAL_SECONDS,
  SYMBIONT_BY_ID,
  SYMBIONT_MAX_LEVEL,
} from '../content/symbionts';
import type { TreeNode } from './treeGraph';
import { DAYLIGHT_SOURCE, lightFactorAt } from './light';
import { BARREN_SOIL, depthAt, depthMultiplier } from './soil';

/**
 * What a list price actually costs a fresh save.
 *
 * A new tree sprouts into Spring, and Spring is a standing growth discount
 * (STEP 12) — so every price quoted in this file is the catalogue number through
 * the season the simulation opens in.
 */
const inSpring = (listPrice: number) => listPrice * (1 - SPRING_GROWTH_DISCOUNT);

/** Rolls that never / always crit. */
const NEVER_CRIT = () => 1;
const ALWAYS_CRIT = () => 0;

/**
 * The multiplier the time of day is currently putting on Light.
 *
 * Every Light expectation carries this factor: a leaf is worth what the sun
 * makes it worth, and the sun has been moving since STEP 8.
 */
const daylight = (sim: Simulation) => lightFactorAt(dayCycle(sim.state.elapsedSeconds).t);

/** Sap the dawn Dew pays a fresh save on its first tap (no passive Sap yet). */
const FIRST_DEW = DEW_MIN_TAPS;

describe('Simulation', () => {
  it('starts with all resources at zero', () => {
    const sim = new Simulation();
    const snap = sim.snapshot();
    for (const id of RESOURCE_IDS) {
      expect(snap.resources[id].toNumber()).toBe(0);
    }
    expect(snap.tick).toBe(0);
    expect(snap.elapsedSeconds).toBe(0);
  });

  it('advances tick count and elapsed time on each tick', () => {
    const sim = new Simulation();
    sim.tick(0.1);
    sim.tick(0.1);
    sim.tick(0.1);
    const snap = sim.snapshot();
    expect(snap.tick).toBe(3);
    expect(snap.elapsedSeconds).toBeCloseTo(0.3, 5);
  });

  it('produces snapshots that do not alias live engine Decimals', () => {
    const sim = new Simulation();
    const snap = sim.snapshot();
    // Mutating the snapshot value must not affect engine state.
    snap.resources.sap.add(999);
    expect(sim.state.resources.amount('sap').toNumber()).toBe(0);
  });

  it('accepts an injected initial state', () => {
    const state = createInitialState(0);
    state.resources.add('sap', new Decimal(42));
    const sim = new Simulation(state);
    expect(sim.snapshot().resources.sap.toNumber()).toBe(42);
  });

  it('produces resources from a registered producer and caches the rate', () => {
    const sim = new Simulation();
    sim.addProducer({ id: 'p', resource: 'sap', baseRate: 5, tags: [] });
    sim.tick(0.1); // 5/s for 0.1s = 0.5

    const snap = sim.snapshot();
    expect(snap.resources.sap.toNumber()).toBeCloseTo(0.5, 5);
    expect(snap.perSecond.sap.toNumber()).toBe(5);
    expect(snap.totals.sap.toNumber()).toBeCloseTo(0.5, 5);
  });

  it('stops producing once a producer is removed', () => {
    const sim = new Simulation();
    sim.addProducer({ id: 'p', resource: 'sap', baseRate: 5, tags: [] });
    sim.tick(1);
    sim.removeProducer('p');
    sim.tick(1);

    const snap = sim.snapshot();
    expect(snap.resources.sap.toNumber()).toBe(5); // only the first tick counted
    expect(snap.perSecond.sap.toNumber()).toBe(0);
  });

  it('ticks all seven resources when the debug producers are enabled', () => {
    const sim = new Simulation();
    enableTestProducers(sim);
    sim.tick(1);

    const snap = sim.snapshot();
    for (const id of RESOURCE_IDS) {
      expect(snap.resources[id].toNumber()).toBeGreaterThan(0);
      expect(snap.perSecond[id].toNumber()).toBeGreaterThan(0);
    }

    disableTestProducers(sim);
    sim.tick(1);
    for (const id of RESOURCE_IDS) {
      expect(sim.snapshot().perSecond[id].toNumber()).toBe(0);
    }
  });
});

describe('Simulation.click', () => {
  it('grants base click power, plus the stack the tap itself banks', () => {
    const sim = new Simulation();
    const result = sim.click(0, NEVER_CRIT);

    // A tap banks its stack before it pays out, so the on-screen meter and the
    // number that flies up always agree: 1 stack → ×1.02.
    expect(result.comboStacks).toBe(1);
    expect(result.gain.toNumber()).toBeCloseTo(1.02, 10);
    expect(result.crit).toBe(false);
    // The very first tap of a save is also a dawn, so it finds Dew on the tree.
    expect(result.dew?.toNumber()).toBeCloseTo(FIRST_DEW, 10);
    expect(sim.state.resources.amount('sap').toNumber()).toBeCloseTo(1.02 + FIRST_DEW, 10);
    expect(sim.state.clicks).toBe(1);
  });

  it('credits the lifetime Sap total as well as the balance', () => {
    const sim = new Simulation();
    sim.click(0, NEVER_CRIT);
    expect(sim.state.resources.total('sap').toNumber()).toBeCloseTo(1.02 + FIRST_DEW, 10);
  });

  it('pays ×10 on a critical tap', () => {
    const sim = new Simulation();
    const result = sim.click(0, ALWAYS_CRIT);
    expect(result.crit).toBe(true);
    expect(result.gain.toNumber()).toBeCloseTo(10.2, 10); // 1 × ×1.02 combo × ×10
  });

  it('builds the combo across taps and pays the bonus', () => {
    const sim = new Simulation();
    sim.click(0, NEVER_CRIT); // 1 stack → ×1.02
    const second = sim.click(100, NEVER_CRIT); // 2 stacks → ×1.04

    expect(second.comboStacks).toBe(2);
    expect(second.gain.toNumber()).toBeCloseTo(1.04, 10);
  });

  it('drops back to a single stack after 3s of idling', () => {
    const sim = new Simulation();
    for (let i = 0; i < 20; i += 1) sim.click(i * 100, NEVER_CRIT);
    expect(sim.state.combo.stacks).toBe(20);

    const afterIdle = sim.click(1900 + COMBO_DECAY_MS, NEVER_CRIT);
    expect(afterIdle.comboStacks).toBe(1);
    expect(afterIdle.gain.toNumber()).toBeCloseTo(1.02, 10);
  });

  it('does not run the combo down between ticks — only wall time matters', () => {
    const sim = new Simulation();
    sim.click(0, NEVER_CRIT);
    for (let i = 0; i < 100; i += 1) sim.tick(0.1);
    expect(sim.state.combo.stacks).toBe(1);
  });

  it('resolves outside the tick loop, so taps never wait on a frame', () => {
    const sim = new Simulation();
    sim.click(0, NEVER_CRIT);
    expect(sim.state.tick).toBe(0);
    expect(sim.state.resources.amount('sap').toNumber()).toBeGreaterThan(0);
  });

  it('reports the decaying combo in snapshots', () => {
    const sim = new Simulation();
    for (let i = 0; i < COMBO_FULL_STACKS; i += 1) sim.click(i * 100, NEVER_CRIT);
    const last = (COMBO_FULL_STACKS - 1) * 100;

    const peak = sim.snapshot(last);
    expect(peak.combo.stacks).toBe(COMBO_FULL_STACKS);
    expect(peak.combo.multiplier).toBeCloseTo(2, 10);
    expect(peak.combo.fill).toBe(1);

    const gone = sim.snapshot(last + COMBO_DECAY_MS);
    expect(gone.combo.stacks).toBe(0);
    expect(gone.combo.multiplier).toBe(1);
    expect(gone.combo.fill).toBe(0);
  });

  it('exposes the current click stats in snapshots', () => {
    const sim = new Simulation();
    const snap = sim.snapshot(0);
    expect(snap.clickStats.clickPower.toNumber()).toBe(1);
    expect(snap.clickStats.critChance).toBe(0.02);
    expect(snap.clickStats.critMult).toBe(10);
    expect(snap.clicks).toBe(0);
  });
});

describe('growing the tree', () => {
  /** Tap the trunk until there is enough Sap to buy anything in reach. */
  function withSap(sim: Simulation, amount: number): Simulation {
    sim.state.resources.add('sap', new Decimal(amount));
    return sim;
  }

  it('starts as a lone seedling with nothing producing', () => {
    const sim = new Simulation();
    expect(sim.state.tree.size).toBe(1);
    expect(sim.snapshot(0).treeSize).toBe(1);
    expect(sim.state.producers.size).toBe(0);
  });

  it('offers the trunk’s options priced against the player’s Sap', () => {
    const sim = withSap(new Simulation(), 20);
    const options = sim.growthOptions(sim.state.tree.rootId);

    const branch = options.find((o) => o.option.type === 'branch');
    const root = options.find((o) => o.option.type === 'rootSegment');
    expect(branch?.affordable).toBe(true); // 15 Sap
    expect(root?.affordable).toBe(true); // 12 Sap
    expect(options.every((o) => o.costResource === 'sap')).toBe(true);
  });

  it('spends the Sap and adds the part', () => {
    const sim = withSap(new Simulation(), 100);
    const before = sim.state.resources.amount('sap').toNumber();

    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    expect(branch).not.toBeNull();
    expect(sim.state.tree.size).toBe(2);
    expect(sim.state.resources.amount('sap').toNumber()).toBeCloseTo(before - inSpring(15), 9);
  });

  it('refuses a purchase there is not enough Sap for, and spends nothing', () => {
    const sim = withSap(new Simulation(), 5);
    expect(sim.growPart(sim.state.tree.rootId, 'branch')).toBeNull();
    expect(sim.state.tree.size).toBe(1);
    expect(sim.state.resources.amount('sap').toNumber()).toBe(5);
  });

  it('refuses a part the growth rules forbid there, and spends nothing', () => {
    const sim = withSap(new Simulation(), 1000);
    expect(sim.growPart(sim.state.tree.rootId, 'leafCluster')).toBeNull();
    expect(sim.state.resources.amount('sap').toNumber()).toBe(1000);
  });

  it('charges ×1.15 more for each further part of the same type', () => {
    const sim = withSap(new Simulation(), 1000);
    const first = sim.state.resources.amount('sap').toNumber();
    sim.growPart(sim.state.tree.rootId, 'branch');
    const afterFirst = sim.state.resources.amount('sap').toNumber();
    sim.growPart(sim.state.tree.rootId, 'branch');
    const afterSecond = sim.state.resources.amount('sap').toNumber();

    expect(first - afterFirst).toBeCloseTo(inSpring(15), 9);
    expect(afterFirst - afterSecond).toBeCloseTo(inSpring(15 * 1.15), 9);
  });

  it('runs the full loop: tap for Sap, grow a branch, grow a leaf, gain Light/s', () => {
    const sim = new Simulation();

    // Tap the trunk until the first branch is affordable.
    for (let i = 0; i < 40; i += 1) sim.click(i * 100, NEVER_CRIT);
    expect(sim.state.resources.amount('sap').toNumber()).toBeGreaterThan(15);

    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    expect(branch).not.toBeNull();

    // No canopy yet, so no Light.
    sim.tick(1);
    expect(sim.state.resources.perSecond('light').toNumber()).toBe(0);

    const leaf = sim.growPart(branch?.id ?? '', 'leafCluster');
    expect(leaf).not.toBeNull();

    // A leaf with no roots under it runs at the hydration floor.
    sim.tick(1);
    const snap = sim.snapshot(0);
    const lit = 0.4 * HYDRATION_MIN * daylight(sim);
    expect(snap.perSecond.light.toNumber()).toBeCloseTo(lit, 9);
    expect(snap.resources.light.toNumber()).toBeCloseTo(lit, 9);
  });

  it('accumulates production across parts', () => {
    const sim = withSap(new Simulation(), 1000);
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    const root = sim.growPart(sim.state.tree.rootId, 'rootSegment');

    // Water is what that root's depth earns it; Light is two leaves throttled
    // by what that one root can supply to them.
    const end = sim.state.tree.placements().get(root?.id ?? '')?.end as Vec2;
    const water = 0.3 * depthMultiplier(depthAt(end.y));
    const hydration = Math.min(HYDRATION_MAX, water / (2 * WATER_NEED_PER_LEAF));

    sim.tick(1);
    expect(sim.state.resources.perSecond('water').toNumber()).toBeCloseTo(water, 9);
    expect(sim.state.resources.perSecond('light').toNumber()).toBeCloseTo(
      0.8 * hydration * daylight(sim),
      9,
    );
  });

  it('drops the production of everything a prune removes', () => {
    const sim = withSap(new Simulation(), 1000);
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    sim.tick(1);
    expect(sim.state.resources.perSecond('light').toNumber()).toBeCloseTo(
      0.4 * HYDRATION_MIN * daylight(sim),
      9,
    );

    sim.prunePart(branch?.id ?? '');
    sim.tick(1);
    expect(sim.state.resources.perSecond('light').toNumber()).toBe(0);
    expect(sim.state.producers.size).toBe(0);
  });

  it('rebuilds part producers from the graph on construction', () => {
    const state = createInitialState();
    const branch = state.tree.grow(state.tree.rootId, 'branch');
    state.tree.grow(branch?.id ?? '', 'leafCluster');

    const sim = new Simulation(state);
    sim.tick(1);
    expect(sim.state.resources.perSecond('light').toNumber()).toBeCloseTo(
      0.4 * HYDRATION_MIN * daylight(sim),
      9,
    );
  });

  it('advances the tree revision so the renderer knows to re-project', () => {
    const sim = withSap(new Simulation(), 1000);
    const before = sim.snapshot(0).treeRevision;
    sim.growPart(sim.state.tree.rootId, 'branch');
    expect(sim.snapshot(0).treeRevision).toBe(before + 1);
  });

  it('stamps parts with the tick they were grown at', () => {
    const sim = withSap(new Simulation(), 1000);
    sim.tick(0.1);
    sim.tick(0.1);
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    expect(branch?.createdAtTick).toBe(2);
  });
});

describe('roots, soil and the idle economy', () => {
  /** A simulation with money to spend and, by default, no ore in the ground. */
  function rich(soil = BARREN_SOIL): Simulation {
    const state = createInitialState();
    state.soil = soil;
    const sim = new Simulation(state);
    sim.state.resources.add('sap', new Decimal(100_000));
    return sim;
  }

  /** Grow a root chain `depth` segments long off the trunk, returning the last. */
  function rootChain(sim: Simulation, segments: number): string {
    let parent = sim.state.tree.rootId;
    for (let i = 0; i < segments; i += 1) {
      const node = sim.growPart(parent, 'rootSegment');
      parent = node?.id ?? parent;
    }
    return parent;
  }

  it('tags root production as offline-safe and canopy production as not', () => {
    const sim = rich();
    const root = sim.growPart(sim.state.tree.rootId, 'rootSegment');
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    const leaf = sim.growPart(branch?.id ?? '', 'leafCluster');

    const rootTags = sim.state.producers.get(partProducerId(root?.id ?? ''))?.tags;
    const leafTags = sim.state.producers.get(partProducerId(leaf?.id ?? ''))?.tags;

    expect(rootTags).toContain(OFFLINE_TAG);
    expect(rootTags).toContain('root');
    expect(leafTags).not.toContain(OFFLINE_TAG);
  });

  it('pays a root by the depth it reached', () => {
    const sim = rich();
    const root = sim.growPart(sim.state.tree.rootId, 'rootSegment');
    const end = sim.state.tree.placements().get(root?.id ?? '')?.end as Vec2;
    const depth = depthAt(end.y);

    expect(depth).toBeGreaterThan(0);
    sim.tick(1);
    expect(sim.state.resources.perSecond('water').toNumber()).toBeCloseTo(
      0.3 * depthMultiplier(depth),
      9,
    );
  });

  it('pays a deeper root more than a shallow one', () => {
    const shallow = rich();
    shallow.growPart(shallow.state.tree.rootId, 'rootSegment');
    shallow.tick(1);

    const deep = rich();
    rootChain(deep, 3);
    deep.tick(1);

    const perRootShallow = shallow.state.resources.perSecond('water').toNumber();
    const perRootDeep = deep.state.resources.perSecond('water').toNumber() / 3;
    expect(perRootDeep).toBeGreaterThan(perRootShallow);
  });

  it('finds no Minerals for a root tip outside every vein', () => {
    const sim = rich();
    const root = rootChain(sim, 1);
    const tip = sim.growPart(root, 'rootTip');

    expect(tip).not.toBeNull();
    expect(sim.state.producers.has(partProducerId(tip?.id ?? ''))).toBe(false);

    sim.tick(1);
    expect(sim.state.resources.perSecond('minerals').toNumber()).toBe(0);
  });

  it('mines a root tip that lands inside a vein, scaled by its richness', () => {
    // Geometry is deterministic, so a barren run tells us exactly where to
    // bury the ore for the real one.
    const scout = rich();
    const scoutTip = scout.growPart(rootChain(scout, 1), 'rootTip');
    const end = scout.state.tree.placements().get(scoutTip?.id ?? '')?.end as Vec2;

    const sim = rich({
      seed: 1,
      veins: [{ id: 'planted', center: end, radius: 0.05, richness: 2 }],
    });
    const tip = sim.growPart(rootChain(sim, 1), 'rootTip');
    expect(sim.state.tree.placements().get(tip?.id ?? '')?.end).toEqual(end);

    sim.tick(1);
    expect(sim.state.resources.perSecond('minerals').toNumber()).toBeCloseTo(
      0.12 * depthMultiplier(depthAt(end.y)) * 2,
      9,
    );
  });

  it('quotes a root tip’s find before it is bought', () => {
    const scout = rich();
    const scoutTip = scout.growPart(rootChain(scout, 1), 'rootTip');
    const end = scout.state.tree.placements().get(scoutTip?.id ?? '')?.end as Vec2;

    const barren = rich();
    const barrenOption = barren
      .growthOptions(rootChain(barren, 1))
      .find((priced) => priced.option.type === 'rootTip');
    expect(barrenOption?.production?.missingVein).toBe(true);
    expect(barrenOption?.production?.rate.toNumber()).toBe(0);

    const seam = rich({
      seed: 1,
      veins: [{ id: 'planted', center: end, radius: 0.05, richness: 2 }],
    });
    const seamOption = seam
      .growthOptions(rootChain(seam, 1))
      .find((priced) => priced.option.type === 'rootTip');
    expect(seamOption?.production?.missingVein).toBe(false);
    expect(seamOption?.production?.vein?.id).toBe('planted');
    // The quote is exactly what the part goes on to produce.
    expect(seamOption?.production?.rate.toNumber()).toBeCloseTo(
      0.12 * depthMultiplier(depthAt(end.y)) * 2,
      9,
    );
  });

  it('tells the grow menu how deep a root would reach', () => {
    const sim = rich();
    const option = sim
      .growthOptions(sim.state.tree.rootId)
      .find((priced) => priced.option.type === 'rootSegment');

    expect(option?.production?.depth).toBeGreaterThan(0);
    expect(option?.production?.stratum?.id).toBe('topsoil');
    expect(option?.production?.depthMultiplier).toBeGreaterThan(1);
  });

  it('leaves the canopy unhydrated until something is drinking', () => {
    const sim = rich();
    expect(sim.state.hydration.value).toBe(1);
    sim.growPart(sim.state.tree.rootId, 'branch');
    sim.tick(1);
    expect(sim.state.hydration.value).toBe(1);
  });

  it('throttles a canopy grown without roots', () => {
    const sim = rich();
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    sim.tick(1);

    expect(sim.state.hydration.value).toBe(HYDRATION_MIN);
    expect(sim.snapshot(0).clickStats.clickPower.toNumber()).toBeCloseTo(HYDRATION_MIN, 9);
  });

  it('lifts Light/s once three roots are feeding the canopy', () => {
    const sim = rich();
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    sim.tick(1);
    const parched = sim.state.resources.perSecond('light').toNumber();
    const parchedSun = daylight(sim);

    for (let i = 0; i < 3; i += 1) sim.growPart(sim.state.tree.rootId, 'rootSegment');
    sim.tick(1);
    const watered = sim.state.resources.perSecond('light').toNumber();

    expect(parched).toBeCloseTo(0.4 * HYDRATION_MIN * parchedSun, 9);
    expect(watered).toBeCloseTo(0.4 * HYDRATION_MAX * daylight(sim), 9);
    // Hold the sun still — it moved a second between the two readings — and the
    // lift is exactly the span of the hydration clamp.
    expect(watered / daylight(sim) / (parched / parchedSun)).toBeCloseTo(
      HYDRATION_MAX / HYDRATION_MIN,
      9,
    );
  });

  it('reacts to a purchase immediately, not a tick later', () => {
    const sim = rich();
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    expect(sim.state.hydration.value).toBe(HYDRATION_MIN);

    sim.growPart(sim.state.tree.rootId, 'rootSegment');
    expect(sim.state.hydration.value).toBeGreaterThan(HYDRATION_MIN);
  });

  it('recovers hydration when the leaves that were drinking are pruned', () => {
    const sim = rich();
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    expect(sim.state.hydration.value).toBe(HYDRATION_MIN);

    sim.prunePart(branch?.id ?? '');
    expect(sim.state.hydration.value).toBe(1);
  });

  it('republishes its modifiers instead of stacking them up', () => {
    const sim = rich();
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    for (let i = 0; i < 50; i += 1) sim.tick(0.1);

    const hydrationMods = sim.state.modifiers.all().filter((m) => m.source === HYDRATION_SOURCE);
    expect(hydrationMods).toHaveLength(2);
    expect(sim.state.resources.perSecond('light').toNumber()).toBeCloseTo(
      0.4 * HYDRATION_MIN * daylight(sim),
      9,
    );
  });

  it('never lets hydration feed back into the Water that drives it', () => {
    const sim = rich();
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    sim.growPart(sim.state.tree.rootId, 'rootSegment');

    sim.tick(1);
    const first = sim.state.resources.perSecond('water').toNumber();
    for (let i = 0; i < 20; i += 1) sim.tick(1);
    expect(sim.state.resources.perSecond('water').toNumber()).toBeCloseTo(first, 9);
  });

  it('publishes the hydration sum in snapshots', () => {
    const sim = rich();
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    sim.tick(1);

    const { hydration } = sim.snapshot(0);
    expect(hydration.leaves).toBe(2);
    expect(hydration.need.toNumber()).toBeCloseTo(2 * WATER_NEED_PER_LEAF, 9);
    expect(hydration.income.toNumber()).toBe(0);
    expect(hydration.ratio).toBe(0);
    expect(hydration.value).toBe(HYDRATION_MIN);
  });
});

describe('sunlight, the day and leaf shading', () => {
  function rich(): Simulation {
    const sim = new Simulation();
    sim.state.resources.add('sap', new Decimal(100_000));
    return sim;
  }

  /** Three leaves piled onto one twig. */
  function clustered(): Simulation {
    const sim = rich();
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    const twig = sim.growPart(branch?.id ?? '', 'twig');
    for (let i = 0; i < 3; i += 1) sim.growPart(twig?.id ?? '', 'leafCluster');
    return sim;
  }

  /** The same three leaves, one to a branch. */
  function spread(): Simulation {
    const sim = rich();
    for (let i = 0; i < 3; i += 1) {
      const branch = sim.growPart(sim.state.tree.rootId, 'branch');
      sim.growPart(branch?.id ?? '', 'leafCluster');
    }
    return sim;
  }

  /** Total exposure across the canopy. */
  function totalExposure(sim: Simulation): number {
    return [...sim.state.leafLight.values()].reduce((sum, leaf) => sum + leaf.exposure, 0);
  }

  it('runs the canopy on the sun', () => {
    const sim = rich();
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');

    sim.tick(1);
    const morning = sim.state.resources.perSecond('light').toNumber();
    const morningFactor = sim.state.lightFactor;
    expect(morningFactor).toBeCloseTo(daylight(sim), 10);

    // Straight through to the small hours.
    sim.tick(DAY_LENGTH_SECONDS * 0.55);
    expect(sim.snapshot(0).day.phase).toBe('night');

    const night = sim.state.resources.perSecond('light').toNumber();
    expect(sim.state.lightFactor).toBe(MOONLIGHT_FRACTION);
    expect(night).toBeLessThan(morning);
    expect(night / morning).toBeCloseTo(MOONLIGHT_FRACTION / morningFactor, 9);
  });

  it('never stops producing entirely — the moon keeps a trickle going', () => {
    const sim = rich();
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    sim.tick(DAY_LENGTH_SECONDS * 0.55);

    expect(sim.snapshot(0).day.phase).toBe('night');
    expect(sim.state.resources.perSecond('light').toNumber()).toBeGreaterThan(0);
  });

  it('republishes the daylight modifier instead of stacking it up', () => {
    const sim = rich();
    for (let i = 0; i < 40; i += 1) sim.tick(1);
    expect(sim.state.modifiers.all().filter((m) => m.source === DAYLIGHT_SOURCE)).toHaveLength(1);
  });

  it('pays each leaf for the light it can actually see', () => {
    const sim = clustered();
    sim.tick(1);

    const expected = totalExposure(sim) * 0.4 * sim.state.hydration.value * daylight(sim);
    expect(sim.state.resources.perSecond('light').toNumber()).toBeCloseTo(expected, 9);
  });

  it('earns less from a canopy stacked in one spot than from one spread out', () => {
    const piled = clustered();
    const fanned = spread();
    piled.tick(1);
    fanned.tick(1);

    // Same number of leaves, so the same Sap spent and the same hydration draw.
    expect(piled.state.leafLight.size).toBe(fanned.state.leafLight.size);
    expect(piled.state.hydration.value).toBe(fanned.state.hydration.value);

    expect(totalExposure(piled)).toBeLessThan(totalExposure(fanned));
    expect(piled.state.resources.perSecond('light').toNumber()).toBeLessThan(
      fanned.state.resources.perSecond('light').toNumber(),
    );
  });

  it('re-shades the canopy the moment a leaf lands, not on the next sweep', () => {
    const sim = clustered();
    // No tick has run since the last purchase, yet the shading is already known.
    expect(sim.state.tick).toBe(0);
    expect([...sim.state.leafLight.values()].some((leaf) => leaf.occluders > 0)).toBe(true);
  });

  it('forgets a pruned leaf and lifts the shade it was casting', () => {
    const sim = clustered();
    const shadedBefore = [...sim.state.leafLight.values()].filter((l) => l.occluders > 0).length;
    expect(shadedBefore).toBeGreaterThan(0);

    // Cut the whole limb: nothing is left to shade or be shaded.
    const branch = sim.state.tree.children(sim.state.tree.rootId)[0];
    sim.prunePart(branch.id);

    expect(sim.state.leafLight.size).toBe(0);
    sim.tick(1);
    expect(sim.state.resources.perSecond('light').toNumber()).toBe(0);
  });

  it('quotes a prospective leaf at the light of the spot it would land in', () => {
    const sim = clustered();
    sim.tick(1);

    const branch = sim.state.tree.allNodes().find((node) => node.type === 'branch');
    const leafOption = sim
      .growthOptions(branch?.id ?? '')
      .find((option) => option.option.type === 'leafCluster');

    // The quote is the whole sum written out: catalogue rate, the exposure at
    // that exact position, hydration, and the hour of the day.
    const exposure = leafOption?.production?.exposure ?? 0;
    expect(exposure).toBeGreaterThan(0);
    expect(leafOption?.production?.rate.toNumber()).toBeCloseTo(
      0.4 * exposure * sim.state.hydration.value * daylight(sim),
      9,
    );

    // A blossom is not shaded, so it is quoted without an exposure at all.
    const blossomOption = sim
      .growthOptions(branch?.id ?? '')
      .find((option) => option.option.type === 'blossom');
    expect(blossomOption?.production?.exposure).toBeNull();
  });

  it('reports the day and the canopy in snapshots', () => {
    const sim = clustered();
    sim.tick(1);
    const snap = sim.snapshot(0);

    expect(snap.day.dayNumber).toBe(0);
    expect(snap.lightFactor).toBeCloseTo(daylight(sim), 10);
    expect(snap.leafLight.size).toBe(3);
    expect([...snap.leafLight.values()].every((leaf) => leaf.rate.gt(0))).toBe(true);
  });
});

describe('the dawn Dew', () => {
  it('lands on the first tap of a save and not on the second', () => {
    const sim = new Simulation();
    expect(sim.click(0, NEVER_CRIT).dew?.toNumber()).toBeCloseTo(FIRST_DEW, 10);
    expect(sim.click(100, NEVER_CRIT).dew).toBeNull();
    expect(sim.click(200, NEVER_CRIT).dew).toBeNull();
  });

  it('returns with the next day', () => {
    const sim = new Simulation();
    sim.click(0, NEVER_CRIT);
    sim.tick(DAY_LENGTH_SECONDS);
    expect(sim.click(1000, NEVER_CRIT).dew?.toNumber()).toBeCloseTo(FIRST_DEW, 10);
    expect(sim.click(1100, NEVER_CRIT).dew).toBeNull();
  });

  it('is worth a minute of Sap income once there is any', () => {
    const sim = new Simulation();
    sim.click(0, NEVER_CRIT); // spend the opening day's Dew
    sim.addProducer({ id: 'sapflow', resource: 'sap', baseRate: 4, tags: [] });
    sim.tick(DAY_LENGTH_SECONDS);

    const dew = sim.click(1000, NEVER_CRIT).dew;
    expect(dew?.toNumber()).toBeCloseTo(4 * DEW_SECONDS, 9);
  });

  it('credits the Sap it grants, on top of the tap itself', () => {
    const sim = new Simulation();
    const before = sim.state.resources.amount('sap').toNumber();
    const result = sim.click(0, NEVER_CRIT);

    expect(sim.state.resources.amount('sap').toNumber()).toBeCloseTo(
      before + result.gain.toNumber() + (result.dew?.toNumber() ?? 0),
      9,
    );
  });
});

describe('species and grafting', () => {
  /** Sap and Water enough to build and join whatever a test needs. */
  function funded(amount = 5000): Simulation {
    const sim = new Simulation();
    sim.state.resources.add('sap', new Decimal(amount));
    sim.state.resources.add('water', new Decimal(amount));
    return sim;
  }

  /**
   * A rootstock and a scion of different species, each carrying a leaf, which is
   * the minimum shape a graft is allowed to happen on.
   */
  function graftable(sim: Simulation, lowerSpecies = 'oak', upperSpecies = 'birch') {
    const lower = sim.growPart(sim.state.tree.rootId, 'branch', lowerSpecies) as TreeNode;
    const upper = sim.growPart(lower.id, 'branch', upperSpecies) as TreeNode;
    sim.growPart(lower.id, 'leafCluster', lowerSpecies);
    sim.growPart(upper.id, 'leafCluster', upperSpecies);
    return { lower, upper };
  }

  it('starts planting the starter species, with nothing else on offer', () => {
    const sim = new Simulation();
    expect(sim.state.plantingSpecies).toBe(STARTER_SPECIES_ID);
    expect(sim.unlockedSpecies()).toEqual([STARTER_SPECIES_ID]);
    expect(sim.snapshot(0).species.planting).toBe(STARTER_SPECIES_ID);
  });

  it('refuses to plant a species that is still locked', () => {
    const sim = new Simulation();
    expect(sim.setPlantingSpecies('cherry')).toBe(false);
    expect(sim.state.plantingSpecies).toBe(STARTER_SPECIES_ID);
  });

  it('lets a species be planted once its milestone is met', () => {
    const sim = funded();
    // Birch opens at 8 grown parts.
    let parent = sim.state.tree.rootId;
    for (let i = 0; i < 8; i += 1) {
      const node = sim.growPart(parent, 'branch');
      if (node) parent = node.id;
    }

    expect(sim.unlockedSpecies()).toContain('birch');
    expect(sim.setPlantingSpecies('birch')).toBe(true);
    expect(sim.growPart(parent, 'leafCluster')?.speciesId).toBe('birch');
  });

  it('never plants a hybrid from the grow menu', () => {
    const sim = funded();
    expect(sim.growPart(sim.state.tree.rootId, 'branch', 'ghostwood')).toBeNull();
    expect(sim.state.tree.size).toBe(1);
  });

  it('charges a birch part less than an oak one', () => {
    const oak = funded();
    const birch = funded();

    const before = oak.state.resources.amount('sap');
    oak.growPart(oak.state.tree.rootId, 'branch', 'oak');
    const oakSpend = before.sub(oak.state.resources.amount('sap')).toNumber();

    birch.growPart(birch.state.tree.rootId, 'branch', 'birch');
    const birchSpend = before.sub(birch.state.resources.amount('sap')).toNumber();

    expect(birchSpend).toBeCloseTo(oakSpend * 0.7, 6);
  });

  it("scales a leaf's output by the species that grew it", () => {
    const oak = funded();
    const maple = funded();
    const branchA = oak.growPart(oak.state.tree.rootId, 'branch', 'oak') as TreeNode;
    const branchB = maple.growPart(maple.state.tree.rootId, 'branch', 'oak') as TreeNode;

    const leafA = oak.growPart(branchA.id, 'leafCluster', 'oak') as TreeNode;
    const leafB = maple.growPart(branchB.id, 'leafCluster', 'maple') as TreeNode;

    const rateA = oak.state.producers.get(partProducerId(leafA.id))?.baseRate ?? 0;
    const rateB = maple.state.producers.get(partProducerId(leafB.id))?.baseRate ?? 0;

    // Same position, same shade: the whole difference is maple's broad leaves.
    expect(Number(rateB)).toBeCloseTo(Number(rateA), 9);
    oak.tick(1);
    maple.tick(1);
    expect(maple.state.resources.perSecond('light').toNumber()).toBeCloseTo(
      oak.state.resources.perSecond('light').toNumber() * 1.25,
      6,
    );
  });

  it('pays more for a tap on oak wood than on birch', () => {
    const sim = funded();
    const birch = sim.growPart(sim.state.tree.rootId, 'branch', 'birch') as TreeNode;

    const onOak = sim.click(0, NEVER_CRIT, sim.state.tree.rootId).gain.toNumber();
    const onBirch = sim.click(0, NEVER_CRIT, birch.id).gain.toNumber();

    // Same combo state on both taps; the difference is the wood.
    expect(onOak).toBeGreaterThan(onBirch);
  });

  it('grafts two adjacent limbs into the hybrid the table names', () => {
    const sim = funded();
    const { lower, upper } = graftable(sim);

    const result = sim.graft(lower.id, upper.id);
    expect(result).not.toBeNull();
    expect(result?.hybrid.id).toBe('ghostwood');
    expect(result?.discovered).toBe(true);

    // The scion and everything it carries; the rootstock untouched.
    expect(sim.state.tree.node(upper.id)?.speciesId).toBe('ghostwood');
    expect(sim.state.tree.node(lower.id)?.speciesId).toBe('oak');
    for (const child of sim.state.tree.children(upper.id)) {
      expect(child.speciesId).toBe('ghostwood');
    }
  });

  it('charges the graft and refuses one it cannot pay for', () => {
    const sim = funded();
    const { lower, upper } = graftable(sim);

    const sapBefore = sim.state.resources.amount('sap');
    const waterBefore = sim.state.resources.amount('water');
    const quote = sim.graftQuote(lower.id, upper.id);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;

    sim.graft(lower.id, upper.id);
    for (const line of quote.costs) {
      const before = line.resource === 'sap' ? sapBefore : waterBefore;
      expect(sim.state.resources.amount(line.resource).toNumber()).toBeCloseTo(
        before.sub(line.amount).toNumber(),
        6,
      );
    }

    // Enough to build the pair, nothing left to join it with.
    const broke = funded(200);
    const pair = graftable(broke);
    broke.state.resources.add('sap', broke.state.resources.amount('sap').neg());
    broke.state.resources.add('water', broke.state.resources.amount('water').neg());
    expect(broke.graft(pair.lower.id, pair.upper.id)).toBeNull();
    expect(broke.state.tree.node(pair.upper.id)?.speciesId).toBe('birch');
  });

  it('records the discovery once, and prices the next graft higher', () => {
    const sim = funded(50000);
    const first = graftable(sim);
    sim.graft(first.lower.id, first.upper.id);

    expect(sim.state.discoveries.has('ghostwood')).toBe(true);
    expect(sim.state.grafts).toBe(1);
    expect(sim.snapshot(0).species.discovered).toEqual(['ghostwood']);

    // A second pair of the same two species makes the same hybrid, but it is no
    // longer news — and it costs more.
    const lower = sim.growPart(sim.state.tree.rootId, 'branch', 'oak') as TreeNode;
    const upper = sim.growPart(lower.id, 'branch', 'birch') as TreeNode;
    sim.growPart(lower.id, 'leafCluster', 'oak');
    sim.growPart(upper.id, 'leafCluster', 'birch');

    const second = sim.graftQuote(lower.id, upper.id);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.firstDiscovery).toBe(false);
    expect(second.costs[0].amount.toNumber()).toBeGreaterThan(graftCost(0)[0].amount.toNumber());

    sim.graft(lower.id, upper.id);
    expect(sim.snapshot(0).species.discovered).toEqual(['ghostwood']);
    expect(sim.state.grafts).toBe(2);
  });

  it('puts the hybrid’s trait on the limb, and only on that limb', () => {
    const sim = funded(50000);
    const { lower, upper } = graftable(sim, 'oak', 'birch');
    const scionLeaf = sim.state.tree
      .children(upper.id)
      .find((node) => node.type === 'leafCluster') as TreeNode;
    const rootstockLeaf = sim.state.tree
      .children(lower.id)
      .find((node) => node.type === 'leafCluster') as TreeNode;

    const before = sim.state.producers.get(partProducerId(scionLeaf.id))?.baseRate ?? 0;
    sim.graft(lower.id, upper.id);
    sim.tick(0.1);

    const scionRate = sim.state.leafLight.get(scionLeaf.id)?.rate.toNumber() ?? 0;
    const rootstockRate = sim.state.leafLight.get(rootstockLeaf.id)?.rate.toNumber() ?? 0;

    // Ghostwood is +20% on everything the limb makes, against the oak
    // rootstock's leaf at ×1. The producer's *base* rate is untouched: the
    // species rides the modifier pipeline, exactly as daylight and totems do.
    expect(Number(sim.state.producers.get(partProducerId(scionLeaf.id))?.baseRate)).toBeCloseTo(
      Number(before),
      9,
    );
    expect(scionRate).toBeGreaterThan(rootstockRate);
    expect(scionRate / rootstockRate).toBeCloseTo(1.2, 4);
  });

  it('takes a hybrid’s parts out of the tally when the limb is pruned', () => {
    const sim = funded(50000);
    const { lower, upper } = graftable(sim);
    sim.graft(lower.id, upper.id);
    expect(sim.state.tree.countBySpecies().get('ghostwood')).toBe(2);

    sim.prunePart(upper.id);
    expect(sim.state.tree.countBySpecies().has('ghostwood')).toBe(false);
    // The discovery survives the limb: the Journal is a record of the save.
    expect(sim.state.discoveries.has('ghostwood')).toBe(true);
  });
});

describe('symbionts', () => {
  /** A simulation with money to spend and, by default, no ore in the ground. */
  function funded(soil = BARREN_SOIL): Simulation {
    const state = createInitialState();
    state.soil = soil;
    const sim = new Simulation(state);
    sim.state.resources.add('sap', new Decimal(500_000));
    return sim;
  }

  /** The snapshot row for one creature. */
  function row(sim: Simulation, id: string) {
    return sim.snapshot().symbionts.find((entry) => entry.id === id);
  }

  /** Grow `n` blossoms, which is what the bees are waiting for. */
  function blossoms(sim: Simulation, n: number): void {
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    for (let i = 0; i < n; i += 1) {
      sim.growPart(branch?.id ?? '', 'blossom');
    }
  }

  it('leaves a fresh seedling alone — nobody lives in a stick', () => {
    const sim = new Simulation();
    expect(sim.snapshot().symbionts.every((entry) => !entry.active)).toBe(true);
  });

  it('brings the bees on the third blossom and not before', () => {
    const sim = funded();

    blossoms(sim, 2);
    expect(row(sim, 'bees')?.active).toBe(false);
    expect(row(sim, 'bees')?.fraction).toBeCloseTo(2 / 3, 9);

    blossoms(sim, 1);
    expect(row(sim, 'bees')?.active).toBe(true);
    expect(row(sim, 'bees')?.level).toBe(1);
  });

  it('lifts crit chance the moment the hive arrives', () => {
    const sim = funded();
    const before = sim.snapshot().clickStats.critChance;

    blossoms(sim, 3);
    expect(sim.snapshot().clickStats.critChance).toBeCloseTo(before + 0.03, 9);
  });

  it('keeps a resident after the thing that drew it is cut away', () => {
    const sim = funded();
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    for (let i = 0; i < 3; i += 1) sim.growPart(branch?.id ?? '', 'blossom');
    expect(row(sim, 'bees')?.active).toBe(true);

    sim.prunePart(branch?.id ?? '');
    expect(sim.state.tree.countOfType('blossom')).toBe(0);
    expect(row(sim, 'bees')?.active).toBe(true);
    expect(sim.snapshot().clickStats.critChance).toBeCloseTo(0.05, 9);
  });

  it('brings the ants on five lifetime Deadwood, and they reach the taps', () => {
    const sim = funded();
    expect(row(sim, 'ants')?.active).toBe(false);

    sim.state.resources.add('deadwood', new Decimal(5));
    sim.tick(0.1);

    expect(row(sim, 'ants')?.active).toBe(true);
    expect(sim.snapshot().clickStats.clickPower.toNumber()).toBeCloseTo(1.05, 9);
  });

  it('announces an arrival once, then stops', () => {
    const sim = funded();
    // The squirrel comes with the oak branch the blossoms are grown on — it is
    // the earliest resident in the game, and deliberately so: the first creature
    // should turn up while the player is still learning what a branch is.
    blossoms(sim, 3);

    expect(sim.drainSymbiontArrivals()).toEqual(['squirrel', 'bees']);
    expect(sim.drainSymbiontArrivals()).toEqual([]);
  });

  it('brings the fungus when a root tip reaches the clay, and widens what a tip can find', () => {
    // Deterministic geometry: a barren scout tells us exactly where the tip
    // lands, so the ore can be buried just out of its reach.
    const scout = funded();
    let parent = scout.state.tree.rootId;
    for (let i = 0; i < 3; i += 1) {
      parent = scout.growPart(parent, 'rootSegment')?.id ?? parent;
    }
    const scoutTip = scout.growPart(parent, 'rootTip');
    const end = scout.state.tree.placements().get(scoutTip?.id ?? '')?.end as Vec2;
    expect(scout.snapshot().symbionts.find((e) => e.id === 'mycorrhiza')?.active).toBe(true);

    // A pocket 1.4 radii away: out of a bare root's reach, inside the fungus's.
    const radius = 0.05;
    const sim = funded({
      seed: 2,
      veins: [
        {
          id: 'planted',
          center: { x: end.x + radius * 1.4, y: end.y },
          radius,
          richness: 2,
        },
      ],
    });

    // Before the tip exists there is no fungus, so the pocket is out of reach.
    let chain = sim.state.tree.rootId;
    for (let i = 0; i < 3; i += 1) {
      chain = sim.growPart(chain, 'rootSegment')?.id ?? chain;
    }
    expect(sim.state.veinReach).toBe(1);

    const tip = sim.growPart(chain, 'rootTip');
    // The tip is what attracts the fungus, and the fungus is what finds the ore
    // — so the same purchase does both.
    expect(sim.state.veinReach).toBeCloseTo(1.5, 9);
    expect(sim.state.producers.has(partProducerId(tip?.id ?? ''))).toBe(true);

    sim.tick(1);
    expect(sim.state.resources.perSecond('minerals').toNumber()).toBeGreaterThan(0);
  });

  it('drops a Seed Fragment on the songbird’s clock, scaled by its level', () => {
    const sim = funded();
    sim.state.symbionts.arrive(SYMBIONT_BY_ID.songbird, 0);

    // Whole-second ticks: the payout lands on an exact engine second, and 1800
    // additions of 0.1 do not.
    for (let i = 0; i < SONGBIRD_INTERVAL_SECONDS - 1; i += 1) sim.tick(1);
    expect(sim.state.seedFragments).toBe(0);

    sim.tick(1);
    expect(sim.state.seedFragments).toBe(1);

    sim.state.symbionts.setLevel('songbird', 3);
    for (let i = 0; i < SONGBIRD_INTERVAL_SECONDS; i += 1) sim.tick(1);
    expect(sim.state.seedFragments).toBe(4);
  });

  it('buries a nut a day, and sprouts it into a free root next session', () => {
    const sim = funded();
    sim.state.symbionts.arrive(SYMBIONT_BY_ID.squirrel, 0);

    // A day passes in one jump, the way an offline catch-up will.
    sim.tick(DAY_LENGTH_SECONDS);
    expect(sim.state.buriedNuts).toBe(1);
    // Nothing has grown yet: the nut is in the ground, not in the tree.
    const before = sim.state.tree.countOfType('rootSegment');

    const next = new Simulation(sim.state);
    expect(next.sproutedNuts).toHaveLength(1);
    expect(next.sproutedNuts[0].type).toBe('rootSegment');
    expect(next.sproutedNuts[0].speciesId).toBe(STARTER_SPECIES_ID);
    expect(next.state.tree.countOfType('rootSegment')).toBe(before + 1);
    expect(next.state.buriedNuts).toBe(0);
    // Free means free: the root produces without anything having been spent.
    expect(next.state.producers.has(partProducerId(next.sproutedNuts[0].id))).toBe(true);
  });

  it('keeps a nut it has nowhere to sprout', () => {
    const state = createInitialState();
    state.buriedNuts = 2;
    // A trunk with every child slot taken has no room for a root.
    const sim = new Simulation(state);
    for (const nut of sim.sproutedNuts) expect(nut.type).toBe('rootSegment');
    expect(sim.state.buriedNuts + sim.sproutedNuts.length).toBe(2);
  });

  it('buys a level, paying every line of a mixed price', () => {
    const sim = funded();
    blossoms(sim, 3);
    sim.state.resources.add('light', new Decimal(1000));

    const sapBefore = sim.state.resources.amount('sap');
    const lightBefore = sim.state.resources.amount('light');
    const [light, sap] = SYMBIONT_BY_ID.bees.upgrades[0];

    expect(sim.upgradeSymbiont('bees')).toBe(true);
    expect(sim.state.symbionts.level('bees')).toBe(2);
    expect(sim.state.resources.amount('light').toNumber()).toBeCloseTo(
      lightBefore.toNumber() - light.amount,
      9,
    );
    expect(sim.state.resources.amount('sap').toNumber()).toBeCloseTo(
      sapBefore.toNumber() - sap.amount,
      9,
    );
    expect(sim.snapshot().clickStats.critChance).toBeCloseTo(0.02 + 0.06, 9);
  });

  it('refuses a level it cannot pay for in full, and spends nothing', () => {
    const sim = funded();
    blossoms(sim, 3);
    // Plenty of Sap, no Light: half a mixed price is not a price.
    const sapBefore = sim.state.resources.amount('sap').toNumber();

    expect(sim.upgradeSymbiont('bees')).toBe(false);
    expect(sim.state.symbionts.level('bees')).toBe(1);
    expect(sim.state.resources.amount('sap').toNumber()).toBe(sapBefore);
  });

  it('refuses a creature that has not arrived, and one already at the top', () => {
    const sim = funded();
    expect(sim.upgradeSymbiont('bees')).toBe(false);

    blossoms(sim, 3);
    sim.state.resources.add('light', new Decimal(1e6));
    sim.state.resources.add('minerals', new Decimal(1e6));
    for (let i = 1; i < SYMBIONT_MAX_LEVEL; i += 1) {
      expect(sim.upgradeSymbiont('bees')).toBe(true);
    }
    expect(sim.state.symbionts.level('bees')).toBe(SYMBIONT_MAX_LEVEL);
    expect(sim.upgradeSymbiont('bees')).toBe(false);
    expect(row(sim, 'bees')?.maxed).toBe(true);
    expect(row(sim, 'bees')?.nextCost).toBeNull();
  });

  it('refuses an unknown creature', () => {
    expect(funded().upgradeSymbiont('dragon')).toBe(false);
  });

  it('quotes affordability against live balances', () => {
    const sim = funded();
    blossoms(sim, 3);
    expect(row(sim, 'bees')?.affordable).toBe(false);

    sim.state.resources.add('light', new Decimal(1000));
    expect(row(sim, 'bees')?.affordable).toBe(true);
  });
});

/* ----------------------------------------------- STEP 12: seasons & weather */

/**
 * A simulation whose year is four seconds long.
 *
 * The real year is a little under eleven hours (four seasons of twenty engine
 * days), which is exactly right for a game and impossible for a test — so the
 * season length lives on the state rather than in a constant. This is the
 * "accelerated test mode" the step's acceptance asks for, and it is the same
 * knob STEP 13's Tempo heirloom will turn.
 */
function accelerated(seasonLengthSeconds = 4, random: RandomSource = () => 0.99): Simulation {
  const state = createInitialState();
  state.seasonLengthSeconds = seasonLengthSeconds;
  return new Simulation(state, random);
}

/** A random source that plays a script and then holds a steady value forever. */
function scripted(values: readonly number[], fallback = 0.99): RandomSource {
  let index = 0;
  return () => (index < values.length ? values[index++] : fallback);
}

/** Run `seconds` of simulation in fixed steps, optionally away from the tab. */
function run(sim: Simulation, seconds: number, step = 0.1, offline = false): void {
  const ticks = Math.round(seconds / step);
  for (let i = 0; i < ticks; i += 1) sim.tick(step, { offline });
}

/** What one unit of Light production is currently worth, all modifiers in. */
const lightWorth = (sim: Simulation) =>
  applyModifiers(new Decimal(1), sim.state.modifiers.matching('light', ['canopy'])).toNumber();

describe('the year', () => {
  it('opens a new save in Spring, on day one, with no rings', () => {
    const sim = new Simulation();
    const snapshot = sim.snapshot(0);

    expect(snapshot.season.id).toBe('spring');
    expect(snapshot.season.day).toBe(1);
    expect(snapshot.season.year).toBe(0);
    expect(snapshot.rings).toBe(0);
    expect(snapshot.ringMultiplier).toBe(1);
  });

  it('cycles a full year in order and comes out the other side with a ring', () => {
    const sim = accelerated();
    const seen: string[] = [];

    // Four seasons of four seconds, and one tick over the line into the next
    // year — a whole year in a sixth of a second of test time.
    for (let i = 0; i < 161; i += 1) {
      sim.tick(0.1);
      const id = sim.state.season.id;
      if (seen[seen.length - 1] !== id) seen.push(id);
    }

    expect(seen).toEqual(['spring', 'summer', 'autumn', 'winter', 'spring']);
    expect(sim.state.rings).toBe(1);
    expect(sim.state.season.year).toBe(1);
  });

  it('puts the season’s modifiers up as it turns, and takes the last one down', () => {
    const sim = accelerated();

    // Spring: growth is cheap, Light is ordinary.
    expect(partCost('branch', 0, sim.state.modifiers).toNumber()).toBeCloseTo(inSpring(15), 9);

    run(sim, 4.1); // into Summer
    expect(sim.state.season.id).toBe('summer');
    expect(partCost('branch', 0, sim.state.modifiers).toNumber()).toBeCloseTo(15, 9);
    expect(lightWorth(sim)).toBeCloseTo(daylight(sim) * (1 + SUMMER_LIGHT_BONUS), 9);

    run(sim, 8); // through Autumn and into Winter
    expect(sim.state.season.id).toBe('winter');
    expect(lightWorth(sim)).toBeCloseTo(daylight(sim) * (1 - WINTER_PENALTY), 9);
    expect(partCost('branch', 0, sim.state.modifiers).toNumber()).toBeCloseTo(
      15 * (1 + WINTER_PENALTY),
      9,
    );
  });

  it('announces the turn once, as an event the UI drains', () => {
    const sim = accelerated();
    expect(sim.drainSeasonEvents()).toEqual([]);

    run(sim, 4.1);
    const events = sim.drainSeasonEvents();
    expect(events).toEqual([{ kind: 'season', id: 'summer', index: 1 }]);
    // Drained: an event replayed every frame would replay its toast.
    expect(sim.drainSeasonEvents()).toEqual([]);
  });
});

describe('rings', () => {
  it('are laid down for surviving winter, and multiply everything after', () => {
    const sim = accelerated();
    run(sim, 16.1); // one full year

    expect(sim.state.rings).toBe(1);
    expect(sim.snapshot(0).ringMultiplier).toBeCloseTo(1 + RING_PRODUCTION_BONUS, 9);

    const water = applyModifiers(
      new Decimal(1),
      sim.state.modifiers.matching('water', ['root']),
    ).toNumber();
    expect(water).toBeCloseTo(1 + RING_PRODUCTION_BONUS, 9);
  });

  it('stack: a second winter compounds on the first', () => {
    const sim = accelerated();
    run(sim, 16.1);
    expect(sim.state.rings).toBe(1);

    run(sim, 16);
    expect(sim.state.rings).toBe(2);
    expect(sim.snapshot(0).ringMultiplier).toBeCloseTo(Math.pow(1 + RING_PRODUCTION_BONUS, 2), 9);
  });

  it('persist through the seasons that follow, rather than lapsing like a buff', () => {
    const sim = accelerated();
    run(sim, 16.1);

    run(sim, 8); // two more seasons
    expect(sim.state.rings).toBe(1);
    expect(
      applyModifiers(new Decimal(1), sim.state.modifiers.matching('minerals', ['root'])).toNumber(),
    ).toBeCloseTo(1 + RING_PRODUCTION_BONUS, 9);
  });

  it('are paid for every winter an absence covered, exactly once each', () => {
    const sim = accelerated();
    run(sim, 48.1, 0.1, true); // three years, all of it away
    expect(sim.state.rings).toBe(3);

    const events = sim.drainSeasonEvents().filter((event) => event.kind === 'ring');
    expect(events.reduce((total, event) => total + (event.kind === 'ring' ? event.rings : 0), 0)).toBe(3);
  });

  it('report themselves once, with the running total', () => {
    const sim = accelerated();
    run(sim, 16.1);

    const ring = sim.drainSeasonEvents().find((event) => event.kind === 'ring');
    expect(ring).toEqual({ kind: 'ring', rings: 1, total: 1 });
  });

  it('are not handed out for a winter the tree is still in the middle of', () => {
    const sim = accelerated();
    run(sim, 13); // deep into the first winter
    expect(sim.state.season.id).toBe('winter');
    expect(sim.state.rings).toBe(0);
  });
});

describe('weather', () => {
  it('leaves the sky clear through the opening minutes of a save', () => {
    const sim = new Simulation();
    run(sim, 60, 0.5);
    expect(sim.snapshot(0).weather.active).toBeNull();
    expect(sim.snapshot(0).weather.pending).toBeNull();
  });

  it('announces an event before it lands, and says how long it has left once it has', () => {
    // 0 draws rain, and holds the gap at its minimum.
    const sim = new Simulation(createInitialState(), () => 0);
    run(sim, WEATHER_MIN_GAP_SECONDS + 1, 0.5);

    const announced = sim.snapshot(0).weather;
    expect(announced.pending?.id).toBe('rain');
    expect(announced.pending?.inSeconds).toBeLessThanOrEqual(WEATHER_TELEGRAPH_SECONDS);
    expect(announced.active).toBeNull();

    run(sim, WEATHER_TELEGRAPH_SECONDS, 0.5);
    const landed = sim.snapshot(0).weather;
    expect(landed.active?.id).toBe('rain');
    expect(landed.active?.remainingSeconds).toBeGreaterThan(0);
    expect(landed.active?.fraction).toBeLessThanOrEqual(1);
  });

  it('triples Water while it rains, and gives it back when the sky clears', () => {
    const sim = new Simulation(createInitialState(), () => 0);
    const dry = () =>
      applyModifiers(new Decimal(1), sim.state.modifiers.matching('water', ['root'])).toNumber();

    run(sim, WEATHER_MIN_GAP_SECONDS + WEATHER_TELEGRAPH_SECONDS + 1, 0.5);
    expect(sim.state.weather.active?.id).toBe('rain');
    expect(dry()).toBeCloseTo(RAIN_WATER_MULTIPLIER, 9);

    run(sim, RAIN_DURATION_SECONDS, 0.5);
    expect(sim.state.weather.active).toBeNull();
    expect(dry()).toBeCloseTo(1, 9);
  });

  it('never blows a storm while the player is away, however long they are gone', () => {
    const sim = new Simulation(createInitialState(), createSeededRandom(4));
    const seen: string[] = [];

    for (let i = 0; i < 20_000; i += 1) {
      sim.tick(0.5, { offline: true });
      for (const event of sim.drainWeatherEvents()) seen.push(`${event.kind}:${event.id}`);
      expect(sim.state.weather.active?.id).not.toBe('storm');
    }

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((entry) => entry.endsWith(':storm'))).toBe(false);
    expect(seen.some((entry) => entry.endsWith(':rain'))).toBe(true);
  });

  it('drops a storm that was announced before the player left', () => {
    // 0.6 draws the storm; the tab shuts before it lands.
    const sim = new Simulation(createInitialState(), () => 0.6);
    run(sim, WEATHER_MIN_GAP_SECONDS + 1, 0.5);
    expect(sim.state.weather.pending?.id).toBe('storm');

    run(sim, WEATHER_TELEGRAPH_SECONDS + 1, 0.5, true);
    expect(sim.state.weather.active).toBeNull();
  });
});

describe('storms', () => {
  /** A tree with wide limbs on it, and the storm about to arrive. */
  function stormy(random: RandomSource): Simulation {
    const sim = new Simulation(createInitialState(), random);
    sim.state.resources.add('sap', new Decimal(1e6));
    for (let i = 0; i < 5; i += 1) sim.growPart(sim.state.tree.rootId, 'branch');
    return sim;
  }

  it('refuses a brace when there is no storm to brace against', () => {
    expect(new Simulation().braceStorm()).toBe(false);
  });

  it('takes limbs from a tree nobody held, and pays Deadwood for them', () => {
    // storm, gap, then rolls that fail every limb.
    const sim = stormy(scripted([0.6, 0.5, 0, 0], 0.99));
    const before = sim.state.tree.size;

    run(sim, WEATHER_MIN_GAP_SECONDS + WEATHER_TELEGRAPH_SECONDS + 1, 0.5);
    expect(sim.state.weather.active?.id).toBe('storm');
    expect(sim.snapshot(0).weather.storm?.target).toBe(STORM_BRACE_TAPS);

    run(sim, STORM_DURATION_SECONDS + 1, 0.5);

    const report = sim
      .drainWeatherEvents()
      .find((event) => event.kind === 'end' && event.id === 'storm')?.storm;

    expect(report).toBeDefined();
    expect(report?.snapped.length).toBeGreaterThan(0);
    expect(report?.snapped.length).toBeLessThanOrEqual(STORM_MAX_SNAPS);
    expect(sim.state.tree.size).toBeLessThan(before);
    expect(sim.state.resources.amount('deadwood').toNumber()).toBeGreaterThan(0);
    expect(report?.deadwood.toNumber()).toBeGreaterThan(0);
  });

  it('takes nothing at all from a tree that was fully braced', () => {
    const sim = stormy(scripted([0.6, 0.5, 0, 0, 0, 0], 0));
    run(sim, WEATHER_MIN_GAP_SECONDS + WEATHER_TELEGRAPH_SECONDS + 1, 0.5);
    expect(sim.state.weather.active?.id).toBe('storm');

    const before = sim.state.tree.size;
    for (let i = 0; i < STORM_BRACE_TAPS; i += 1) expect(sim.braceStorm()).toBe(true);
    expect(sim.snapshot(0).weather.storm?.brace).toBe(1);

    run(sim, STORM_DURATION_SECONDS + 1, 0.5);
    const report = sim
      .drainWeatherEvents()
      .find((event) => event.kind === 'end' && event.id === 'storm')?.storm;

    expect(report?.brace).toBe(1);
    expect(report?.snapped).toEqual([]);
    expect(sim.state.tree.size).toBe(before);
  });

  it('forgets the taps banked against the last storm', () => {
    const sim = stormy(scripted([0.6, 0.5], 0.99));
    run(sim, WEATHER_MIN_GAP_SECONDS + WEATHER_TELEGRAPH_SECONDS + 1, 0.5);
    sim.braceStorm();
    sim.braceStorm();
    expect(sim.state.stormTaps).toBe(2);

    run(sim, STORM_DURATION_SECONDS + 1, 0.5);
    expect(sim.state.stormTaps).toBe(0);
    expect(sim.snapshot(0).weather.storm).toBeNull();
  });
});

describe('leaf litter', () => {
  /**
   * An accelerated simulation with a canopy on it.
   *
   * A hundred seconds a season: long enough that several piles fall inside one
   * autumn, short enough that a test can sit through the year.
   */
  const SEASON = 100;
  const AUTUMN_STARTS = SEASON * 2;

  function autumnal(random: RandomSource = () => 0.5): Simulation {
    const sim = accelerated(SEASON, random);
    sim.state.resources.add('sap', new Decimal(1e6));
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    for (let i = 0; i < 3; i += 1) sim.growPart(branch?.id ?? '', 'leafCluster');
    return sim;
  }

  it('sheds nothing outside autumn', () => {
    const sim = autumnal();
    run(sim, AUTUMN_STARTS - 1, 0.5); // all of spring and all of summer
    expect(sim.state.litter.size).toBe(0);
    expect(sim.state.season.id).toBe('summer');
  });

  it('drops piles at the base once autumn comes', () => {
    const sim = autumnal();
    run(sim, AUTUMN_STARTS + LITTER_INTERVAL_SECONDS + 1, 0.5);

    expect(sim.state.season.id).toBe('autumn');
    expect(sim.state.litter.size).toBeGreaterThan(0);

    const [pile] = sim.snapshot(0).litter;
    expect(pile.amount.toNumber()).toBeCloseTo(3 * LITTER_PER_LEAF, 9);
    expect(Math.abs(pile.x)).toBeLessThanOrEqual(0.5);
  });

  it('pays a pile out once, to the click that swept it', () => {
    const sim = autumnal();
    run(sim, AUTUMN_STARTS + LITTER_INTERVAL_SECONDS + 1, 0.5);

    const [pile] = sim.snapshot(0).litter;
    const collected = sim.collectLitter(pile.id);

    expect(collected?.amount.toNumber()).toBeCloseTo(pile.amount.toNumber(), 9);
    expect(sim.state.resources.amount('leafLitter').toNumber()).toBeCloseTo(
      pile.amount.toNumber(),
      9,
    );
    // A second click on the same heap must not pay twice.
    expect(sim.collectLitter(pile.id)).toBeNull();
  });

  it('sheds nothing from a bare tree', () => {
    const sim = accelerated(SEASON);
    run(sim, AUTUMN_STARTS + LITTER_INTERVAL_SECONDS * 2, 0.5);
    expect(sim.state.season.id).toBe('autumn');
    expect(sim.state.litter.size).toBe(0);
  });

  it('leaves what fell on the ground when winter comes', () => {
    const sim = autumnal();
    // Through the whole of autumn and one tick over the line into winter.
    run(sim, AUTUMN_STARTS + SEASON + 1, 0.5);
    expect(sim.state.season.id).toBe('winter');

    const waiting = sim.state.litter.size;
    expect(waiting).toBeGreaterThan(0);

    run(sim, SEASON / 2, 0.5);
    // Leaves left in the snow are still leaves: nothing sweeps itself away, and
    // a winter canopy sheds nothing to pile on top of them.
    expect(sim.state.litter.size).toBe(waiting);
  });

  it('sweeps itself up once the Rake is bought', () => {
    const sim = autumnal();
    sim.state.resources.add('leafLitter', new Decimal(1000));
    expect(sim.buyUpgrade(RAKE_ID)).toBe(true);
    expect(sim.hasRake()).toBe(true);

    const before = sim.state.resources.amount('leafLitter').toNumber();
    run(sim, AUTUMN_STARTS + LITTER_INTERVAL_SECONDS * 2, 0.5);

    expect(sim.state.litter.size).toBe(0);
    expect(sim.state.resources.amount('leafLitter').toNumber()).toBeGreaterThan(before);
  });

  it('sweeps the base on the spot when the Rake is bought mid-autumn', () => {
    const sim = autumnal();
    run(sim, AUTUMN_STARTS + LITTER_INTERVAL_SECONDS + 1, 0.5);
    expect(sim.state.litter.size).toBeGreaterThan(0);

    sim.state.resources.add('leafLitter', new Decimal(1000));
    const before = sim.state.resources.amount('leafLitter').toNumber();
    sim.buyUpgrade(RAKE_ID);

    expect(sim.state.litter.size).toBe(0);
    // Paid for the rake and still came out ahead of the pile it swept.
    expect(sim.state.resources.amount('leafLitter').toNumber()).toBeGreaterThan(before - 40);
  });
});

describe('the ground a root is working in', () => {
  it('tags a root producer with its layer, so weather can find it', () => {
    const sim = new Simulation();
    sim.state.resources.add('sap', new Decimal(1000));
    const root = sim.growPart(sim.state.tree.rootId, 'rootSegment');

    const producer = sim.state.producers.get(partProducerId(root?.id ?? ''));
    expect(producer?.tags).toContain('soil:topsoil');
    expect(producer?.tags).toContain('soil:topsoil/water');
  });

  it('dries out a shallow root in a drought and leaves the deep ones alone', () => {
    const sim = new Simulation(createInitialState(), () => 0.99); // 0.99 draws the drought
    sim.state.resources.add('sap', new Decimal(1000));
    const root = sim.growPart(sim.state.tree.rootId, 'rootSegment');
    const producer = sim.state.producers.get(partProducerId(root?.id ?? ''));

    const rate = () =>
      applyModifiers(
        new Decimal(producer?.baseRate ?? 0),
        sim.state.modifiers.matching('water', producer?.tags ?? []),
      ).toNumber();

    const before = rate();
    run(sim, WEATHER_MIN_GAP_SECONDS + WEATHER_TELEGRAPH_SECONDS + 1, 0.5);
    expect(sim.state.weather.active?.id).toBe('drought');
    expect(rate()).toBeCloseTo(before * DROUGHT_WATER_MULTIPLIER, 9);

    // The same drought, measured against a root that reached the rock.
    const deep = sim.state.modifiers.matching('water', [
      'root',
      'soil:rock',
      'soil:rock/water',
    ]);
    expect(applyModifiers(new Decimal(1), deep).toNumber()).toBeCloseTo(1, 9);
  });
});

/* ---------------------------------------------------------------- prestige */

/**
 * Bring a tree to maturity the way a run does, only faster.
 *
 * Height has to be *built* — it is a property of the graph and there is no way
 * to fake it — so the tree is grown branch-first up its own highest tip, which
 * is what a player reaching for the gate would do. The Light is granted outright:
 * a million of it is nine hours of a real canopy, and what these tests are about
 * is what happens at the threshold rather than how long it takes to arrive.
 */
function mature(sim: Simulation, species = STARTER_SPECIES_ID): void {
  sim.state.resources.add('sap', new Decimal(1e9));

  for (let i = 0; i < 40 && sim.prestigeProgress().heightFraction < 1; i += 1) {
    const placements = sim.state.tree.placements();
    let best: string | null = null;
    let bestY = -Infinity;

    for (const node of sim.state.tree.allNodes()) {
      if (!sim.state.tree.getValidGrowthOptions(node.id).some((o) => o.type === 'branch')) continue;
      const y = placements.get(node.id)?.end.y ?? -Infinity;
      if (y > bestY) {
        bestY = y;
        best = node.id;
      }
    }
    if (!best) break;
    sim.growPart(best, 'branch', species);
  }

  sim.state.resources.add('light', new Decimal(PRESTIGE_LIGHT_REQUIREMENT));
}

/** Take a mature tree all the way through the ceremony to the new seedling. */
function goToSeed(sim: Simulation): void {
  expect(sim.goToSeed()).not.toBeNull();
  run(sim, CEREMONY_SECONDS + 0.2, 0.1);
  expect(sim.state.ceremony).toBeNull();
}

describe('maturity', () => {
  it('refuses a seedling', () => {
    const sim = new Simulation();
    expect(sim.canGoToSeed()).toBe(false);
    expect(sim.goToSeed()).toBeNull();
  });

  it('refuses a tall tree that has gathered no Light', () => {
    const sim = new Simulation();
    mature(sim);
    sim.state.resources.restore('light', new Decimal(0), new Decimal(0));

    expect(sim.prestigeProgress().heightFraction).toBe(1);
    expect(sim.canGoToSeed()).toBe(false);
  });

  it('refuses a bright seedling — the tree has to have grown', () => {
    const sim = new Simulation();
    sim.state.resources.add('light', new Decimal(PRESTIGE_LIGHT_REQUIREMENT * 4));

    expect(sim.prestigeProgress().lightFraction).toBe(1);
    expect(sim.canGoToSeed()).toBe(false);
  });

  it('opens once both gates are met', () => {
    const sim = new Simulation();
    mature(sim);
    expect(sim.canGoToSeed()).toBe(true);
  });

  it('pays at least one Seed the moment it becomes possible', () => {
    const sim = new Simulation();
    mature(sim);
    expect(sim.prestigeYield().total).toBeGreaterThanOrEqual(1);
  });
});

describe('the Go to Seed ceremony', () => {
  it('does not reset the tree the instant it is started', () => {
    const sim = new Simulation();
    mature(sim);
    const before = sim.state.tree.size;

    sim.goToSeed();
    run(sim, CEREMONY_SECONDS - 1, 0.1);

    expect(sim.state.tree.size).toBe(before);
    expect(sim.state.ceremony).not.toBeNull();
  });

  it('lands after six seconds and leaves a seedling', () => {
    const sim = new Simulation();
    mature(sim);
    goToSeed(sim);

    expect(sim.state.tree.size).toBe(1);
    expect(sim.state.elapsedSeconds).toBeLessThan(CEREMONY_SECONDS);
  });

  it('cannot be started twice', () => {
    const sim = new Simulation();
    mature(sim);
    expect(sim.goToSeed()).not.toBeNull();
    expect(sim.goToSeed()).toBeNull();
  });

  it('pays what it quoted, not what six more seconds earned', () => {
    const sim = new Simulation();
    mature(sim);
    const quoted = sim.prestigeYield().total;

    sim.goToSeed();
    // A windfall mid-ceremony must not change the deal the player agreed to.
    sim.state.resources.add('light', new Decimal(PRESTIGE_LIGHT_REQUIREMENT * 400));
    run(sim, CEREMONY_SECONDS + 0.2, 0.1);

    expect(sim.state.resources.amount('seeds').toNumber()).toBe(quoted);
  });

  it('reports itself on the snapshot while it runs', () => {
    const sim = new Simulation();
    mature(sim);
    sim.goToSeed();
    run(sim, CEREMONY_SECONDS / 2, 0.1);

    const ceremony = sim.snapshot().prestige.ceremony;
    expect(ceremony).not.toBeNull();
    expect(ceremony?.fraction).toBeGreaterThan(0.3);
    expect(ceremony?.fraction).toBeLessThan(0.7);
  });

  it('queues exactly one report for the UI to celebrate', () => {
    const sim = new Simulation();
    mature(sim);
    goToSeed(sim);

    const events = sim.drainPrestigeEvents();
    expect(events).toHaveLength(1);
    expect(events[0].forestSize).toBe(1);
    expect(sim.drainPrestigeEvents()).toHaveLength(0);
  });
});

describe('what prestige keeps and what it gives up', () => {
  it('gives up the tree, the run resources and the run upgrades', () => {
    const sim = new Simulation();
    mature(sim);
    sim.buyUpgrade('strongerTaps');
    sim.state.resources.add('deadwood', new Decimal(500));
    sim.craftTotem('rain');
    expect(sim.state.totems).toHaveLength(1);

    goToSeed(sim);

    expect(sim.state.tree.size).toBe(1);
    expect(sim.state.resources.amount('sap').toNumber()).toBe(0);
    expect(sim.state.resources.total('light').toNumber()).toBe(0);
    expect(sim.state.upgrades.level('strongerTaps')).toBe(0);
    expect(sim.state.totems).toHaveLength(0);
    expect(sim.state.symbionts.size).toBe(0);
  });

  it('keeps Seeds, Rings, Heirlooms and the Journal', () => {
    const sim = new Simulation();
    mature(sim);
    sim.state.rings = 3;
    sim.state.discoveries.add('ghostwillow');
    sim.state.resources.restore('seeds', new Decimal(9), new Decimal(9));
    sim.buyHeirloom('seedcase');

    const seedsBefore = sim.state.resources.amount('seeds');
    const paid = sim.prestigeYield().total;
    goToSeed(sim);

    expect(sim.state.rings).toBe(3);
    expect(sim.state.discoveries.has('ghostwillow')).toBe(true);
    expect(sim.state.heirlooms.level('seedcase')).toBe(1);
    expect(sim.state.resources.amount('seeds').toNumber()).toBe(
      seedsBefore.toNumber() + paid,
    );
  });

  it('keeps the rings working — they are still a live multiplier after the reset', () => {
    const sim = new Simulation();
    mature(sim);
    sim.state.rings = 4;
    goToSeed(sim);

    expect(sim.snapshot().ringMultiplier).toBeCloseTo((1 + RING_PRODUCTION_BONUS) ** 4, 9);
    expect(lightWorth(sim)).toBeGreaterThan(1);
  });

  it('keeps the ground the previous tree grew in', () => {
    const sim = new Simulation();
    const soil = sim.state.soil;
    mature(sim);
    goToSeed(sim);

    expect(sim.state.soil).toBe(soil);
  });

  it('carries fragments the songbird had not finished, and spends the rest', () => {
    const sim = new Simulation();
    mature(sim);
    sim.state.seedFragments = 250;

    const paid = sim.prestigeYield();
    expect(paid.fromFragments).toBe(2);
    goToSeed(sim);

    expect(sim.state.seedFragments).toBe(50);
  });

  it('starts the new run in Spring, on a clock of its own', () => {
    const sim = new Simulation();
    mature(sim);
    run(sim, 30, 0.5);
    goToSeed(sim);

    expect(sim.state.season.id).toBe('spring');
    expect(sim.snapshot().season.day).toBe(1);
  });
});

describe('the Old Growth forest', () => {
  it('stands the old tree on the hills', () => {
    const sim = new Simulation();
    mature(sim, 'oak');
    const parts = sim.state.tree.size - 1;
    goToSeed(sim);

    expect(sim.state.forest).toHaveLength(1);
    expect(sim.state.forest[0].parts).toBe(parts);
    expect(sim.state.forest[0].speciesId).toBe('oak');
    expect(sim.state.forest[0].slot).toBe(0);
  });

  it('accumulates: every tree given up is still there', () => {
    const sim = new Simulation();
    for (let run_ = 0; run_ < 3; run_ += 1) {
      mature(sim);
      goToSeed(sim);
      expect(sim.state.forest).toHaveLength(run_ + 1);
      expect(sim.state.forest[run_].slot).toBe(run_);
    }
  });

  it('pays one per cent per tree, live in the production pipeline', () => {
    const sim = new Simulation();
    mature(sim);
    goToSeed(sim);

    // Measured against a tree of the same age rather than against a fresh one:
    // the sun has been moving since the ceremony started, and Light is worth what
    // the hour makes it worth.
    const control = new Simulation();
    run(control, sim.state.elapsedSeconds, 0.1);

    expect(sim.snapshot().prestige.forestMultiplier).toBeCloseTo(1 + FOREST_PRODUCTION_BONUS, 9);
    expect(lightWorth(sim)).toBeCloseTo(lightWorth(control) * (1 + FOREST_PRODUCTION_BONUS), 9);
  });
});

describe('the Seed Vault', () => {
  /** A simulation holding Seeds and nothing else. */
  function withSeeds(seeds: number): Simulation {
    const sim = new Simulation();
    sim.state.resources.restore('seeds', new Decimal(seeds), new Decimal(seeds));
    return sim;
  }

  it('refuses an unknown heirloom', () => {
    expect(withSeeds(999).buyHeirloom('not-an-heirloom')).toBe(false);
  });

  it('refuses a node whose Seeds are not there', () => {
    const sim = withSeeds(0);
    expect(sim.buyHeirloom('seedcase')).toBe(false);
    expect(sim.state.heirlooms.level('seedcase')).toBe(0);
  });

  it('refuses a node still shut behind the one before it', () => {
    const sim = withSeeds(999);
    expect(sim.buyHeirloom('firstLimb')).toBe(false);
    expect(sim.buyHeirloom('seedcase')).toBe(true);
    expect(sim.buyHeirloom('firstLimb')).toBe(true);
  });

  it('refuses a track that is already full', () => {
    const sim = withSeeds(999);
    sim.buyHeirloom('seedcase');
    expect(sim.buyHeirloom('rootMap')).toBe(true);
    expect(sim.buyHeirloom('rootMap')).toBe(false);
  });

  it('charges the Seeds and publishes the effect at once', () => {
    const sim = withSeeds(999);
    for (const id of ['seedcase', 'firstLimb', 'firstRoot', 'cotyledon']) sim.buyHeirloom(id);

    const before = sim.snapshot().clickStats.clickPower.toNumber();
    const seeds = sim.state.resources.amount('seeds');
    expect(sim.buyHeirloom('vigour')).toBe(true);

    expect(sim.state.resources.amount('seeds').lt(seeds)).toBe(true);
    expect(sim.snapshot().clickStats.clickPower.toNumber()).toBeCloseTo(before * 1.12, 9);
  });

  it('never stacks a level of an heirloom with its own previous level', () => {
    const sim = withSeeds(1e6);
    for (const id of ['seedcase', 'firstLimb', 'firstRoot', 'cotyledon']) sim.buyHeirloom(id);

    const base = sim.snapshot().clickStats.clickPower.toNumber();
    sim.buyHeirloom('vigour');
    sim.buyHeirloom('vigour');
    sim.buyHeirloom('vigour');

    expect(sim.snapshot().clickStats.clickPower.toNumber()).toBeCloseTo(base * 1.12 ** 3, 9);
  });

  it('tops the current run up with a starting balance the moment it is bought', () => {
    // The first thing every player does with their first Seed. If it only paid
    // out at the *next* reset it would read as a button that does nothing.
    const sim = withSeeds(999);
    expect(sim.state.resources.amount('sap').toNumber()).toBe(0);

    expect(sim.buyHeirloom('seedcase')).toBe(true);
    expect(sim.state.resources.amount('sap').toNumber()).toBe(200);
  });

  it('tops up by the level bought, never by the whole track again', () => {
    const sim = withSeeds(1e6);
    sim.buyHeirloom('seedcase');
    sim.buyHeirloom('seedcase');
    sim.buyHeirloom('seedcase');

    expect(sim.state.resources.amount('sap').toNumber()).toBe(600);
  });

  it('plants a starting part on the spot, earning from the next tick', () => {
    const sim = withSeeds(1e6);
    sim.buyHeirloom('seedcase');
    sim.buyHeirloom('firstLimb');
    expect(sim.buyHeirloom('firstRoot')).toBe(true);

    expect(sim.state.tree.countOfType('branch')).toBe(1);
    expect(sim.state.tree.countOfType('rootSegment')).toBe(1);

    // Registered as a producer, not merely present in the graph: the rate itself
    // is banked by the tick, a tenth of a second later, exactly as it is for any
    // other purchase.
    run(sim, 0.1, 0.1);
    expect(sim.snapshot().perSecond.water.toNumber()).toBeGreaterThan(0);
  });

  it('does not pay the same run twice across a prestige', () => {
    const sim = withSeeds(1e6);
    sim.buyHeirloom('seedcase');
    mature(sim);
    goToSeed(sim);

    // The new run is paid once, from an empty record — not once for the reset
    // and again for the purchase the previous run already banked.
    expect(sim.state.resources.amount('sap').toNumber()).toBe(200);
  });

  it('shortens the year the moment Quickening is bought, without paying rings for it', () => {
    const sim = accelerated(40);
    sim.state.resources.restore('seeds', new Decimal(999), new Decimal(999));
    run(sim, 30, 0.5);

    const rings = sim.state.rings;
    expect(sim.buyHeirloom('quickening')).toBe(true);

    expect(sim.state.seasonLengthSeconds).toBeCloseTo(SEASON_LENGTH_SECONDS * 0.9, 6);
    expect(sim.state.rings).toBe(rings);
  });
});

describe('what the Vault hands the next run', () => {
  /** Prestige once, then buy the named heirlooms and prestige again. */
  function secondRun(ids: readonly string[], seeds = 1e6): Simulation {
    const sim = new Simulation();
    mature(sim);
    goToSeed(sim);
    sim.state.resources.restore('seeds', new Decimal(seeds), new Decimal(seeds));
    for (const id of ids) expect(sim.buyHeirloom(id)).toBe(true);

    mature(sim);
    goToSeed(sim);
    return sim;
  }

  it('gives Seedcase its Sap on the very first tick', () => {
    const sim = secondRun(['seedcase']);
    expect(sim.state.resources.amount('sap').toNumber()).toBe(200);
  });

  it('grows the parts First Limb and First Root paid for', () => {
    const sim = secondRun(['seedcase', 'firstLimb', 'firstRoot']);
    expect(sim.state.tree.countOfType('branch')).toBe(1);
    expect(sim.state.tree.countOfType('rootSegment')).toBe(1);
    // A root that exists is a root that is already earning.
    expect(sim.snapshot().perSecond.water.toNumber()).toBeGreaterThan(0);
  });

  it('rebuilds the previous roots from Root Map, and nothing above ground', () => {
    const sim = new Simulation();
    mature(sim);
    goToSeed(sim);
    sim.state.resources.restore('seeds', new Decimal(1e6), new Decimal(1e6));
    sim.buyHeirloom('rootMap');

    // The layout that comes back is the one this run leaves behind, so the roots
    // have to be dug in the run *before* the reset that restores them.
    sim.state.resources.add('sap', new Decimal(1e9));
    for (let i = 0; i < 3; i += 1) sim.growPart(sim.state.tree.rootId, 'rootSegment');
    expect(sim.state.tree.countOfType('rootSegment')).toBe(3);

    mature(sim);
    const canopyBefore = sim.state.tree.countOfType('branch');
    goToSeed(sim);

    expect(sim.state.tree.countOfType('rootSegment')).toBe(3);
    expect(sim.state.tree.countOfType('branch')).toBe(0);
    expect(canopyBefore).toBeGreaterThan(0);
  });

  it('never replays a layout into a run already under way', () => {
    const sim = new Simulation();
    mature(sim);
    goToSeed(sim);

    const size = sim.state.tree.size;
    sim.state.resources.restore('seeds', new Decimal(1e6), new Decimal(1e6));
    expect(sim.buyHeirloom('rootMap')).toBe(true);

    // Root Map is bought with a whole tree remembered, and the seedling is left
    // exactly as it was: a layout arrives at a reset or not at all.
    expect(sim.state.tree.size).toBe(size);
    expect(sim.snapshot().prestige.remembered).toBeGreaterThan(0);
  });

  it('rebuilds the whole tree once Canopy Map is owned too', () => {
    const sim = new Simulation();
    mature(sim);
    goToSeed(sim);
    sim.state.resources.restore('seeds', new Decimal(1e6), new Decimal(1e6));
    for (const id of ['rootMap', 'deepHabit', 'canopyMap']) {
      expect(sim.buyHeirloom(id)).toBe(true);
    }

    mature(sim);
    const size = sim.state.tree.size;
    goToSeed(sim);

    expect(sim.state.tree.size).toBe(size);
    // A tree that came back at full height is mature again immediately.
    expect(sim.prestigeProgress().heightFraction).toBe(1);
  });

  it('seats the bonded creature before the first tick', () => {
    const sim = new Simulation();
    mature(sim);
    goToSeed(sim);
    sim.state.resources.restore('seeds', new Decimal(1e6), new Decimal(1e6));
    sim.setBondSymbiont('mycorrhiza');
    for (const id of ['oldFriend', 'warmWelcome']) expect(sim.buyHeirloom(id)).toBe(true);

    mature(sim);
    goToSeed(sim);

    expect(sim.state.symbionts.has('mycorrhiza')).toBe(true);
    expect(sim.state.symbionts.level('mycorrhiza')).toBe(2);
    // Its reach is published, not merely recorded.
    expect(sim.state.veinReach).toBeGreaterThan(1);
  });

  it('brings nobody when no creature was chosen', () => {
    const sim = new Simulation();
    mature(sim);
    goToSeed(sim);
    sim.state.resources.restore('seeds', new Decimal(1e6), new Decimal(1e6));
    sim.buyHeirloom('oldFriend');

    mature(sim);
    goToSeed(sim);
    expect(sim.state.symbionts.size).toBe(0);
  });

  it('refuses a bond choice that is not a creature', () => {
    const sim = new Simulation();
    expect(sim.setBondSymbiont('badger')).toBe(false);
    expect(sim.setBondSymbiont('bees')).toBe(true);
    expect(sim.setBondSymbiont(null)).toBe(true);
    expect(sim.state.bondSymbiont).toBeNull();
  });
});

describe('two runs in a row', () => {
  /**
   * Lifetime Sap earned by a fixed script of taps and purchases.
   *
   * The same hands doing the same thing for the same length of time, so the only
   * difference between the two numbers is what the tree brought with it.
   */
  function scriptedRun(sim: Simulation, taps: number): number {
    for (let i = 0; i < taps; i += 1) sim.click(i * 400, NEVER_CRIT);
    run(sim, 30, 0.1);
    return sim.state.resources.total('sap').toNumber();
  }

  it('completes the whole loop twice, and the forest grows both times', () => {
    const sim = new Simulation();

    mature(sim);
    goToSeed(sim);
    expect(sim.state.forest).toHaveLength(1);
    expect(sim.state.resources.amount('seeds').toNumber()).toBeGreaterThan(0);

    mature(sim);
    expect(sim.canGoToSeed()).toBe(true);
    goToSeed(sim);
    expect(sim.state.forest).toHaveLength(2);
    expect(sim.state.resources.amount('seeds').toNumber()).toBeGreaterThan(1);
  });

  it('runs the second one noticeably faster than the first', () => {
    const first = new Simulation();
    const firstEarned = scriptedRun(first, 40);

    // Everything the first run left behind: a Seed, a tree on the hills, and
    // whatever the Vault was able to buy with the one.
    mature(first);
    goToSeed(first);
    expect(first.buyHeirloom('seedcase')).toBe(true);

    const secondEarned = scriptedRun(first, 40);

    expect(secondEarned).toBeGreaterThan(firstEarned);
    // Not a rounding difference: the seed case alone is 200 Sap up front.
    expect(secondEarned - firstEarned).toBeGreaterThan(150);
  });

  it('records what each tree was made of, so the grove is not all one colour', () => {
    const sim = new Simulation();
    mature(sim, 'maple');
    goToSeed(sim);
    mature(sim, 'pine');
    goToSeed(sim);

    expect(sim.state.forest.map((tree) => tree.speciesId)).toEqual(['maple', 'pine']);
  });
});
