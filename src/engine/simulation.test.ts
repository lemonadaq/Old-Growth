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
