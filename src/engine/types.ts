import Decimal from 'break_infinity.js';
import type { ResourceId } from '../content/resources';
import type { Producer } from './economy';
import { ModifierSet } from './modifiers';
import { ResourceRegistry } from './resourceRegistry';

/** A plain per-resource record of `Decimal`s (used for immutable snapshots). */
export type Resources = Record<ResourceId, Decimal>;

/** The full mutable game state owned by the {@link Simulation}. */
export interface GameState {
  /** Live resource balances, lifetime totals, and cached rates. */
  resources: ResourceRegistry;
  /** Registered producers keyed by id, evaluated every tick. */
  producers: Map<string, Producer>;
  /** Active modifiers, removable by source id. */
  modifiers: ModifierSet;
  /** Total number of fixed simulation ticks executed. */
  tick: number;
  /** Total simulated time in seconds. */
  elapsedSeconds: number;
  /** Wall-clock timestamp (ms) of the last update; used later for offline calc. */
  lastUpdatedAt: number;
}

/**
 * Immutable snapshot handed to the UI/renderer. Resource values are cloned so
 * consumers can read them without risking mutation of live engine state.
 */
export interface GameSnapshot {
  /** Current spendable amounts. */
  readonly resources: Readonly<Resources>;
  /** Lifetime gross totals. */
  readonly totals: Readonly<Resources>;
  /** Net production rate per resource, in units per second. */
  readonly perSecond: Readonly<Resources>;
  readonly tick: number;
  readonly elapsedSeconds: number;
  /** Time of day as a fraction of the cycle in `[0, 1)`. See `timeOfDay.ts`. */
  readonly dayPhase: number;
}

/** Debug counters sampled by the loop once per second. */
export interface DebugStats {
  readonly fps: number;
  readonly tps: number;
}

/** A fresh game state with all resources at zero and nothing producing. */
export function createInitialState(now: number = Date.now()): GameState {
  return {
    resources: new ResourceRegistry(),
    producers: new Map(),
    modifiers: new ModifierSet(),
    tick: 0,
    elapsedSeconds: 0,
    lastUpdatedAt: now,
  };
}
