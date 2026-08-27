import { DAY_LENGTH_SECONDS } from './daylight';

/**
 * The knobs behind the year.
 *
 * Seasons, weather and the Ring are one system with a lot of numbers in it, and
 * the numbers are the part that will move most: how long a season runs, how
 * often it rains, how much a winter is worth. They live here, in one place, so
 * a balance pass (STEP 19) is an edit to this file rather than a hunt through
 * four modules — and so the Tempo heirloom (STEP 13, "seasons 10% shorter") has
 * one number to scale rather than a definition to rewrite.
 *
 * Layer note: content stays free of engine imports. Durations are in **engine
 * seconds** throughout, the same clock buffs and symbiont cadences run on, so
 * none of it can be waited out by closing the tab.
 */

/* ------------------------------------------------------------------ seasons */

/** Engine days each season runs for. */
export const SEASON_LENGTH_DAYS = 20;

/** Length of one season in engine seconds. */
export const SEASON_LENGTH_SECONDS = SEASON_LENGTH_DAYS * DAY_LENGTH_SECONDS;

/** Seasons in a year — the length of the `SEASONS` table, restated as a number. */
export const SEASONS_PER_YEAR = 4;

/** Length of a full year in engine seconds. */
export const YEAR_LENGTH_SECONDS = SEASON_LENGTH_SECONDS * SEASONS_PER_YEAR;

/** Growth discount in Spring: prices are multiplied by `1 - this`. */
export const SPRING_GROWTH_DISCOUNT = 0.2;

/** Light bonus in Summer. */
export const SUMMER_LIGHT_BONUS = 0.3;

/**
 * How much Winter takes off the canopy and how much dearer it makes growing.
 *
 * The design line is "Light and growth −60%". Light is the plain reading: the
 * canopy earns 40% of what it would. Growth cannot be, because Spring already
 * spends "−20%" on making growth *cheaper* — a winter that discounted prices
 * further would be a reward for the hardest season in the game. So winter's
 * −60% is the same axis in the opposite direction: growth costs ×1.6.
 */
export const WINTER_PENALTY = 0.6;

/* -------------------------------------------------------------------- rings */

/**
 * What surviving one full winter is permanently worth: `×1.05` on all
 * production, compounding with every ring the trunk carries.
 *
 * A ring is the only permanent multiplier in the game that cannot be bought,
 * only outlasted — which is what makes the worst season worth sitting through
 * rather than worth logging off for.
 */
export const RING_PRODUCTION_BONUS = 0.05;

/* ------------------------------------------------------------- leaf litter */

/** Engine seconds between leaf-litter piles forming at the base in Autumn. */
export const LITTER_INTERVAL_SECONDS = 20;

/**
 * Most piles allowed on the ground at once.
 *
 * A cap is what keeps autumn a *rhythm* — sweep the base every so often — rather
 * than a chore that accumulates while the player is looking at their roots.
 */
export const LITTER_MAX_PILES = 6;

/** Leaf Litter one pile carries, per leaf cluster in the canopy. */
export const LITTER_PER_LEAF = 0.8;

/** Smallest pile worth drawing: a bare tree still sheds *something*. */
export const LITTER_MIN_AMOUNT = 1;

/** Half-width of the band piles land in, in canonical units either side of the trunk. */
export const LITTER_SPREAD = 0.42;

/* ------------------------------------------------------------------ weather */

/** Shortest gap between the end of one weather event and the start of the next. */
export const WEATHER_MIN_GAP_SECONDS = 150;

/** Longest such gap. */
export const WEATHER_MAX_GAP_SECONDS = 420;

/**
 * How far ahead an event announces itself.
 *
 * Ten seconds of gathering sky and a rising note is the whole point of the storm
 * minigame: bracing is only a decision if the player is told in time to make it.
 */
export const WEATHER_TELEGRAPH_SECONDS = 10;

/** How long the rain lasts, and what it does to Water while it falls. */
export const RAIN_DURATION_SECONDS = 90;
export const RAIN_WATER_MULTIPLIER = 3;

/** How long a storm blows, which is also the length of the brace window. */
export const STORM_DURATION_SECONDS = 15;

/** Taps on the anchor that count as a full brace. */
export const STORM_BRACE_TAPS = 20;

/** Chance an unbraced wide limb snaps. A full brace takes this to zero. */
export const STORM_SNAP_CHANCE = 0.4;

/**
 * Hard ceiling on limbs lost to one storm.
 *
 * The design says "never destroys more than 2 limbs", and it is load-bearing: a
 * storm that could take a canopy apart would make the game about being present
 * for the weather, which is the opposite of what an idle game is for.
 */
export const STORM_MAX_SNAPS = 2;

/**
 * How far off vertical a limb has to lean before the wind can get under it, in
 * degrees. A limb reaching out sideways is the one that snaps; the leader,
 * pointing into the wind, is not.
 */
export const STORM_WIDE_DEGREES = 45;

/** How long a drought runs, and what it leaves of Water income while it does. */
export const DROUGHT_DURATION_SECONDS = 120;
export const DROUGHT_WATER_MULTIPLIER = 0.3;
