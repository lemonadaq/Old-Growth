/** Public surface of the pure game engine (no React imports anywhere here). */
export { GameLoop, TICK_RATE, MS_PER_TICK, MAX_FRAME_MS, type LoopCallbacks } from './loop';
export { Simulation } from './simulation';
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
export { computeProduction, type Producer } from './economy';
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
  partCost,
  partProducer,
  partProducerId,
  partProductionDelta,
  priceGrowthOption,
  priceGrowthOptions,
  type PricedGrowthOption,
  type ProductionDelta,
} from './growth';
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
export {
  createInitialState,
  type GameState,
  type GameSnapshot,
  type ComboSnapshot,
  type UpgradeSnapshot,
  type Resources,
  type DebugStats,
} from './types';
