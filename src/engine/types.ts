import Decimal from 'break_infinity.js';
import { EXPOSURE_INTERVAL_SECONDS } from '../content/light';
import type { ResourceId } from '../content/resources';
import { BuffLedger } from './buffs';
import type { ClickStats } from './clicker';
import { createComboState, type ComboState } from './combo';
import { dayCycle, type DayCycle } from './daylight';
import type { Producer } from './economy';
import { computeHydration, type HydrationState } from './hydration';
import { STARTER_SPECIES_ID } from '../content/species';
import { lightFactorAt, type LeafExposure } from './light';
import { ModifierSet } from './modifiers';
import { ResourceRegistry } from './resourceRegistry';
import { createSoilMap, type SoilMap } from './soil';
import { SymbiontLedger, type SymbiontCost, type SymbiontProgress } from './symbionts';
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
  /** Timed buffs currently running, keyed by id. */
  buffs: BuffLedger;
  /** Creatures living in the tree, at their levels. */
  symbionts: SymbiontLedger;
  /** Latest reading of who has arrived and who is still being courted. */
  symbiontProgress: readonly SymbiontProgress[];
  /**
   * How far out a root tip currently feels for ore, as a multiplier on every
   * pocket's radius. Cached because it is an input to every root tip's producer
   * and to the way the ground is drawn, and it only moves when the mycorrhiza
   * does.
   */
  veinReach: number;
  /**
   * Seed Fragments the songbird has dropped. A hundred make a Seed at prestige
   * (STEP 13); until then they simply accrue.
   */
  seedFragments: number;
  /**
   * Nuts the squirrel has buried and not dug up. They sprout into free root
   * segments on the way into the *next* session — see
   * `Simulation.plantBuriedNuts`.
   */
  buriedNuts: number;
  /** Symbionts that arrived since the UI last looked, oldest first. */
  symbiontArrivals: string[];
  /** Totems planted at the tree base, in slot order. */
  totems: string[];
  /** The species new parts are grown as — whatever the picker is showing. */
  plantingSpecies: string;
  /**
   * Hybrids the player has ever made, by id.
   *
   * Discovery is knowledge, not inventory: it survives the limb being pruned,
   * and (from STEP 13) it will survive prestige, which is what makes the Journal
   * a record of the whole save rather than of the current tree.
   */
  discoveries: Set<string>;
  /** Lifetime count of grafts made; prices the next one. */
  grafts: number;
  /** Lifetime count of successful taps on the tree. */
  clicks: number;
  /** Lifetime count of limbs cut. */
  prunes: number;
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

/** One running buff as the HUD reads it. */
export interface BuffSnapshot {
  readonly id: string;
  /** Engine seconds left before it lapses. */
  readonly remainingSeconds: number;
  /** How much of its duration is left, in `[0, 1]`, for a drain bar. */
  readonly fraction: number;
}

/** One species' availability, as the picker and the Journal read it. */
export interface SpeciesUnlockSnapshot {
  readonly id: string;
  readonly unlocked: boolean;
  /** Progress toward the milestone, in `[0, 1]`. */
  readonly fraction: number;
  /** One line naming what is still needed. */
  readonly hint: string;
}

/** Everything the UI needs to know about what the tree is made of. */
export interface SpeciesSnapshot {
  /** What new parts are being grown as. */
  readonly planting: string;
  /** Base species available to plant, in catalogue order. */
  readonly unlocked: readonly string[];
  /** Every base species with its unlock state, for the Journal. */
  readonly unlocks: readonly SpeciesUnlockSnapshot[];
  /** Parts per species currently on the tree, trunk included. */
  readonly counts: ReadonlyMap<string, number>;
  /** Hybrid ids the player has ever made. */
  readonly discovered: readonly string[];
  /** Lifetime grafts made. */
  readonly grafts: number;
}

/**
 * One symbiont as the panel reads it: whether it has arrived, how close the
 * tree is to attracting it, and what the next level of it would cost.
 */
export interface SymbiontSnapshot extends SymbiontProgress {
  /** True when its track has no further levels. */
  readonly maxed: boolean;
  /** Price of the next level, or `null` when there is no next level. */
  readonly nextCost: readonly SymbiontCost[] | null;
  /** Whether that price can be met right now. */
  readonly affordable: boolean;
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
  /** Buffs running right now, with the time left on each. */
  readonly buffs: readonly BuffSnapshot[];
  /** Every symbiont in catalogue order, resident or not. */
  readonly symbionts: readonly SymbiontSnapshot[];
  /** How far out root tips currently feel for ore, as a radius multiplier. */
  readonly veinReach: number;
  /** Seed Fragments banked toward a Seed at prestige. */
  readonly seedFragments: number;
  /** Nuts waiting in the ground for next session. */
  readonly buriedNuts: number;
  /** Totems planted at the tree base, in slot order. */
  readonly totems: readonly string[];
  /** What the tree is made of, and what the player may plant next. */
  readonly species: SpeciesSnapshot;
  /** Lifetime count of successful taps on the tree. */
  readonly clicks: number;
  /** Lifetime count of limbs cut. */
  readonly prunes: number;
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
    buffs: new BuffLedger(),
    symbionts: new SymbiontLedger(),
    symbiontProgress: [],
    veinReach: 1,
    seedFragments: 0,
    buriedNuts: 0,
    symbiontArrivals: [],
    totems: [],
    plantingSpecies: STARTER_SPECIES_ID,
    discoveries: new Set(),
    grafts: 0,
    clicks: 0,
    prunes: 0,
    tick: 0,
    elapsedSeconds: 0,
    lastUpdatedAt: now,
  };
}
