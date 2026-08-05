/** Public surface of the pure game engine (no React imports anywhere here). */
export { GameLoop, TICK_RATE, MS_PER_TICK, MAX_FRAME_MS, type LoopCallbacks } from './loop';
export { Simulation } from './simulation';
export { gameStore, type GameStoreState } from './store';
export { formatNumber } from './format';
export {
  createInitialState,
  type GameState,
  type GameSnapshot,
  type Resources,
  type DebugStats,
} from './types';
