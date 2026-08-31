import Decimal from 'break_infinity.js';
import { SEASON_LENGTH_SECONDS } from '../content/balance';
import { EXPOSURE_INTERVAL_SECONDS } from '../content/light';
import type { ResourceId } from '../content/resources';
import type { WeatherId } from '../content/weather';
import { BuffLedger } from './buffs';
import type { ClickStats } from './clicker';
import { createComboState, type ComboState } from './combo';
import { dayCycle, type DayCycle } from './daylight';
import type { Producer } from './economy';
import { HeirloomLedger } from './heirlooms';
import { computeHydration, type HydrationState } from './hydration';
import { LitterGround } from './litter';
import type { BeatStyle, FeatureId, HintAnchor } from '../content/progression';
import { DEFAULT_SETTINGS, type GameSettings } from '../content/settings';
import { STARTER_SPECIES_ID } from '../content/species';
import { lightFactorAt, type LeafExposure } from './light';
import { ModifierSet } from './modifiers';
import type { Ceremony, ForestTree, PrestigeProgress, SeedYield, TreeMemory } from './prestige';
import { ResourceRegistry } from './resourceRegistry';
import { seasonAt, type SeasonCycle, type SeasonEvent } from './seasons';
import { createSoilMap, type SoilMap } from './soil';
import { SymbiontLedger, type SymbiontCost, type SymbiontProgress } from './symbionts';
import { TreeGraph } from './treeGraph';
import { UpgradeLedger } from './upgrades';
import { WeatherScheduler, type WeatherLogEntry } from './weather';

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
  /** Latest reading of where the year is. Derived from `elapsedSeconds`. */
  season: SeasonCycle;
  /**
   * How long one season runs, in engine seconds.
   *
   * On the state rather than read from the content constant so a test can run a
   * whole year in milliseconds — and so STEP 13's Tempo heirloom ("seasons 10%
   * shorter") has one number to scale.
   */
  seasonLengthSeconds: number;
  /**
   * The last season the simulation actually saw. Only ever compared against the
   * derived index, to notice a boundary being crossed.
   */
  seasonIndexSeen: number;
  /** Rings in the trunk: one per winter survived, each `×1.05` on production. */
  rings: number;
  /** Seasons turned and rings laid down since the UI last looked. */
  seasonEvents: SeasonEvent[];
  /** What the sky is doing, and what it is about to do. */
  weather: WeatherScheduler;
  /** Weather that started, ended or was announced since the UI last looked. */
  weatherEvents: WeatherLogEntry[];
  /** Taps banked on the anchor during the storm currently blowing. */
  stormTaps: number;
  /** Leaf-litter piles waiting at the base of the trunk. */
  litter: LitterGround;
  /** Engine time the next autumn pile is due at. */
  nextLitterAt: number;
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
   * Seed Fragments the songbird has dropped. A hundred make a Seed when the
   * tree goes to seed; whatever is left over is carried into the next run.
   */
  seedFragments: number;
  /** Heirlooms bought in the Seed Vault. The one ledger prestige carries over. */
  heirlooms: HeirloomLedger;
  /**
   * Heirloom levels this run has already been handed its run-start grants for.
   *
   * The Vault is spent *after* a prestige, not before it, so a Seedcase bought
   * with the Seed the reset just paid would otherwise sit inert for a whole run
   * — the one purchase every player makes first, appearing to do nothing. This
   * is what lets a purchase top the current run up by the difference instead:
   * `Simulation.grantRunStart` grants `ledger − this` and then records the new
   * levels here. Reset to zero by prestige, because a fresh run has been given
   * nothing yet.
   */
  runStartLevels: Record<string, number>;
  /**
   * Trees that have already gone to seed, oldest first. Each grants +1% to all
   * production and stands as a silhouette on the hills.
   */
  forest: ForestTree[];
  /**
   * The tree the last run ended with, for the Memory heirlooms to rebuild.
   *
   * Kept whether or not Memory is owned: it costs nothing to record, and a
   * player who buys Root Map *after* their third prestige should get the tree
   * they actually left rather than an empty ground and a note apologising.
   */
  memory: TreeMemory | null;
  /** Which creature the Bond heirloom brings, or `null` when none is chosen. */
  bondSymbiont: string | null;
  /** The Go to Seed ceremony currently playing, or `null`. */
  ceremony: Ceremony | null;
  /** Prestiges completed since the UI last looked. */
  prestigeEvents: PrestigeReport[];
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
  /**
   * Seconds the player has actually spent with the game open, across every
   * session of this save.
   *
   * Distinct from `elapsedSeconds`, which is the *tree's* clock and jumps
   * forward on an offline catch-up. This one only ever advances at the rate a
   * person experiences it, which is what makes it the honest answer to "how long
   * have I been playing".
   */
  playtimeSeconds: number;
  /**
   * Features whose gate has been passed, by id.
   *
   * A **latch**, not a reading: `src/engine/progression.ts` measures whether a
   * gate is open, and this remembers that it once was. Pruning unlocks at eight
   * parts and the first thing anyone does with the scissors is cut back to six —
   * a tool that disappeared at that moment would read as the game breaking.
   *
   * Reset by prestige along with everything else it does not carry, exactly as
   * the species unlocks are: they are milestones against *this* run, and a tree
   * that starts with heirlooms re-earns them in seconds.
   */
  features: Set<FeatureId>;
  /** Gates that opened since the UI last looked, in the order they opened. */
  featureEvents: FeatureId[];
  /**
   * Achievements already earned, by id.
   *
   * A **latch**, like `features`, and for a stronger reason: half the table
   * measures something that is true for a moment ("150 parts at once") and false
   * again after the next cut. A Journal card that emptied itself when a player
   * pruned would read as the game taking something back.
   *
   * Carried across prestige — an achievement is a record of what the *player*
   * did, not of what this tree is — which is also why the ten that pay a bonus
   * are republished rather than re-granted on the way into a new run.
   */
  achievements: Set<string>;
  /** Achievements earned since the UI last looked, in the order they landed. */
  achievementEvents: string[];
  /**
   * Storms taken to a full brace, lifetime.
   *
   * Counted at the moment the storm blows out rather than at the twentieth tap,
   * because a brace that was abandoned at nineteen is not a storm held through.
   */
  stormsBraced: number;
  /**
   * Seconds the offline calculator has actually paid out for, cumulatively.
   *
   * The forfeited half of a capped absence is not counted: the claim behind the
   * "slept on it" achievement is that the tree worked for eight hours, and hours
   * past the cap are hours it did not.
   */
  offlineSeconds: number;
  /** What the player has chosen about how the game behaves. */
  settings: GameSettings;
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

/** The sky, as the banner reads it. */
export interface WeatherSnapshot {
  /** The event running now, or `null` for clear skies. */
  readonly active: {
    readonly id: WeatherId;
    /** Engine seconds until it lifts. */
    readonly remainingSeconds: number;
    /** How much of it is left, in `[0, 1]`, for a drain bar. */
    readonly fraction: number;
  } | null;
  /** The event the sky has announced but which has not landed, or `null`. */
  readonly pending: {
    readonly id: WeatherId;
    /** Engine seconds until it lands. */
    readonly inSeconds: number;
  } | null;
  /** The brace minigame, present only while a storm is actually blowing. */
  readonly storm: {
    /** Taps banked on the anchor so far. */
    readonly taps: number;
    /** Taps that count as a full brace. */
    readonly target: number;
    /** How well braced the tree is, in `[0, 1]`. */
    readonly brace: number;
  } | null;
}

/** One leaf-litter pile as the canvas draws it. */
export interface LitterSnapshot {
  readonly id: string;
  /** Position in canonical units either side of the trunk. */
  readonly x: number;
  readonly amount: Decimal;
  /** Engine seconds it formed at, so the canvas can settle it in. */
  readonly spawnedAt: number;
}

/**
 * What one completed prestige did, for the UI to celebrate.
 *
 * Queued rather than flagged on the snapshot, exactly as a season turning is: it
 * is an event, and a flag would replay its card on every frame afterwards.
 */
export interface PrestigeReport {
  /** What the run paid out. */
  readonly yield: SeedYield;
  /** The tree that was given up, as the hills will remember it. */
  readonly tree: ForestTree;
  /** How many trees now stand in the forest, this one included. */
  readonly forestSize: number;
  /** Seeds in hand once the payout landed. */
  readonly seeds: Decimal;
  /** Parts rebuilt from memory on the way into the new run. */
  readonly remembered: number;
}

/** One heirloom's purchase state, resolved against the player's Seeds. */
export interface HeirloomSnapshot {
  readonly id: string;
  readonly level: number;
  /** Seeds the next level costs. */
  readonly cost: Decimal;
  readonly affordable: boolean;
  readonly maxed: boolean;
  /** Whether the node before it on its branch is owned. */
  readonly unlocked: boolean;
}

/** Everything the Seed Vault and the Go to Seed button read. */
export interface PrestigeSnapshot {
  /** How close the tree is to being able to seed. */
  readonly progress: PrestigeProgress;
  /** What going to seed right now would pay. */
  readonly yield: SeedYield;
  /** The ceremony currently playing, or `null`. */
  readonly ceremony: {
    /** How far through it is, in `[0, 1]`. */
    readonly fraction: number;
    /** Engine seconds left before the tree is gone. */
    readonly remainingSeconds: number;
    /** What it will pay when it lands. */
    readonly yield: SeedYield;
  } | null;
  /** Trees standing in the Old Growth forest. */
  readonly forest: readonly ForestTree[];
  /** What that forest multiplies all production by. */
  readonly forestMultiplier: number;
  /** Every heirloom in Vault order, owned or not. */
  readonly heirlooms: readonly HeirloomSnapshot[];
  /** Which creature the Bond heirloom would bring, or `null`. */
  readonly bondSymbiont: string | null;
  /** Whether a bond has been bought at all — the picker is dead without one. */
  readonly bonded: boolean;
  /** Hours of absence the tree currently pays for (STEP 14 spends this). */
  readonly offlineCapHours: number;
  /** Parts the previous tree carried, or `0` when there is nothing remembered. */
  readonly remembered: number;
}

/** One feature gate, as the HUD and the Help tab read it. */
export interface FeatureSnapshot {
  readonly id: FeatureId;
  /** Whether the control may be shown at all. Latched — see `GameState.features`. */
  readonly unlocked: boolean;
  /** Progress toward the gate, in `[0, 1]`. */
  readonly fraction: number;
  /** One line naming what is still needed; empty once it is open. */
  readonly hint: string;
}

/** The mark the scripted opening is currently putting on the tree. */
export interface BeatSnapshot {
  readonly id: string;
  readonly line: string;
  readonly style: BeatStyle;
}

/** The one contextual bubble waiting to be read. */
export interface HintSnapshot {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly anchor: HintAnchor;
}

/** Everything the UI needs to know about what the player has been shown. */
export interface ProgressionSnapshot {
  /** Every gate in table order, latched. */
  readonly features: readonly FeatureSnapshot[];
  /** The open gates, for a one-line `has()` at a call site. */
  readonly unlocked: ReadonlySet<FeatureId>;
  /** The beat whose window is open, or `null`. */
  readonly beat: BeatSnapshot | null;
  /** The next unseen hint whose moment has come, or `null`. */
  readonly hint: HintSnapshot | null;
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
  /** Where the engine is in its year: season, day of season, year number. */
  readonly season: SeasonCycle;
  /** Rings in the trunk — winters survived. */
  readonly rings: number;
  /** What those rings multiply all production by. */
  readonly ringMultiplier: number;
  /** What the sky is doing, and what it is about to do. */
  readonly weather: WeatherSnapshot;
  /** Leaf-litter piles waiting to be swept up. */
  readonly litter: readonly LitterSnapshot[];
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
  /** Maturity, the Seed Vault, the forest and the ceremony. */
  readonly prestige: PrestigeSnapshot;
  /** Seed Fragments banked toward a Seed at prestige. */
  readonly seedFragments: number;
  /** Nuts waiting in the ground for next session. */
  readonly buriedNuts: number;
  /** Totems planted at the tree base, in slot order. */
  readonly totems: readonly string[];
  /** What the tree is made of, and what the player may plant next. */
  readonly species: SpeciesSnapshot;
  /** Which systems are open, where the opening beat is, and what to say next. */
  readonly progression: ProgressionSnapshot;
  /** Lifetime count of successful taps on the tree. */
  readonly clicks: number;
  /** Lifetime count of limbs cut. */
  readonly prunes: number;
  /** Every achievement in table order, earned or not, with its progress. */
  readonly achievements: readonly AchievementSnapshot[];
  /** The numbers the Stats panel reports. */
  readonly stats: StatsSnapshot;
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

/** One achievement, as the Journal draws it. */
export interface AchievementSnapshot {
  readonly id: string;
  readonly earned: boolean;
  /** Progress toward it in `[0, 1]`, and the pair of numbers behind that. */
  readonly fraction: number;
  readonly have: number;
  readonly need: number;
}

/**
 * The Stats panel's whole reading.
 *
 * Deliberately a flat record of counters rather than a view over the state: the
 * panel is a *record of the save*, and half of what it reports (Seeds ever
 * earned, trees given up, badges) survives a prestige that throws the rest away.
 */
export interface StatsSnapshot {
  /** Lifetime gross of every resource, ever earned this run. */
  readonly lifetime: Readonly<Resources>;
  readonly clicks: number;
  readonly prunes: number;
  readonly grafts: number;
  /** Parts standing right now, trunk excluded. */
  readonly parts: number;
  readonly discoveries: number;
  readonly rings: number;
  /** Trees standing in the Old Growth forest — runs completed. */
  readonly trees: number;
  readonly symbionts: number;
  readonly totems: number;
  readonly heirloomLevels: number;
  readonly stormsBraced: number;
  /** Seconds actually spent playing, absences excluded. */
  readonly playtimeSeconds: number;
  /** Seconds the offline calculator has paid out for. */
  readonly offlineSeconds: number;
  readonly achievementsEarned: number;
  readonly achievementsTotal: number;
  /** What the earned badges multiply every rate by. */
  readonly achievementMultiplier: number;
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
    // A new tree sprouts into Spring: the first thing a new save should be told
    // about the year is that growth is cheap right now.
    season: seasonAt(0),
    seasonLengthSeconds: SEASON_LENGTH_SECONDS,
    seasonIndexSeen: 0,
    rings: 0,
    seasonEvents: [],
    weather: new WeatherScheduler(),
    weatherEvents: [],
    stormTaps: 0,
    litter: new LitterGround(),
    nextLitterAt: 0,
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
    heirlooms: new HeirloomLedger(),
    runStartLevels: {},
    forest: [],
    memory: null,
    bondSymbiont: null,
    ceremony: null,
    prestigeEvents: [],
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
    playtimeSeconds: 0,
    features: new Set(),
    featureEvents: [],
    achievements: new Set(),
    achievementEvents: [],
    stormsBraced: 0,
    offlineSeconds: 0,
    settings: DEFAULT_SETTINGS,
  };
}
