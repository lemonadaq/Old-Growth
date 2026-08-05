/**
 * Engine time-of-day.
 *
 * A full day/night cycle runs in {@link DAY_LENGTH_SECONDS} of simulated time.
 * The engine only owns the *phase*; the renderer maps that phase onto sky
 * colors, and later systems (photosynthesis rates, night-only symbionts) can
 * read the same number.
 *
 * Phase is a fraction of the day in `[0, 1)`:
 * `0` = midnight, `0.25` = sunrise, `0.5` = noon, `0.75` = sunset.
 */

/** Simulated seconds in one full day/night cycle. */
export const DAY_LENGTH_SECONDS = 240;

/** Phase a fresh game starts at — mid-morning, so the demo opens in daylight. */
export const START_PHASE = 0.36;

/** Named stretches of the cycle, for systems that want coarse buckets. */
export type DayPeriod = 'night' | 'dawn' | 'day' | 'dusk';

/** Day phase in `[0, 1)` for a given amount of simulated time. */
export function dayPhase(elapsedSeconds: number): number {
  const phase = (START_PHASE + elapsedSeconds / DAY_LENGTH_SECONDS) % 1;
  return phase < 0 ? phase + 1 : phase;
}

/** Coarse period for a phase in `[0, 1)`. */
export function dayPeriod(phase: number): DayPeriod {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.2 || p >= 0.85) return 'night';
  if (p < 0.32) return 'dawn';
  if (p < 0.72) return 'day';
  return 'dusk';
}

/**
 * How lit the world is, `0` at deep night through `1` at noon. Used by the
 * renderer to dim the scene, and available to future light production.
 */
export function daylight(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  // Cosine wave peaking at noon (0.5), floored at zero through the night.
  return Math.max(0, -Math.cos(p * Math.PI * 2) * 0.5 + 0.5) ** 1.2;
}
