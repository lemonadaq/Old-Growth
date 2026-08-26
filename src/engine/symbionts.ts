import Decimal from 'break_infinity.js';
import type { EffectSpec } from '../content/effects';
import type { TreeNodeType } from '../content/growth';
import type { ResourceId } from '../content/resources';
import type { StratumId } from '../content/soil';
import { STRATUM_BY_ID } from '../content/soil';
import {
  SYMBIONTS,
  SYMBIONT_BY_ID,
  SYMBIONT_MAX_LEVEL,
  type SymbiontCondition,
  type SymbiontDef,
} from '../content/symbionts';
import type { Modifier } from './modifiers';
import { depthAt, stratumAt } from './soil';
import type { TreeGraph } from './treeGraph';

/**
 * Symbionts: the creatures that move into the tree.
 *
 * Nothing here is bought into existence. A symbiont has a **condition** — a
 * plain measurement of the tree's shape — and it arrives on its own the moment
 * that measurement comes true, at level 1. From then on it is an ordinary
 * levelled thing: its modifiers are published under one revocable source, and
 * they scale with the level exactly the way an upgrade's do.
 *
 * Two of the five do something the modifier system has no vocabulary for. The
 * mycorrhiza widens the radius at which a root tip finds ore, which is a
 * property of the *ground* rather than of production; the songbird and the
 * squirrel pay out on a clock. Both are declared in the content and settled by
 * the {@link Simulation}, rather than being bent into modifiers that would have
 * to misrepresent themselves.
 *
 * Timers are in **engine seconds**, like buffs: a nut cannot be hurried by
 * leaving the tab open, and an offline simulation advances them at the rate it
 * advances everything else.
 */

/** Source id every symbiont modifier is granted under. */
export const SYMBIONT_SOURCE = 'symbionts';

/**
 * Most cadence payouts a single call can settle.
 *
 * A long absence must not spin: STEP 14 will hand the ledger a jump of hours,
 * and the honest answer there is "as many as fit, up to a sane bound" rather
 * than a loop whose length is decided by how long the player was away.
 */
export const MAX_CATCH_UP_PAYOUTS = 512;

/** One symbiont living in the tree. */
export interface ActiveSymbiont {
  readonly id: string;
  /** Level 1 on arrival, up to {@link SYMBIONT_MAX_LEVEL}. */
  level: number;
  /** Engine seconds it arrived at, so the canvas can play it in. */
  readonly arrivedAt: number;
  /**
   * Engine seconds its next timed payout is due at; `Infinity` for the three
   * with no cadence, which is what makes "is anything due" a comparison rather
   * than a special case.
   */
  nextPayoutAt: number;
  /** Seconds between payouts; `Infinity` when it has none. */
  readonly intervalSeconds: number;
}

/** A cadence payout that has come due, and how many times over. */
export interface DuePayout {
  readonly id: string;
  readonly count: number;
}

/**
 * Which symbionts are in residence, at what level, and when each is next due to
 * pay out.
 *
 * Holds no modifiers of its own — {@link Simulation} owns granting and revoking
 * them, as it does for buffs — so the ledger stays plain, serialisable
 * bookkeeping.
 */
export class SymbiontLedger {
  private readonly living = new Map<string, ActiveSymbiont>();

  /**
   * Settle a symbiont in at level 1. Returns the new record, or `null` when it
   * is already living here — a creature arrives once.
   */
  arrive(def: SymbiontDef, now: number): ActiveSymbiont | null {
    if (this.living.has(def.id)) return null;

    const intervalSeconds = def.cadence?.intervalSeconds ?? Infinity;
    const active: ActiveSymbiont = {
      id: def.id,
      level: 1,
      arrivedAt: now,
      nextPayoutAt: now + intervalSeconds,
      intervalSeconds,
    };
    this.living.set(def.id, active);
    return active;
  }

  /** Whether a symbiont lives in the tree. */
  has(id: string): boolean {
    return this.living.has(id);
  }

  /** Its level, or `0` when it has not arrived. */
  level(id: string): number {
    return this.living.get(id)?.level ?? 0;
  }

  /** Its record, or `null`. */
  get(id: string): ActiveSymbiont | null {
    return this.living.get(id) ?? null;
  }

  /**
   * Set a level, clamped to the track. No-op for a symbiont that has not
   * arrived: a level is something a resident has.
   */
  setLevel(id: string, level: number): void {
    const active = this.living.get(id);
    if (!active) return;
    active.level = Math.min(SYMBIONT_MAX_LEVEL, Math.max(1, Math.floor(level)));
  }

  /**
   * Every payout that has come due at `now`, advancing each clock past what it
   * reports.
   *
   * Counts whole intervals rather than firing once per call, so a tick that
   * covers three of them pays three — which is what makes the same code correct
   * for a 100 ms tick and for an offline catch-up.
   */
  claimDue(now: number, maxPerCall = MAX_CATCH_UP_PAYOUTS): DuePayout[] {
    const due: DuePayout[] = [];

    for (const active of this.living.values()) {
      if (!Number.isFinite(active.intervalSeconds) || active.intervalSeconds <= 0) continue;
      if (now < active.nextPayoutAt) continue;

      const elapsed = now - active.nextPayoutAt;
      const count = Math.min(maxPerCall, 1 + Math.floor(elapsed / active.intervalSeconds));
      active.nextPayoutAt += count * active.intervalSeconds;
      due.push({ id: active.id, count });
    }

    return due;
  }

  /** Every resident, in arrival order. */
  entries(): ActiveSymbiont[] {
    return [...this.living.values()];
  }

  /** How many have arrived. */
  get size(): number {
    return this.living.size;
  }

  /** Drop every resident. Used when loading a save. */
  clear(): void {
    this.living.clear();
  }
}

/**
 * The measurements a condition can be taken against.
 *
 * Built once per evaluation by {@link symbiontContext} so five conditions cost
 * one walk of the tree rather than five.
 */
export interface SymbiontContext {
  /** Lifetime total earned of a resource. */
  readonly lifetime: (resource: ResourceId) => Decimal;
  /** Parts of a type currently on the tree. */
  readonly partsOfType: (type: TreeNodeType) => number;
  /** Parts of a type whose working tip sits in a layer. */
  readonly partsInStratum: (type: TreeNodeType, stratum: StratumId) => number;
  /** Parts of a type grown as a species. */
  readonly partsOfSpecies: (speciesId: string, type: TreeNodeType) => number;
  /** Height of the canopy above the ground line, in canonical units. */
  readonly height: number;
}

/** How close the tree is to attracting one creature, and what is still missing. */
export interface ConditionProgress {
  /** Whether the condition is satisfied right now. */
  readonly met: boolean;
  /** How far along, in `[0, 1]`. */
  readonly fraction: number;
  /** One line naming what is still needed. */
  readonly hint: string;
}

/**
 * Take every measurement the conditions need, in one walk of the graph.
 *
 * A part is judged at its **far end**, the same point the economy sites it at:
 * a root tip is in the clay if its tip is, not if the joint it grew from is.
 */
export function symbiontContext(
  tree: TreeGraph,
  lifetime: (resource: ResourceId) => Decimal,
): SymbiontContext {
  const placements = tree.placements();
  const inStratum = new Map<string, number>();
  const bySpecies = new Map<string, number>();
  let height = 0;

  for (const node of tree.allNodes()) {
    const placement = placements.get(node.id);
    if (!placement) continue;

    const speciesKey = `${node.speciesId}|${node.type}`;
    bySpecies.set(speciesKey, (bySpecies.get(speciesKey) ?? 0) + 1);

    const stratum = stratumAt(depthAt(placement.end.y));
    const stratumKey = `${node.type}|${stratum.id}`;
    inStratum.set(stratumKey, (inStratum.get(stratumKey) ?? 0) + 1);

    if (placement.end.y > height) height = placement.end.y;
  }

  return {
    lifetime,
    partsOfType: (type) => tree.countOfType(type),
    partsInStratum: (type, stratum) => inStratum.get(`${type}|${stratum}`) ?? 0,
    partsOfSpecies: (speciesId, type) => bySpecies.get(`${speciesId}|${type}`) ?? 0,
    height,
  };
}

/**
 * A friendlier noun than `leafCluster`, for the hint lines — singular and
 * plural, because a hint reading "1 root tips" is a hint written by a machine.
 */
const PART_NOUN: Readonly<Record<TreeNodeType, readonly [string, string]>> = {
  trunk: ['trunk', 'trunks'],
  branch: ['branch', 'branches'],
  twig: ['twig', 'twigs'],
  leafCluster: ['leaf cluster', 'leaf clusters'],
  blossom: ['blossom', 'blossoms'],
  rootSegment: ['root segment', 'root segments'],
  rootTip: ['root tip', 'root tips'],
};

/** `3 blossoms` / `1 root tip`. */
function quantify(count: number, type: TreeNodeType): string {
  const [one, many] = PART_NOUN[type];
  return `${count} ${count === 1 ? one : many}`;
}

/** Progress toward one condition, evaluated against live measurements. */
export function conditionProgress(
  condition: SymbiontCondition,
  ctx: SymbiontContext,
): ConditionProgress {
  let current: number;
  let goal: number;
  let hint: string;

  switch (condition.kind) {
    case 'partsOfType':
      current = ctx.partsOfType(condition.type);
      goal = condition.count;
      hint = `Grow ${quantify(condition.count, condition.type)}.`;
      break;
    case 'lifetime':
      current = ctx.lifetime(condition.resource).toNumber();
      goal = condition.amount;
      hint = `Earn ${condition.amount} ${condition.resource} in total.`;
      break;
    case 'partsInStratum':
      current = ctx.partsInStratum(condition.type, condition.stratum);
      goal = condition.count;
      hint = `Reach ${quantify(condition.count, condition.type)} into the ${
        STRATUM_BY_ID[condition.stratum].label
      }.`;
      break;
    case 'height':
      current = ctx.height;
      goal = condition.height;
      hint = 'Grow the canopy taller.';
      break;
    case 'speciesParts':
      current = ctx.partsOfSpecies(condition.speciesId, condition.type);
      goal = condition.count;
      hint = `Grow ${quantify(condition.count, condition.type)} of ${condition.speciesId}.`;
      break;
  }

  const safeGoal = Math.max(1e-9, goal);
  return {
    met: current >= goal,
    fraction: Math.min(1, Math.max(0, current / safeGoal)),
    hint,
  };
}

/**
 * A level's worth of one effect: an `add` scales linearly with the level, a
 * `mul` compounds. Level 0 is nothing at all.
 *
 * The same convention `upgradeModifiers` uses, deliberately: "level 3" has to
 * mean the same thing wherever a player reads it.
 */
export function scaleEffectValue(effect: EffectSpec, level: number): Decimal {
  if (level <= 0) return effect.type === 'mul' ? new Decimal(1) : new Decimal(0);
  return effect.type === 'mul'
    ? Decimal.pow(effect.value, level)
    : new Decimal(effect.value).mul(level);
}

/**
 * Every modifier the tree's residents currently grant, all under one revocable
 * source. Symbionts with no modifiers (the fungus, the bird, the squirrel)
 * contribute nothing here — what they do lives elsewhere on purpose.
 */
export function symbiontModifiers(
  living: readonly { readonly id: string; readonly level: number }[],
): Modifier[] {
  const modifiers: Modifier[] = [];

  for (const { id, level } of living) {
    const def = SYMBIONT_BY_ID[id];
    if (!def || level <= 0) continue;

    def.effects.forEach((effect, i) => {
      modifiers.push({
        id: `symbiont:${id}:${i}`,
        source: SYMBIONT_SOURCE,
        type: effect.type,
        targetKind: effect.targetKind,
        target: effect.target,
        value: scaleEffectValue(effect, level),
      });
    });
  }

  return modifiers;
}

/**
 * How far out a root tip currently detects ore, as a multiplier on every
 * pocket's radius. `1` — plain sight — with no fungus in the ground.
 */
export function veinReachOf(
  living: readonly { readonly id: string; readonly level: number }[],
): number {
  let reach = 1;
  for (const { id, level } of living) {
    const perLevel = SYMBIONT_BY_ID[id]?.veinReachPerLevel;
    if (perLevel === undefined || level <= 0) continue;
    reach += perLevel * level;
  }
  return reach;
}

/** Whether a level is the end of the track. */
export function isSymbiontMaxed(level: number): boolean {
  return level >= SYMBIONT_MAX_LEVEL;
}

/** One line of a price, as the engine and the panel both want it. */
export interface SymbiontCost {
  readonly resource: ResourceId;
  readonly amount: Decimal;
}

/**
 * What it costs to take a symbiont from `level` to `level + 1`, or `null` when
 * there is no such step — it has not arrived, or it is already at the top.
 */
export function symbiontLevelCost(def: SymbiontDef, level: number): SymbiontCost[] | null {
  if (level <= 0 || isSymbiontMaxed(level)) return null;
  const lines = def.upgrades[level - 1];
  if (!lines) return null;
  return lines.map((line) => ({ resource: line.resource, amount: new Decimal(line.amount) }));
}

/** One symbiont's standing, as the panel reads it. */
export interface SymbiontProgress extends ConditionProgress {
  readonly id: string;
  /** Whether it lives in the tree. */
  readonly active: boolean;
  /** Its level, or `0` while it is still being courted. */
  readonly level: number;
  /** Engine seconds since it arrived; `null` while it has not. */
  readonly age: number | null;
  /** Engine seconds until its next timed payout; `null` when it has no clock. */
  readonly nextPayoutIn: number | null;
}

/**
 * Every symbiont's standing, in catalogue order.
 *
 * A resident reports a satisfied condition whatever the tree looks like now:
 * pruning the blossoms that drew the bees does not evict them, because a
 * creature that moved in has moved in. The conditions are an *attraction*
 * mechanic, not an upkeep one.
 */
export function symbiontProgressAll(
  ledger: SymbiontLedger,
  ctx: SymbiontContext,
  now: number,
): SymbiontProgress[] {
  return SYMBIONTS.map((def) => {
    const active = ledger.get(def.id);
    if (active) {
      return {
        id: def.id,
        active: true,
        level: active.level,
        met: true,
        fraction: 1,
        hint: 'In residence.',
        age: Math.max(0, now - active.arrivedAt),
        nextPayoutIn: Number.isFinite(active.nextPayoutAt)
          ? Math.max(0, active.nextPayoutAt - now)
          : null,
      };
    }

    const progress = conditionProgress(def.condition, ctx);
    return { id: def.id, active: false, level: 0, ...progress, age: null, nextPayoutIn: null };
  });
}
