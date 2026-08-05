import Decimal from 'break_infinity.js';
import { RESOURCE_IDS } from '../content/resources';
import { computeProduction, type Producer } from './economy';
import type { Modifier } from './modifiers';
import { dayPhase } from './timeOfDay';
import { createInitialState, type GameSnapshot, type GameState, type Resources } from './types';

/**
 * Owns the mutable {@link GameState} and advances it one fixed tick at a time.
 *
 * Each tick re-evaluates the production pipeline: every registered producer is
 * combined with the active modifiers to yield a per-second rate per resource,
 * that rate is cached on the registry, and the resource amounts are advanced by
 * `rate × dt`. Kept pure and framework-free so it can be driven by the loop, by
 * tests, or by an offline-progress calculator.
 */
export class Simulation {
  readonly state: GameState;

  constructor(initial: GameState = createInitialState()) {
    this.state = initial;
  }

  /** Register (or replace) a producer by its id. */
  addProducer(producer: Producer): void {
    this.state.producers.set(producer.id, producer);
  }

  /** Remove a producer by id. No-op if it is not registered. */
  removeProducer(id: string): void {
    this.state.producers.delete(id);
  }

  /** Register a modifier. */
  addModifier(modifier: Modifier): void {
    this.state.modifiers.add(modifier);
  }

  /** Remove every modifier granted by `source`. */
  removeModifiersBySource(source: string): void {
    this.state.modifiers.removeBySource(source);
  }

  /** Advance the simulation by one fixed step of `dtSeconds`. */
  tick(dtSeconds: number): void {
    this.state.tick += 1;
    this.state.elapsedSeconds += dtSeconds;
    this.state.lastUpdatedAt = Date.now();

    const perSecond = computeProduction(this.state.producers.values(), this.state.modifiers);
    for (const id of RESOURCE_IDS) {
      const rate = perSecond[id];
      this.state.resources.setPerSecond(id, rate);
      if (!rate.eq(0)) {
        this.state.resources.add(id, rate.mul(dtSeconds));
      }
    }
  }

  /** Produce an immutable snapshot for the UI/renderer to read. */
  snapshot(): GameSnapshot {
    const resources = {} as Resources;
    const totals = {} as Resources;
    const perSecond = {} as Resources;
    for (const id of RESOURCE_IDS) {
      // Clone so consumers can never mutate live engine Decimals.
      resources[id] = new Decimal(this.state.resources.amount(id));
      totals[id] = new Decimal(this.state.resources.total(id));
      perSecond[id] = new Decimal(this.state.resources.perSecond(id));
    }
    return {
      resources,
      totals,
      perSecond,
      tick: this.state.tick,
      elapsedSeconds: this.state.elapsedSeconds,
      dayPhase: dayPhase(this.state.elapsedSeconds),
    };
  }
}
