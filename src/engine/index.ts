/** Public surface of the pure game engine (no React imports anywhere here). */
export { GameLoop, TICK_RATE, MS_PER_TICK, MAX_FRAME_MS, type LoopCallbacks } from './loop';
export { Simulation, type ClickOutcome, type PruneResult, type TickOptions } from './simulation';
export { gameStore, type GameStoreState } from './store';
export { formatNumber } from './format';
export { ResourceRegistry, type ResourceEntry } from './resourceRegistry';
export {
  ModifierSet,
  applyModifiers,
  type Modifier,
  type ModifierType,
  type ModifierTargetKind,
} from './modifiers';
export { computeProduction, computeResourceRate, type Producer } from './economy';
export {
  BARREN_SOIL,
  canonicalYAt,
  createSoilMap,
  depthAt,
  depthMultiplier,
  soilConditionsAt,
  stratumAt,
  veinAt,
  type MineralVein,
  type SoilConditions,
  type SoilMap,
} from './soil';
export {
  HYDRATION_SOURCE,
  computeHydration,
  hydrationModifiers,
  waterNeed,
  type HydrationState,
} from './hydration';
export { enableTestProducers, disableTestProducers } from './debugProducers';
export { createSeededRandom, type RandomSource } from './rng';
export {
  distanceToSegment,
  hitTestSegments,
  nearestSegment,
  type Segment,
  type Vec2,
} from './geometry';
export {
  projectPoint,
  projectSegment,
  projectTree,
  treeBounds,
  type ScreenSegment,
  type TreeBounds,
  type TreeLayout,
  type TreeSegment,
} from './tree';
export {
  TreeGraph,
  computePlacements,
  placeChild,
  placeOption,
  DEFAULT_SPECIES_ID,
  DEFAULT_TREE_SEED,
  ROOT_DIRECTION,
  TRUNK_DIRECTION,
  type GrowthOption,
  type NodePlacement,
  type TreeGraphData,
  type TreeNode,
} from './treeGraph';
export {
  NO_PART_CONTEXT,
  partCost,
  partProducer,
  partProducerId,
  partProductionDelta,
  priceGrowthOption,
  priceGrowthOptions,
  type PartContext,
  type PricedGrowthOption,
  type ProductionDelta,
} from './growth';
export {
  DAYLIGHT_SOURCE,
  EMPTY_CANOPY,
  MAX_COUNTED_OCCLUDERS,
  blossomBoost,
  canopyIndex,
  computeLeafExposures,
  daylightModifiers,
  exposureAt,
  lightFactorAt,
  occludes,
  shadeFactor,
  type CanopyIndex,
  type CanopyLeaf,
  type LeafExposure,
} from './light';
export { dayCycle, dayFraction, daylightAt, phaseAt, type DayCycle } from './daylight';
export {
  RING_SOURCE,
  SEASON_SOURCE,
  absoluteSeasonIndex,
  ringModifiers,
  ringMultiplier,
  ringsEarnedBetween,
  seasonAt,
  seasonDefAt,
  seasonModifiers,
  type SeasonCycle,
  type SeasonEvent,
} from './seasons';
export {
  MAX_WEATHER_STEPS,
  WEATHER_SOURCE,
  WeatherScheduler,
  braceFraction,
  chooseSnappedLimbs,
  eligibleWeather,
  isWideLimb,
  limbDeviation,
  pickWeather,
  snapChance,
  weatherGap,
  weatherModifiers,
  wideLimbs,
  type ActiveWeather,
  type PendingWeather,
  type StormReport,
  type WeatherEvent,
  type WeatherLogEntry,
} from './weather';
export { LitterGround, litterAmount, litterPosition, type LitterPile } from './litter';
export {
  COMBO_BONUS_AT_FULL,
  COMBO_BONUS_PER_STACK,
  COMBO_DECAY_MS,
  COMBO_FULL_STACKS,
  COMBO_WINDOW_MS,
  comboDecayFactor,
  comboFill,
  comboMultiplier,
  comboStacksAt,
  createComboState,
  registerComboClick,
  type ComboState,
} from './combo';
export {
  BASE_CLICK_STATS,
  CLICK_STAT_TAG,
  CLICK_TOLERANCE_PX,
  resolveClick,
  resolveClickStats,
  type ClickResult,
  type ClickStats,
} from './clicker';
export { UpgradeLedger, isMaxed, upgradeCost, upgradeModifiers, upgradeSource } from './upgrades';
export { BuffLedger, buffModifiers, buffSource, type ActiveBuff } from './buffs';
export {
  APICAL_EPSILON,
  apexHeight,
  deadwoodFor,
  isPrunable,
  quotePrune,
  rebuildCostOfType,
  woodVolume,
  type PruneQuote,
  type ResourceAmount,
} from './prune';
export { TOTEM_SOURCE, hasFreeSlot, totemCost, totemModifiers } from './totems';
export {
  createInitialState,
  type GameState,
  type GameSnapshot,
  type BuffSnapshot,
  type ComboSnapshot,
  type HydrationSnapshot,
  type LeafLight,
  type LitterSnapshot,
  type UpgradeSnapshot,
  type Resources,
  type DebugStats,
  type WeatherSnapshot,
} from './types';
