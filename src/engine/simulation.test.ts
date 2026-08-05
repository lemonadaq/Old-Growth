import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { Simulation } from './simulation';
import { createInitialState } from './types';
import { disableTestProducers, enableTestProducers } from './debugProducers';
import { RESOURCE_IDS } from '../content/resources';

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
