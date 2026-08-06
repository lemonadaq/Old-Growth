import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { Simulation } from './simulation';
import { createInitialState } from './types';
import { disableTestProducers, enableTestProducers } from './debugProducers';
import { COMBO_DECAY_MS, COMBO_FULL_STACKS } from './combo';
import { RESOURCE_IDS } from '../content/resources';

/** Rolls that never / always crit. */
const NEVER_CRIT = () => 1;
const ALWAYS_CRIT = () => 0;

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
    expect(sim.state.resources.amount('sap').toNumber()).toBeCloseTo(1.02, 10);
    expect(sim.state.clicks).toBe(1);
  });

  it('credits the lifetime Sap total as well as the balance', () => {
    const sim = new Simulation();
    sim.click(0, NEVER_CRIT);
    expect(sim.state.resources.total('sap').toNumber()).toBeCloseTo(1.02, 10);
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

    sim.tick(1);
    const snap = sim.snapshot(0);
    expect(snap.perSecond.light.toNumber()).toBeCloseTo(0.4, 9);
    expect(snap.resources.light.toNumber()).toBeCloseTo(0.4, 9);
  });

  it('accumulates production across parts', () => {
    const sim = withSap(new Simulation(), 1000);
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    sim.growPart(sim.state.tree.rootId, 'rootSegment');

    sim.tick(1);
    expect(sim.state.resources.perSecond('light').toNumber()).toBeCloseTo(0.8, 9);
    expect(sim.state.resources.perSecond('water').toNumber()).toBeCloseTo(0.3, 9);
  });

  it('drops the production of everything a prune removes', () => {
    const sim = withSap(new Simulation(), 1000);
    const branch = sim.growPart(sim.state.tree.rootId, 'branch');
    sim.growPart(branch?.id ?? '', 'leafCluster');
    sim.tick(1);
    expect(sim.state.resources.perSecond('light').toNumber()).toBeCloseTo(0.4, 9);

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
    expect(sim.state.resources.perSecond('light').toNumber()).toBeCloseTo(0.4, 9);
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
