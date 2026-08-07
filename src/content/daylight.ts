/**
 * Day/night cycle timings.
 *
 * Only the *shape of time* lives here — how long a day is and where its phases
 * fall. What daylight does to production is the sunlight step's business; this
 * step needs it purely so the sky has something to lerp against.
 */

/** Length of one in-game day, in real seconds. */
export const DAY_LENGTH_SECONDS = 480;

/**
 * Where in the day a brand-new tree sprouts.
 *
 * Mid-morning, with the sun still climbing. Starting at zero would open the
 * game in the dark half of dawn — a cold first impression for a game whose
 * whole register is warm, and a canopy producing nothing on the player's first
 * click. This buys the opening minutes of a new save full daylight.
 */
export const DAY_START_FRACTION = 0.22;

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

/**
 * Fraction of the day at which the sun has set.
 *
 * Daylight rises from zero at `t = 0`, peaks halfway through this window, and
 * returns to zero here, so the curve lines up with the dawn and dusk phases
 * instead of stepping at their boundaries.
 */
export const SUNLIT_FRACTION = 0.62;
