import { useStore } from 'zustand';
import { gameStore, type GameStoreState } from '../engine/store';

/**
 * React binding for the vanilla engine store. Components pass a selector so they
 * only re-render when the slice they care about changes.
 */
export function useGameStore<T>(selector: (state: GameStoreState) => T): T {
  return useStore(gameStore, selector);
}
