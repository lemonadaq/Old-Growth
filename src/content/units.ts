/**
 * Conversions between the units the game is written in.
 *
 * Not balance — nobody tunes the number of degrees in a radian — but not magic
 * either, and `scripts/check-magic-numbers.mjs` cannot tell the difference. A
 * named constant is the honest way to say "this 180 is geometry, not a knob",
 * and it means the engine's angle maths reads as arithmetic rather than as
 * something a designer forgot to move.
 */

/**
 * The smallest difference the engine treats as a difference.
 *
 * Used as a guard on divisions whose denominator is a duration or a goal the
 * caller may legitimately have set to zero, and as the tolerance on the
 * apical-dominance height comparison. One name, so a reader never has to decide
 * whether two `1e-9`s in different files mean the same thing.
 */
export const EPSILON = 1e-9;

/** Radians in one degree. Multiply degrees by this to get radians. */
export const RADIANS_PER_DEGREE = Math.PI / 180;

/** Degrees in one radian. */
export const DEGREES_PER_RADIAN = 180 / Math.PI;

/** Seconds in one hour, for the handful of places that quote a cap in hours. */
export const SECONDS_PER_HOUR = 3600;

/** Seconds in one minute. */
export const SECONDS_PER_MINUTE = 60;

/** Minutes in one hour. */
export const MINUTES_PER_HOUR = 60;

/** Milliseconds in one second. */
export const MS_PER_SECOND = 1000;
