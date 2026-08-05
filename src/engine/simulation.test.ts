import { describe, expect, it } from 'vitest';
import { Simulation } from './simulation';
import { createInitialState } from './types';
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
    expect(sim.state.resources.sap.toNumber()).toBe(0);
  });

  it('accepts an injected initial state', () => {
    const state = createInitialState(0);
    state.resources.sap = state.resources.sap.add(42);
    const sim = new Simulation(state);
    expect(sim.snapshot().resources.sap.toNumber()).toBe(42);
  });
});
