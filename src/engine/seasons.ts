import { EPSILON } from '../content/units';
import Decimal from 'break_infinity.js';
import { RING_PRODUCTION_BONUS, SEASON_LENGTH_SECONDS, SEASONS_PER_YEAR } from '../content/balance';
import { DAY_LENGTH_SECONDS } from '../content/daylight';
import { RESOURCE_IDS } from '../content/resources';
import { SEASONS, type SeasonDef, type SeasonId } from '../content/seasons';
import type { Modifier } from './modifiers';

/**
 * The year.
 *
 * Which season it is is a **pure function of elapsed simulation time**, exactly
 * as the hour of the day is: no state, no clock reads, so the renderer, the
 * tooltips and STEP 14's offline calculator all agree on what month it is by
 * asking the same question of the same number. The only thing the simulation has
 * to remember is which season it last *saw*, and that is only so it can notice a
 * boundary being crossed.
 *
 * Rings are the exception, and deliberately: a ring is a permanent record of a
 * winter that was lived through, so it is stored rather than derived. Deriving
 * it from elapsed time would mean prestige (STEP 13, which keeps Rings and
 * resets everything else) had nowhere to keep it.
 */

/** Source id the current season's modifiers are granted under. */
export const SEASON_SOURCE = 'season';

/** Source id the trunk's rings are granted under. */
export const RING_SOURCE = 'rings';

/** Where the year is, and how far through it. */
export interface SeasonCycle {
  /** Seasons elapsed since the tree sprouted — it counts up forever. */
  readonly index: number;
  readonly id: SeasonId;
  readonly def: SeasonDef;
  /** Position of this season within its year, `0` for Spring. */
  readonly ordinal: number;
  /** Progress through the season, in `[0, 1)`. */
  readonly t: number;
  /** Which day of the season it is, counting from 1. */
  readonly day: number;
  /** How many days this season runs for. */
  readonly days: number;
  /** Engine seconds until the season turns. */
  readonly secondsRemaining: number;
  /** Whole years elapsed, starting at 0. */
  readonly year: number;
}

/**
 * Something the year just did, for the UI to react to.
 *
 * Queued rather than flagged on the snapshot: a season turning and a ring being
 * laid down are *events*, and a flag would re-fire their toast on every frame
 * until the next one came along.
 */
export type SeasonEvent =
  | { readonly kind: 'season'; readonly id: SeasonId; readonly index: number }
  /** A winter came through. `rings` is how many were owed, `total` the new count. */
  | { readonly kind: 'ring'; readonly rings: number; readonly total: number };

/** Seasons elapsed at a point in engine time. Never negative. */
export function absoluteSeasonIndex(
  elapsedSeconds: number,
  seasonLengthSeconds: number = SEASON_LENGTH_SECONDS,
): number {
  const length = Math.max(EPSILON, seasonLengthSeconds);
  return Math.floor(Math.max(0, elapsedSeconds) / length);
}

/**
 * Resolve elapsed time into a full {@link SeasonCycle}.
 *
 * `seasonLengthSeconds` is a parameter rather than a constant so a test can run
 * a whole year in milliseconds — and so the Tempo heirloom (STEP 13, "seasons
 * 10% shorter") has a number to scale rather than a definition to rewrite. It
 * lives on `GameState`, which is what the simulation passes here.
 */
export function seasonAt(
  elapsedSeconds: number,
  seasonLengthSeconds: number = SEASON_LENGTH_SECONDS,
): SeasonCycle {
  const length = Math.max(EPSILON, seasonLengthSeconds);
  const elapsed = Math.max(0, elapsedSeconds);

  const index = Math.floor(elapsed / length);
  const ordinal = ((index % SEASONS_PER_YEAR) + SEASONS_PER_YEAR) % SEASONS_PER_YEAR;
  const def = SEASONS[ordinal];
  const t = (elapsed - index * length) / length;
  const days = Math.max(1, Math.round(length / DAY_LENGTH_SECONDS));

  return {
    index,
    id: def.id,
    def,
    ordinal,
    t,
    // Clamped: a fractional season length can put `t` a hair under 1 and still
    // round the day past the end of the season.
    day: Math.min(days, Math.floor(t * days) + 1),
    days,
    secondsRemaining: length * (1 - t),
    year: Math.floor(index / SEASONS_PER_YEAR),
  };
}

/** The definition in force at a point in engine time. */
export function seasonDefAt(
  elapsedSeconds: number,
  seasonLengthSeconds: number = SEASON_LENGTH_SECONDS,
): SeasonDef {
  return seasonAt(elapsedSeconds, seasonLengthSeconds).def;
}

/**
 * How many rings are owed for the seasons in `[fromIndex, toIndex)`.
 *
 * A winter counts once the year has moved *past* it — being in the middle of one
 * earns nothing, which is what "surviving a full winter" means. Counting the
 * whole span rather than one per call is what makes this correct for a 100 ms
 * tick and for an offline jump of a week alike: the roots kept working while the
 * tab was shut, and the tree was every bit as alive for it.
 */
export function ringsEarnedBetween(fromIndex: number, toIndex: number): number {
  const from = Math.max(0, Math.floor(fromIndex));
  const to = Math.floor(toIndex);
  if (to <= from) return 0;

  let rings = 0;
  for (let index = from; index < to; index += 1) {
    if (SEASONS[index % SEASONS_PER_YEAR].earnsRing) rings += 1;
  }
  return rings;
}

/** The modifiers a season stands over the whole tree, under one revocable source. */
export function seasonModifiers(def: SeasonDef): Modifier[] {
  return def.effects.map((effect, i) => ({
    id: `season:${def.id}:${i}`,
    source: SEASON_SOURCE,
    type: effect.type,
    targetKind: effect.targetKind,
    target: effect.target,
    value: effect.value,
  }));
}

/** What `rings` are worth on everything the tree produces: `1.05ⁿ`. */
export function ringMultiplier(rings: number): number {
  return Math.pow(1 + RING_PRODUCTION_BONUS, Math.max(0, Math.floor(rings)));
}

/**
 * The rings as modifiers: one `mul` per resource, all under one source.
 *
 * Per *resource* rather than per tag, because "all production" has to mean all
 * of it — a future producer that forgets to carry a tag would quietly opt out of
 * a bonus the player earned by surviving a winter.
 */
export function ringModifiers(rings: number): Modifier[] {
  const count = Math.max(0, Math.floor(rings));
  if (count === 0) return [];

  const value = new Decimal(ringMultiplier(count));
  return RESOURCE_IDS.map((resource) => ({
    id: `rings:${resource}`,
    source: RING_SOURCE,
    type: 'mul' as const,
    targetKind: 'resource' as const,
    target: resource,
    value,
  }));
}
