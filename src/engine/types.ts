import Decimal from 'break_infinity.js';
import { EXPOSURE_INTERVAL_SECONDS } from '../content/light';
import type { ResourceId } from '../content/resources';
import type { ClickStats } from './clicker';
import { createComboState, type ComboState } from './combo';
import { dayCycle, type DayCycle } from './daylight';
import type { Producer } from './economy';
import { computeHydration, type HydrationState } from './hydration';
import { lightFactorAt, type LeafExposure } from './light';
import { ModifierSet } from './modifiers';
import { ResourceRegistry } from './resourceRegistry';
import { createSoilMap, type SoilMap } from './soil';
import { TreeGraph } from './treeGraph';
import { UpgradeLedger } from './upgrades';

/** A plain per-resource record of `Decimal`s (used for immutable snapshots). */
export type Resources = Record<ResourceId, Decimal>;

/**
 * One leaf cluster's light: its positional exposure plus what that is currently
 * worth per second once every modifier has had its say.
 *
 * The rate is resolved on the exposure sweep's cadence rather than per frame —
 * it feeds a tooltip, and a tooltip a second behind a passing cloud is a trade
 * worth making against recomputing every leaf's modifiers 60 times a second.
 */
export interface LeafLight extends LeafExposure {
  /** Light per second this leaf is contributing, after modifiers. */
  readonly rate: Decimal;
}

/** The full mutable game state owned by the {@link Simulation}. */
export interface GameState {
  /** Live resource balances, lifetime totals, and cached rates. */
  resources: ResourceRegistry;
  /** Registered producers keyed by id, evaluated every tick. */
  producers: Map<string, Producer>;
  /** Active modifiers, removable by source id. */
  modifiers: ModifierSet;
  /** The player's tree: the growth graph that is also the skill tree. */
  tree: TreeGraph;
  /** The ground the roots grow through: strata and mineral veins. */
  soil: SoilMap;
  /** Latest hydration reading, recomputed every tick. */
  hydration: HydrationState;
  /** Per-leaf light, recomputed on the exposure sweep and on every grow/prune. */
  leafLight: ReadonlyMap<string, LeafLight>;
  /** Multiplier the time of day is currently putting on Light. */
  lightFactor: number;
  /** Simulation time the next exposure sweep is due at, in seconds. */
  nextExposureAt: number;
  /** Day number the last Dew burst was collected on; `-1` before the first. */
  lastDewDay: number;
  /** Click combo meter. */
  combo: ComboState;
  /** Levels owned per upgrade. */
  upgrades: UpgradeLedger;
  /** Lifetime count of successful taps on the tree. */
  clicks: number;
  /** Total number of fixed simulation ticks executed. */
  tick: number;
  /** Total simulated time in seconds. */
  elapsedSeconds: number;
  /** Wall-clock timestamp (ms) of the last update; used later for offline calc. */
  lastUpdatedAt: number;
}

/** Combo meter state as read by the UI and renderer. */
export interface ComboSnapshot {
  /** Effective (decayed) stacks at snapshot time. */
  readonly stacks: number;
  /** Stacks the meter can currently hold. */
  readonly cap: number;
  /** Click power multiplier those stacks are worth (1 = no bonus). */
  readonly multiplier: number;
  /** Meter fullness in `[0, 1]`, for drawing. */
  readonly fill: number;
}

/** The hydration link as the HUD reads it. */
export interface HydrationSnapshot {
  /** Water per second the roots draw. */
  readonly income: Decimal;
  /** Water per second the canopy wants. */
  readonly need: Decimal;
  /** Leaf clusters currently drinking. */
  readonly leaves: number;
  /** Raw supply ÷ demand, before clamping. */
  readonly ratio: number;
  /** The multiplier applied to Light and to Sap per tap. */
  readonly value: number;
}

/** One upgrade's purchase state, resolved against the player's balance. */
export interface UpgradeSnapshot {
  readonly id: string;
  readonly level: number;
  /** Cost of the next level. */
  readonly cost: Decimal;
  readonly affordable: boolean;
  readonly maxed: boolean;
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
  /** Current click stats after modifiers. */
  readonly clickStats: ClickStats;
  /** How well the roots are supplying the canopy. */
  readonly hydration: HydrationSnapshot;
  /** Where the engine is in its day: phase, sun strength, day number. */
  readonly day: DayCycle;
  /** What that time of day multiplies Light by. */
  readonly lightFactor: number;
  /**
   * Per-leaf light, keyed by node id. Shared by reference rather than cloned:
   * the engine replaces this map wholesale on each sweep and never mutates it in
   * place, so handing it out costs nothing and cannot be scribbled on.
   */
  readonly leafLight: ReadonlyMap<string, LeafLight>;
  readonly combo: ComboSnapshot;
  readonly upgrades: readonly UpgradeSnapshot[];
  /** Lifetime count of successful taps on the tree. */
  readonly clicks: number;
  /**
   * Structural revision of the tree graph. Consumers that cache derived tree
   * geometry (the renderer projects it only on change) compare this instead of
   * diffing the graph.
   */
  readonly treeRevision: number;
  /** Node count of the tree, trunk included. */
  readonly treeSize: number;
  readonly tick: number;
  readonly elapsedSeconds: number;
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
    tree: TreeGraph.seedling(),
    soil: createSoilMap(),
    hydration: computeHydration(new Decimal(0), 0),
    leafLight: new Map(),
    lightFactor: lightFactorAt(dayCycle(0).t),
    nextExposureAt: EXPOSURE_INTERVAL_SECONDS,
    // Before the first day: the very first tap of a new save is a dawn, and the
    // tree ought to have dew on it.
    lastDewDay: -1,
    combo: createComboState(),
    upgrades: new UpgradeLedger(),
    clicks: 0,
    tick: 0,
    elapsedSeconds: 0,
    lastUpdatedAt: now,
  };
}
