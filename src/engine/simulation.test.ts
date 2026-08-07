import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { Simulation } from './simulation';
import { createInitialState } from './types';
import { disableTestProducers, enableTestProducers } from './debugProducers';
import { COMBO_DECAY_MS, COMBO_FULL_STACKS } from './combo';
import { RESOURCE_IDS } from '../content/resources';
import { HYDRATION_MAX, HYDRATION_MIN, WATER_NEED_PER_LEAF } from '../content/hydration';
import { OFFLINE_TAG } from '../content/growth';
import { DEW_MIN_TAPS, DEW_SECONDS, MOONLIGHT_FRACTION } from '../content/light';
import { DAY_LENGTH_SECONDS } from '../content/daylight';
import { dayCycle } from './daylight';
import type { Vec2 } from './geometry';
import { HYDRATION_SOURCE } from './hydration';
import { partProducerId } from './growth';
import { DAYLIGHT_SOURCE, lightFactorAt } from './light';
import { BARREN_SOIL, depthAt, depthMultiplier } from './soil';

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
    expect(sim.state.resources.amount('sap').toNumber()).toBeCloseTo(before - 15, 9);
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

    expect(first - afterFirst).toBeCloseTo(15, 9);
    expect(afterFirst - afterSecond).toBeCloseTo(15 * 1.15, 9);
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
