/**
 * Day/night cycle timings.
 *
 * Only the *shape of time* lives here — how long a day is and where its phases
 * fall. What daylight does to production is the sunlight step's business; this
 * step needs it purely so the sky has something to lerp against.
 */

/**
 * How long a day is and where the tree wakes up in it.
 *
 * Both are tunable, so both live in `./balance`; they are re-exported here
 * because "the length of a day" belongs to the day/night module as far as every
 * reader of it is concerned.
 *
 * `DAY_START_FRACTION` is mid-morning with the sun still climbing. Starting at
 * zero would open the game in the dark half of dawn — a cold first impression
 * for a game whose whole register is warm, and a canopy producing nothing on the
 * player's first click.
 */
export { DAY_LENGTH_SECONDS, DAY_START_FRACTION, SUNLIT_FRACTION } from './balance';

/** Named quarters of the day, in the order they occur. */
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

/**
 * Where each phase ends, as a fraction of the day.
 *
 * Read as ranges: dawn `[0, 0.12)`, day `[0.12, 0.50)`, dusk `[0.50, 0.62)`,
 * night `[0.62, 1)`. Daytime is the longest stretch by design — the canopy is
 * the active half of the game and should not spend most of its time asleep.
 */
export const PHASE_ENDS: readonly { readonly phase: DayPhase; readonly until: number }[] = [
  { phase: 'dawn', until: 0.12 },
  { phase: 'day', until: 0.5 },
  { phase: 'dusk', until: 0.62 },
  { phase: 'night', until: 1 },
] as const;

/*
 * `SUNLIT_FRACTION` (re-exported above) is the fraction of the day at which the
 * sun has set. Daylight rises from zero at `t = 0`, peaks halfway through that
 * window, and returns to zero there, so the curve lines up with the dawn and
 * dusk phases instead of stepping at their boundaries.
 */
