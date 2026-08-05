/**
 * A tiny, deterministic, seedable PRNG (mulberry32).
 *
 * The tree model draws small angle jitter from this so that replaying the same
 * action log yields byte-identical geometry. The full generator state is a
 * single 32-bit integer, which makes it trivial to serialize alongside the
 * graph and resume growth deterministically after a save/load round-trip.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Next pseudo-random float in the half-open interval `[0, 1)`. */
  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Current internal state as an unsigned 32-bit integer (serializable). */
  getState(): number {
    return this.state >>> 0;
  }

  /** Restore a previously captured {@link getState} value. */
  setState(state: number): void {
    this.state = state >>> 0;
  }

  /** Reconstruct a generator sitting at a previously captured state. */
  static fromState(state: number): SeededRng {
    const rng = new SeededRng(0);
    rng.setState(state);
    return rng;
  }
}
