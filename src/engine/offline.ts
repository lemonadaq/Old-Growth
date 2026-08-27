import Decimal from 'break_infinity.js';
import {
  CANOPY_OFFLINE_RATE,
  CANOPY_TAG,
  OFFLINE_CHUNK_SECONDS,
  OFFLINE_MIN_SECONDS,
} from '../content/offline';
import type { ResourceId } from '../content/resources';
import type { SeasonDef, SeasonId } from '../content/seasons';
import type { Modifier } from './modifiers';

/**
 * The arithmetic of being away: how long counts, in what steps, and at what rate.
 *
 * Everything here is pure. The catch-up itself is
 * {@link Simulation.catchUpOffline}, which drives ordinary ticks — the season,
 * the sky, the symbionts' clocks and the litter all advance through exactly the
 * code that advances them while the player is watching, because a second system
 * that "simulates the same thing faster" is a second system to keep in step, and
 * it would drift.
 *
 * Two things are deliberately *not* pure functions of elapsed time and so are
 * settled by the tick rather than modelled here: **weather never fires offline**
 * (`TickOptions.offline`, since STEP 12 — a storm is a minigame, and one that
 * blew in the dark is only damage), and **rings are still earned**, because a
 * winter the tree stood through is a winter the tree stood through.
 */

/** Source id the offline penalty is granted under, so it can be revoked whole. */
export const OFFLINE_SOURCE = 'offline';

/** How the time away was split up. */
export interface OfflinePlan {
  /** Seconds actually elapsed since the player was last seen. */
  readonly elapsedSeconds: number;
  /** Seconds that will be simulated: `elapsed`, or the cap if that is smaller. */
  readonly simulatedSeconds: number;
  /** Seconds the cap threw away. Zero unless {@link capped}. */
  readonly forfeitedSeconds: number;
  /** True when the player was away longer than the cap allows. */
  readonly capped: boolean;
  /** Whether this is worth simulating at all. */
  readonly worthRunning: boolean;
}

/**
 * Work out what to simulate for a given absence.
 *
 * A negative elapsed is treated as zero rather than as time running backwards: a
 * clock that went back — a timezone change, an NTP correction, a save copied
 * between machines — must never hand out or take away resources. This is the
 * first half of "offline gains are never negative"; the second is that nothing
 * offline spends.
 */
export function planOffline(
  elapsedSeconds: number,
  capHours: number,
  minSeconds: number = OFFLINE_MIN_SECONDS,
): OfflinePlan {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const cap = Math.max(0, capHours) * 3600;
  const simulated = Math.min(elapsed, cap);

  return {
    elapsedSeconds: elapsed,
    simulatedSeconds: simulated,
    forfeitedSeconds: elapsed - simulated,
    capped: elapsed > cap,
    worthRunning: elapsed >= minSeconds && simulated > 0,
  };
}

/**
 * Split a span into whole chunks plus whatever is left over.
 *
 * The remainder is kept rather than rounded away — an hour and ten seconds is an
 * hour and ten seconds — and it is the *last* step, so every full chunk before it
 * runs at the size the systems were tuned against.
 */
export function offlineSteps(
  seconds: number,
  chunkSeconds: number = OFFLINE_CHUNK_SECONDS,
): number[] {
  const total = Math.max(0, seconds);
  const chunk = Math.max(1e-9, chunkSeconds);

  const whole = Math.floor(total / chunk);
  const steps = new Array<number>(whole).fill(chunk);

  const remainder = total - whole * chunk;
  if (remainder > 1e-9) steps.push(remainder);
  return steps;
}

/**
 * The penalty the canopy works under while nobody is watching.
 *
 * One `mul` on the canopy tag, granted for the length of the catch-up and
 * revoked after it. Underground producers carry `OFFLINE_TAG` and not this one,
 * so they are untouched and earn in full — the rule is expressed by *which
 * producers the modifier can reach* rather than by a branch in the payout loop.
 */
export function offlineModifiers(rate: number = CANOPY_OFFLINE_RATE): Modifier[] {
  return [
    {
      id: 'offline:canopy',
      source: OFFLINE_SOURCE,
      type: 'mul',
      targetKind: 'tag',
      target: CANOPY_TAG,
      value: Math.max(0, rate),
    },
  ];
}

/** One resource's haul from an absence. */
export interface OfflineGain {
  readonly resource: ResourceId;
  readonly amount: Decimal;
}

/**
 * What happened while the player was away, as the modal reads it.
 *
 * `notes` are written by the engine as finished sentences rather than as codes
 * for the UI to interpret: they describe things only the catch-up knows happened
 * — a winter that closed, a bird that kept working — and inventing a vocabulary
 * for the UI to re-render would put the same sentence in two places.
 */
export interface OfflineReport {
  readonly plan: OfflinePlan;
  /** Every resource that went up, in catalogue order. Never negative, never zero. */
  readonly gains: readonly OfflineGain[];
  /** Friendly lines about what the tree got up to. */
  readonly notes: readonly string[];
  /** Rings earned by winters that closed while away. */
  readonly rings: number;
  /** Chunks the catch-up ran, for tests and the notes' arithmetic. */
  readonly steps: number;
}

/** What the catch-up observed, for {@link offlineNotes} to put into words. */
export interface OfflineNoteInput {
  /** Rings laid down by winters that closed. */
  readonly rings: number;
  /** Season at the moment the player left. */
  readonly seasonBefore: SeasonId;
  /** Season they came back to. */
  readonly seasonAfter: SeasonDef;
  /** Seed Fragments the songbird dropped. */
  readonly fragments: number;
  /** Nuts the squirrel buried. */
  readonly nuts: number;
  /** Leaf-litter piles that gathered at the base. */
  readonly litter: number;
}

/** English plural for a count, for lines that read like a person wrote them. */
function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

/**
 * The friendly lines under the resource list.
 *
 * Only things that actually happened get a line: no "nothing much happened", no
 * placeholder for a symbiont the player has not attracted. An absence with a
 * quiet tree shows its numbers and no prose, which is the honest version of the
 * screen and also the shortest.
 *
 * Written here rather than in the modal because these are *engine* observations
 * — a winter closing, a bird working — and a component that had to re-derive
 * them from a bag of counters would be the second place they are described.
 */
export function offlineNotes(input: OfflineNoteInput): string[] {
  const notes: string[] = [];

  if (input.rings > 0) {
    notes.push(
      `Winter closed while you were away. The trunk carries ${input.rings} new ${plural(input.rings, 'ring')}.`,
    );
  }

  if (input.seasonAfter.id !== input.seasonBefore) {
    notes.push(
      `${input.seasonAfter.glyph} The season turned. It is ${input.seasonAfter.label} now.`,
    );
  }

  if (input.fragments > 0) {
    notes.push(
      `The songbird kept singing, and dropped ${input.fragments} Seed ${plural(input.fragments, 'Fragment')}.`,
    );
  }

  if (input.nuts > 0) {
    notes.push(
      `The squirrel buried something — ${input.nuts} ${plural(input.nuts, 'nut')}, and it has already forgotten where.`,
    );
  }

  if (input.litter > 0) {
    notes.push(
      `${input.litter} ${plural(input.litter, 'pile')} of leaf litter gathered at the base.`,
    );
  }

  return notes;
}

/** Human-readable duration: "3h 20m", "45m", "90s". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Difference between two balances, floored at zero.
 *
 * Nothing offline spends, so this should never clamp — which is exactly why it
 * does. A future system that *does* spend while away (an upkeep, a symbiont that
 * eats) must not be able to turn "while you were away" into a bill, and the
 * guarantee belongs at the place the number is produced rather than in the
 * memory of whoever adds that system.
 */
export function gainBetween(before: Decimal, after: Decimal): Decimal {
  const delta = after.sub(before);
  return delta.gt(0) ? delta : new Decimal(0);
}
