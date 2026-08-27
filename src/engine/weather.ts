import type Decimal from 'break_infinity.js';
import {
  STORM_BRACE_TAPS,
  STORM_MAX_SNAPS,
  STORM_SNAP_CHANCE,
  STORM_WIDE_DEGREES,
  WEATHER_MAX_GAP_SECONDS,
  WEATHER_MIN_GAP_SECONDS,
  WEATHER_TELEGRAPH_SECONDS,
} from '../content/balance';
import { WEATHERS, WEATHER_BY_ID, type WeatherDef, type WeatherId } from '../content/weather';
import type { Modifier } from './modifiers';
import type { RandomSource } from './rng';
import type { NodePlacement, TreeGraph, TreeNode } from './treeGraph';

/**
 * Weather: the events that interrupt the year.
 *
 * The scheduler is a small state machine on three fields — what is running, what
 * has been announced, and when to roll again — and it advances on **engine
 * seconds** like buffs and symbiont cadences, so weather cannot be waited out by
 * closing the tab.
 *
 * Two things it does not do, both on purpose:
 *
 * - It never reaches for a clock or a global RNG. Time and randomness are both
 *   arguments, which is what makes a whole year of weather reproducible in a
 *   test from one seed.
 * - It knows nothing about the tree. A storm's damage is resolved by the
 *   {@link Simulation} out of the pure helpers at the bottom of this file, so the
 *   scheduler stays plain, serialisable bookkeeping.
 *
 * **Storms are online-only**, and the rule is enforced twice: a storm is never
 * drawn while `allowStorm` is false, and one that was already announced is
 * *dropped* rather than run if the player leaves before it lands. A minigame
 * nobody was present for is not a minigame — it is damage taken while the tab
 * was shut.
 */

/** Source id every weather modifier is granted under. */
export const WEATHER_SOURCE = 'weather';

/**
 * Most transitions one {@link WeatherScheduler.update} may resolve.
 *
 * An ordinary 100 ms tick resolves at most one. The bound exists for the other
 * caller: STEP 14 can hand this a jump of hours, and the honest answer there is
 * "replay the schedule, up to a sane limit" rather than a loop whose length is
 * decided by how long the player was away.
 */
export const MAX_WEATHER_STEPS = 64;

/** A weather event that is currently running. */
export interface ActiveWeather {
  readonly id: WeatherId;
  /** Engine seconds it began at. */
  readonly startedAt: number;
  /** Engine seconds it ends at. */
  readonly endsAt: number;
}

/** A weather event that has been announced but has not landed yet. */
export interface PendingWeather {
  readonly id: WeatherId;
  /** Engine seconds it lands at. */
  readonly startsAt: number;
}

/** Something the weather just did, for the UI to react to. */
export interface WeatherEvent {
  /** `telegraph` when the sky turns, `start` when it lands, `end` when it lifts. */
  readonly kind: 'telegraph' | 'start' | 'end';
  readonly id: WeatherId;
  /** Engine seconds it happened at — which may be a little before `now`. */
  readonly at: number;
}

/** What one storm did to the tree. */
export interface StormReport {
  /** Taps banked on the anchor. */
  readonly taps: number;
  /** How well braced the tree was, in `[0, 1]`. */
  readonly brace: number;
  /** Wide limbs that were exposed to the wind. */
  readonly exposed: number;
  /** Ids of the limbs that snapped, cut node first. */
  readonly snapped: readonly string[];
  /** Deadwood the wreckage yielded. */
  readonly deadwood: Decimal;
}

/** A weather event as the simulation records it, with a storm's outcome attached. */
export interface WeatherLogEntry extends WeatherEvent {
  /** Present on the `end` of a storm, and nowhere else. */
  readonly storm?: StormReport;
}

/** The modifiers an event stands while it runs, under one revocable source. */
export function weatherModifiers(def: WeatherDef): Modifier[] {
  return def.effects.map((effect, i) => ({
    id: `weather:${def.id}:${i}`,
    source: WEATHER_SOURCE,
    type: effect.type,
    targetKind: effect.targetKind,
    target: effect.target,
    value: effect.value,
  }));
}

/** Events that may be drawn right now. Storms are out while the player is away. */
export function eligibleWeather(allowStorm: boolean): readonly WeatherDef[] {
  return allowStorm ? WEATHERS : WEATHERS.filter((def) => !def.onlineOnly);
}

/** Draw one event by weight from those eligible. */
export function pickWeather(random: RandomSource, allowStorm = true): WeatherId {
  const pool = eligibleWeather(allowStorm);
  const total = pool.reduce((sum, def) => sum + def.weight, 0);

  let cursor = random() * total;
  for (const def of pool) {
    cursor -= def.weight;
    if (cursor < 0) return def.id;
  }
  return pool[pool.length - 1].id;
}

/** How long the scheduler waits before announcing the next event. */
export function weatherGap(random: RandomSource): number {
  return WEATHER_MIN_GAP_SECONDS + random() * (WEATHER_MAX_GAP_SECONDS - WEATHER_MIN_GAP_SECONDS);
}

/**
 * What the sky is doing and what it is about to do.
 *
 * Holds no modifiers of its own — {@link Simulation} owns granting and revoking
 * them, as it does for buffs and symbionts.
 */
export class WeatherScheduler {
  private running: ActiveWeather | null = null;
  private announced: PendingWeather | null = null;

  /**
   * Engine time the next event is announced at.
   *
   * A new save opens on a fixed quiet spell rather than a rolled one, so the
   * first minutes of a game are the same for everybody — and so constructing the
   * scheduler needs no RNG.
   */
  private rollAt = WEATHER_MIN_GAP_SECONDS;

  /** The event currently running, or `null`. */
  get active(): ActiveWeather | null {
    return this.running;
  }

  /** The event announced but not yet landed, or `null`. */
  get pending(): PendingWeather | null {
    return this.announced;
  }

  /** Engine time the next roll is due at. */
  get nextRollAt(): number {
    return this.rollAt;
  }

  /**
   * Put the sky back the way a save left it.
   *
   * The schedule is restored rather than re-rolled, so a player who saves during
   * a rain comes back into that rain with the right amount of it left. A roll
   * time in the past is pulled forward to `now`: a save loaded a week later must
   * not owe a week of weather, and `update` would otherwise spend its whole step
   * budget catching one up.
   */
  restore(
    active: ActiveWeather | null,
    pending: PendingWeather | null,
    nextRollAt: number,
    now = 0,
  ): void {
    this.running = active ? { ...active } : null;
    this.announced = pending ? { ...pending } : null;
    this.rollAt = Math.max(nextRollAt, now);
  }

  /**
   * Advance the sky to `now`, returning everything that happened on the way.
   *
   * Each transition is timestamped with the moment it was *due* rather than with
   * `now`, so a long jump replays the schedule on its own timeline instead of
   * bunching every event onto the first tick back.
   *
   * `allowStorm` false lets everything but the storm land — the storm is a
   * minigame, and one that blew unwatched is only damage. `allowAny` false
   * suppresses the sky entirely, which is what STEP 14's offline catch-up passes:
   * a drought nobody could react to is a bill for having closed the tab. Weather
   * already *running* when the player left still ends normally either way; only
   * what has yet to land is skipped, and the schedule rolls on rather than
   * queueing a backlog to dump on the first tick back.
   */
  update(now: number, random: RandomSource, allowStorm = true, allowAny = true): WeatherEvent[] {
    const events: WeatherEvent[] = [];

    for (let step = 0; step < MAX_WEATHER_STEPS; step += 1) {
      if (this.running && now >= this.running.endsAt) {
        const ended = this.running;
        this.running = null;
        this.rollAt = ended.endsAt + weatherGap(random);
        events.push({ kind: 'end', id: ended.id, at: ended.endsAt });
        continue;
      }

      if (this.announced && now >= this.announced.startsAt) {
        const pending = this.announced;
        const def = WEATHER_BY_ID[pending.id];
        this.announced = null;

        if (!allowAny || (def.onlineOnly && !allowStorm)) {
          // The player left between the warning and the gust. It blows itself
          // out unwitnessed and unrecorded — see the module note.
          this.rollAt = pending.startsAt + weatherGap(random);
          continue;
        }

        this.running = {
          id: pending.id,
          startedAt: pending.startsAt,
          endsAt: pending.startsAt + def.durationSeconds,
        };
        events.push({ kind: 'start', id: pending.id, at: pending.startsAt });
        continue;
      }

      if (!this.running && !this.announced && now >= this.rollAt) {
        const id = pickWeather(random, allowStorm);
        events.push({ kind: 'telegraph', id, at: this.rollAt });
        this.announced = { id, startsAt: this.rollAt + WEATHER_TELEGRAPH_SECONDS };
        continue;
      }

      break;
    }

    return events;
  }

  /** Clear the sky and reset the clock. Used when loading a save. */
  clear(nextRollAt = WEATHER_MIN_GAP_SECONDS): void {
    this.running = null;
    this.announced = null;
    this.rollAt = nextRollAt;
  }
}

/* ------------------------------------------------------------------- storms */

const DEG = Math.PI / 180;

/** How far a heading leans off vertical, in radians. */
export function limbDeviation(direction: number): number {
  return Math.abs(Math.PI / 2 - direction);
}

/**
 * Is this the kind of limb the wind can get under?
 *
 * Structural wood leaning well off vertical: a branch reaching sideways is a
 * lever with the whole canopy on the end of it, while the leader — pointing into
 * the wind — is not. Twigs and foliage are too light to be worth the storm's
 * attention, and losing one would not be felt.
 */
export function isWideLimb(node: Pick<TreeNode, 'type'>, placement: NodePlacement): boolean {
  if (node.type !== 'branch') return false;
  return limbDeviation(placement.direction) > STORM_WIDE_DEGREES * DEG;
}

/** Every limb on the tree the wind is currently able to lever, in graph order. */
export function wideLimbs(tree: TreeGraph): TreeNode[] {
  const placements = tree.placements();
  return tree.allNodes().filter((node) => {
    const placement = placements.get(node.id);
    return placement !== undefined && isWideLimb(node, placement);
  });
}

/** How well `taps` on the anchor braced the tree, in `[0, 1]`. */
export function braceFraction(taps: number): number {
  return Math.min(1, Math.max(0, taps) / Math.max(1, STORM_BRACE_TAPS));
}

/** Chance one exposed limb snaps at a given brace. A full brace holds everything. */
export function snapChance(brace: number): number {
  return STORM_SNAP_CHANCE * (1 - Math.min(1, Math.max(0, brace)));
}

/**
 * Which of the exposed limbs the wind takes.
 *
 * Capped at {@link STORM_MAX_SNAPS} whatever the roll says: a storm that could
 * take a canopy apart would make the game about being present for the weather,
 * which is the opposite of what an idle game is for.
 */
export function chooseSnappedLimbs(
  limbs: readonly TreeNode[],
  brace: number,
  random: RandomSource,
): TreeNode[] {
  const chance = snapChance(brace);
  if (chance <= 0) return [];

  const snapped: TreeNode[] = [];
  for (const limb of limbs) {
    if (snapped.length >= STORM_MAX_SNAPS) break;
    if (random() < chance) snapped.push(limb);
  }
  return snapped;
}
