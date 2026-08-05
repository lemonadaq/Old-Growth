/**
 * Tiny deterministic PRNG (mulberry32).
 *
 * Procedural detail — leaf blob offsets, sway phases — must be stable across
 * reloads and identical for the same tree on every machine, so it is generated
 * from an explicit seed rather than `Math.random()`. Cheap, seedable, and good
 * enough for decoration.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Force to a non-zero 32-bit integer state.
    this.state = (Math.trunc(seed) || 1) >>> 0;
  }

  /** Next float in `[0, 1)`. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Next float in `[min, max)`. */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Next integer in `[min, max]` (inclusive). */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

/** Stable 32-bit hash of a string, used to seed {@link Rng} from node ids. */
export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
