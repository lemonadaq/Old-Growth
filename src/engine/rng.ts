/**
 * Deterministic pseudo-random numbers.
 *
 * Game logic that rolls dice (crits, procedural tree jitter) takes a
 * {@link RandomSource} so tests can inject a fixed sequence instead of relying
 * on `Math.random`. Kept framework-free like the rest of the engine.
 */

/** Returns a float in `[0, 1)`. `Math.random` satisfies this. */
export type RandomSource = () => number;

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG. Same seed always
 * yields the same sequence, which keeps procedural generation reproducible.
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
