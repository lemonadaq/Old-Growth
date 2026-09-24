import Decimal from 'break_infinity.js';
import {
  PASSIVE_POINTS_AT_START,
  PASSIVE_POINTS_PER_BADGE,
  PASSIVE_POINTS_PER_RING,
  PASSIVE_POINTS_PER_SEED,
} from '../content/balance';
import {
  PASSIVE_NEIGHBOURS,
  PASSIVE_NODES,
  PASSIVE_NODE_BY_ID,
  PASSIVE_START_ID,
  passiveCurrency,
  type PassiveCurrency,
  type PassiveNodeDef,
} from '../content/passives';
import { RESOURCE_IDS } from '../content/resources';
import type { Modifier } from './modifiers';

/**
 * The Heartwood, engine side: who may be allocated, what it costs, and what it
 * is worth.
 *
 * Everything here is a pure function of an allocated set. There is no ledger
 * class and no per-node state, because a node is either in or out — which makes
 * the whole system one `Set<string>` in the save and lets the interesting rule
 * be written once:
 *
 * > **A node opens when something already allocated touches it.**
 *
 * That single rule is what makes the map a map. It is also what makes refunding
 * hard, and the hard part is handled honestly rather than by forbidding it: a
 * node may be given back only if everything still allocated can still be
 * reached from the heartwood without it. Refunding the middle of a path would
 * otherwise leave nodes allocated that no route reaches — paid for, in effect,
 * by nothing.
 */

/** Source id every passive modifier is granted under, so a respec revokes all. */
export const PASSIVE_SOURCE = 'passives';

/** A count of points, per pool. */
export interface PassivePoints {
  readonly ring: number;
  readonly seed: number;
}

/** One pool's standing: what has been earned, spent, and is left. */
export interface PassivePool {
  readonly earned: number;
  readonly spent: number;
  readonly available: number;
}

/** Both pools, as the UI shows them. */
export interface PassiveWallet {
  readonly ring: PassivePool;
  readonly seed: PassivePool;
}

/** The allocation a fresh tree starts with: the heartwood, and nothing else. */
export function initialPassives(): Set<string> {
  return new Set([PASSIVE_START_ID]);
}

/**
 * Clean an allocated set read from a save.
 *
 * Unknown ids are dropped — a node removed from the content table must not
 * strand a save — and the heartwood is always present, because every rule below
 * measures from it.
 */
export function normalisePassives(ids: Iterable<string>): Set<string> {
  const allocated = new Set<string>([PASSIVE_START_ID]);
  for (const id of ids) {
    if (id in PASSIVE_NODE_BY_ID) allocated.add(id);
  }
  return allocated;
}

/* ------------------------------------------------------------------ points */

/**
 * Points earned, ever.
 *
 * Both pools are counters over things already recorded elsewhere, which is why
 * nothing in the save holds a point total: rings, badges and lifetime Seeds are
 * the record, and this is a reading of it. A reading cannot drift out of step
 * with what it reads.
 */
export function passivePointsEarned(
  rings: number,
  badges: number,
  lifetimeSeeds: Decimal,
): PassivePoints {
  const seeds = Math.max(0, Math.floor(lifetimeSeeds.toNumber()));
  return {
    ring:
      PASSIVE_POINTS_AT_START +
      Math.max(0, Math.floor(rings)) * PASSIVE_POINTS_PER_RING +
      Math.max(0, Math.floor(badges)) * PASSIVE_POINTS_PER_BADGE,
    seed: seeds * PASSIVE_POINTS_PER_SEED,
  };
}

/** Points already committed to the map. The heartwood is free. */
export function passivePointsSpent(allocated: ReadonlySet<string>): PassivePoints {
  let ring = 0;
  let seed = 0;
  for (const id of allocated) {
    const def = PASSIVE_NODE_BY_ID[id];
    if (!def) continue;
    const currency = passiveCurrency(def.kind);
    if (currency === 'ring') ring += 1;
    else if (currency === 'seed') seed += 1;
  }
  return { ring, seed };
}

/** Both pools, earned against spent. */
export function passiveWallet(
  allocated: ReadonlySet<string>,
  rings: number,
  badges: number,
  lifetimeSeeds: Decimal,
): PassiveWallet {
  const earned = passivePointsEarned(rings, badges, lifetimeSeeds);
  const spent = passivePointsSpent(allocated);
  return {
    ring: {
      earned: earned.ring,
      spent: spent.ring,
      available: earned.ring - spent.ring,
    },
    seed: {
      earned: earned.seed,
      spent: spent.seed,
      available: earned.seed - spent.seed,
    },
  };
}

/* -------------------------------------------------------------- allocation */

/** Why a node cannot be taken. Each maps to a sentence in the string table. */
export type PassiveRefusal =
  /** No such node. */
  | 'unknown'
  /** Already allocated. */
  | 'taken'
  /** Nothing allocated touches it yet. */
  | 'unreachable'
  /** The pool it is paid from is empty. */
  | 'points';

/** Why a node cannot be given back. */
export type PassiveRefundRefusal =
  | 'unknown'
  /** The heartwood is not a purchase. */
  | 'start'
  /** It was never taken. */
  | 'taken'
  /** Something further out is only reachable through it. */
  | 'stranded';

export type PassiveCheck<Reason> =
  { readonly ok: true } | { readonly ok: false; readonly reason: Reason };

/** Whether anything already allocated touches `id`. */
export function isOpen(id: string, allocated: ReadonlySet<string>): boolean {
  const neighbours = PASSIVE_NEIGHBOURS[id];
  if (!neighbours) return false;
  return neighbours.some((other) => allocated.has(other));
}

/** Whether `id` may be allocated right now, and if not, why. */
export function allocationCheck(
  id: string,
  allocated: ReadonlySet<string>,
  wallet: PassiveWallet,
): PassiveCheck<PassiveRefusal> {
  const def = PASSIVE_NODE_BY_ID[id];
  if (!def) return { ok: false, reason: 'unknown' };
  if (allocated.has(id)) return { ok: false, reason: 'taken' };
  if (!isOpen(id, allocated)) return { ok: false, reason: 'unreachable' };

  const currency = passiveCurrency(def.kind);
  if (currency !== null && wallet[currency].available <= 0) {
    return { ok: false, reason: 'points' };
  }
  return { ok: true };
}

/**
 * Every allocated node the heartwood can still be walked to from, **if `except`
 * were given back**.
 *
 * A breadth-first walk that may only step between allocated nodes. Handing it
 * `null` answers the plainer question — what is currently connected — which is
 * what a save loaded from an older, looser build needs checking against.
 */
export function connectedAllocation(
  allocated: ReadonlySet<string>,
  except: string | null = null,
): Set<string> {
  const seen = new Set<string>();
  if (except === PASSIVE_START_ID || !allocated.has(PASSIVE_START_ID)) return seen;

  const queue = [PASSIVE_START_ID];
  seen.add(PASSIVE_START_ID);

  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const other of PASSIVE_NEIGHBOURS[current] ?? []) {
      if (other === except || seen.has(other) || !allocated.has(other)) continue;
      seen.add(other);
      queue.push(other);
    }
  }
  return seen;
}

/**
 * Whether `id` may be given back.
 *
 * The test is the honest one: pretend it is gone and see whether everything
 * else still allocated can still be reached. A leaf of the allocated set always
 * passes; the middle of a path never does, and the player is told which — the
 * alternative, silently un-allocating whatever was stranded, would refund a
 * dozen nodes because someone pressed the wrong one.
 */
export function refundCheck(
  id: string,
  allocated: ReadonlySet<string>,
): PassiveCheck<PassiveRefundRefusal> {
  if (!(id in PASSIVE_NODE_BY_ID)) return { ok: false, reason: 'unknown' };
  if (id === PASSIVE_START_ID) return { ok: false, reason: 'start' };
  if (!allocated.has(id)) return { ok: false, reason: 'taken' };

  const reachable = connectedAllocation(allocated, id);
  // Everything still allocated, minus the one being given back, has to be in
  // the walk. `size` alone would do, but the explicit check survives a future
  // where the map has a node with no edges at all.
  for (const other of allocated) {
    if (other === id) continue;
    if (!reachable.has(other)) return { ok: false, reason: 'stranded' };
  }
  return { ok: true };
}

/* --------------------------------------------------------------- modifiers */

/**
 * Every modifier the allocated nodes grant, under one revocable source.
 *
 * `allProduction` expands into one `mul` per resource exactly as a Ring and an
 * heirloom do: "everything the tree makes" has to mean all of it, and a
 * producer added later that forgets a tag must not quietly opt out of a bonus
 * somebody spent a ring on.
 */
export function passiveModifiers(allocated: ReadonlySet<string>): Modifier[] {
  const modifiers: Modifier[] = [];

  for (const id of allocated) {
    const def: PassiveNodeDef | undefined = PASSIVE_NODE_BY_ID[id];
    if (!def) continue;

    for (const effect of def.effects) {
      if (effect.kind === 'modifier') {
        modifiers.push({
          id: `passive:${def.id}:${effect.target}`,
          source: PASSIVE_SOURCE,
          type: effect.type,
          targetKind: effect.targetKind,
          target: effect.target,
          value: new Decimal(effect.value),
        });
        continue;
      }

      for (const resource of RESOURCE_IDS) {
        modifiers.push({
          id: `passive:${def.id}:${resource}`,
          source: PASSIVE_SOURCE,
          type: 'mul',
          targetKind: 'resource',
          target: resource,
          value: new Decimal(effect.mul),
        });
      }
    }
  }

  return modifiers;
}

/** Nodes that are currently open but not yet taken, for the map's highlight. */
export function openNodes(allocated: ReadonlySet<string>): string[] {
  return PASSIVE_NODES.filter((node) => !allocated.has(node.id) && isOpen(node.id, allocated)).map(
    (node) => node.id,
  );
}

/** Re-exported so callers need only this module. */
export { passiveCurrency, type PassiveCurrency };
