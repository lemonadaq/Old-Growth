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
export {
  buildTreeGraph,
  collectVisibleNodes,
  limbPointAt,
  limbTangentAt,
  limbWidthAt,
  visibleNodes,
  type LeafBlob,
  type LeafNode,
  type LimbNode,
  type NodeKind,
  type TreeGraph,
  type TreeNode,
} from './treeGraph';
export {
  DAY_LENGTH_SECONDS,
  START_PHASE,
  dayPeriod,
  dayPhase,
  daylight,
  type DayPeriod,
} from './timeOfDay';
export { Rng, hashString } from './rng';
export {
  boundsOfPoints,
  clamp,
  expandRect,
  lerp,
  rectsIntersect,
  unionRect,
  type Rect,
  type Vec2,
} from './geometry';
export {
  createInitialState,
  type GameState,
  type GameSnapshot,
  type Resources,
  type DebugStats,
} from './types';
