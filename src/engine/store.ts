import { createStore } from 'zustand/vanilla';
import { createInitialState } from './types';
import { Simulation } from './simulation';
import type { DebugStats, GameSnapshot } from './types';

/**
 * The engine ↔ UI bridge.
 *
 * A **vanilla** Zustand store (no React dependency, keeping the engine layer
 * framework-free). The engine writes the latest snapshot + debug stats; React
 * components subscribe with the `useStore` hook in the UI layer.
 */
export interface GameStoreState {
  snapshot: GameSnapshot;
  stats: DebugStats;
  setSnapshot: (snapshot: GameSnapshot) => void;
  setStats: (stats: DebugStats) => void;
}

function initialSnapshot(): GameSnapshot {
  return new Simulation(createInitialState()).snapshot();
}

export const gameStore = createStore<GameStoreState>((set) => ({
  snapshot: initialSnapshot(),
  stats: { fps: 0, tps: 0 },
  setSnapshot: (snapshot) => set({ snapshot }),
  setStats: (stats) => set({ stats }),
}));
