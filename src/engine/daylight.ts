import {
  DAY_LENGTH_SECONDS,
  DAY_START_FRACTION,
  PHASE_ENDS,
  SUNLIT_FRACTION,
  type DayPhase,
} from '../content/daylight';

/**
 * Engine time of day.
 *
 * A pure function of elapsed simulation time: no state, no clock reads, so the
 * renderer, the tooltips and (later) the offline calculator all agree on what
 * hour it is by asking the same question of the same number.
 */

/** Where the game is in its day. */
export interface DayCycle {
  /** Position within the current day, in `[0, 1)`. */
  readonly t: number;
  /** Which named phase `t` falls in. */
  readonly phase: DayPhase;
  /**
   * How much sun is on the canopy, in `[0, 1]` — zero all night, peaking at
   * midday. A smooth curve rather than a step, so the sky has no seams.
   */
  readonly daylight: number;
  /** Whole days elapsed since the tree sprouted, starting at 0. */
  readonly dayNumber: number;
}

/**
 * Position within the current day, in `[0, 1)`.
 *
 * Offset by {@link DAY_START_FRACTION}, so a new save opens in the morning
 * rather than in the dark.
 */
export function dayFraction(elapsedSeconds: number): number {
  const t = (elapsedSeconds / DAY_LENGTH_SECONDS + DAY_START_FRACTION) % 1;
  // A negative elapsed time should never reach here, but `%` would keep the
  // sign and hand the renderer an out-of-range fraction if it did.
  return t < 0 ? t + 1 : t;
}

/** The phase a day fraction falls in. */
export function phaseAt(t: number): DayPhase {
  for (const { phase, until } of PHASE_ENDS) {
    if (t < until) return phase;
  }
  return PHASE_ENDS[PHASE_ENDS.length - 1].phase;
}

/**
 * Sun strength at a day fraction, in `[0, 1]`.
 *
 * Half a sine over the lit part of the day: zero at first light, one at midday,
 * zero again at nightfall. The sine is what keeps dawn and dusk feeling like
 * transitions rather than switches.
 */
export function daylightAt(t: number): number {
  if (t >= SUNLIT_FRACTION) return 0;
  return Math.sin((t / SUNLIT_FRACTION) * Math.PI);
}

/** Resolve elapsed simulation time into a full {@link DayCycle}. */
export function dayCycle(elapsedSeconds: number): DayCycle {
  const t = dayFraction(elapsedSeconds);
  return {
    t,
    phase: phaseAt(t),
    daylight: daylightAt(t),
    // Counts wraps of `t`, not of raw elapsed time, so the day number ticks
    // over at the same moment the sky does.
    dayNumber: Math.floor(Math.max(0, elapsedSeconds) / DAY_LENGTH_SECONDS + DAY_START_FRACTION),
  };
}
