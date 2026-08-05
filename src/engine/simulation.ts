import Decimal from 'break_infinity.js';
import { RESOURCE_IDS } from '../content/resources';
import { createInitialState, type GameSnapshot, type GameState, type Resources } from './types';

/**
 * Owns the mutable {@link GameState} and advances it one fixed tick at a time.
 *
 * STEP 1 is a skeleton: `tick()` only advances the clock/counters. Production
 * systems (Sap from clicks, Light from leaves, Water/Minerals from roots) are
 * layered on in later steps. Keeping this pure and framework-free means it can
 * be driven by the loop, by tests, or by an offline-progress calculator.
 */
export class Simulation {
  readonly state: GameState;

  constructor(initial: GameState = createInitialState()) {
    this.state = initial;
  }

  /** Advance the simulation by one fixed step of `dtSeconds`. */
  tick(dtSeconds: number): void {
    this.state.tick += 1;
    this.state.elapsedSeconds += dtSeconds;
    this.state.lastUpdatedAt = Date.now();

    // Production systems will hook in here in later steps.
  }

  /** Produce an immutable snapshot for the UI/renderer to read. */
  snapshot(): GameSnapshot {
    const resources = {} as Resources;
    for (const id of RESOURCE_IDS) {
      // Clone so consumers can never mutate live engine Decimals.
      resources[id] = new Decimal(this.state.resources[id]);
    }
    return {
      resources,
      tick: this.state.tick,
      elapsedSeconds: this.state.elapsedSeconds,
    };
  }
}
