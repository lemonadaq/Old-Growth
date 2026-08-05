import Decimal from 'break_infinity.js';
import { RESOURCE_IDS, type ResourceId } from '../content/resources';

/** Every resource stored as a big-number `Decimal`. */
export type Resources = Record<ResourceId, Decimal>;

/** The full mutable game state owned by the {@link Simulation}. */
export interface GameState {
  resources: Resources;
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
  readonly resources: Readonly<Resources>;
  readonly tick: number;
  readonly elapsedSeconds: number;
}

/** Debug counters sampled by the loop once per second. */
export interface DebugStats {
  readonly fps: number;
  readonly tps: number;
}

function zeroResources(): Resources {
  const out = {} as Resources;
  for (const id of RESOURCE_IDS) {
    out[id] = new Decimal(0);
  }
  return out;
}

/** A fresh game state with all resources at zero. */
export function createInitialState(now: number = Date.now()): GameState {
  return {
    resources: zeroResources(),
    tick: 0,
    elapsedSeconds: 0,
    lastUpdatedAt: now,
  };
}
