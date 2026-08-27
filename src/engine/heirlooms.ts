import Decimal from 'break_infinity.js';
import type { TreeNodeType } from '../content/growth';
import {
  BASE_OFFLINE_CAP_HOURS,
  HEIRLOOMS,
  HEIRLOOM_BY_ID,
  heirloomPrerequisite,
  type HeirloomDef,
} from '../content/prestige';
import { RESOURCE_IDS, type ResourceId } from '../content/resources';
import type { Modifier } from './modifiers';

/**
 * The Seed Vault, engine side.
 *
 * An heirloom is bought once and never expires, which makes it the simplest
 * ledger in the game — levels and nothing else, exactly like an upgrade. What is
 * different is *when* most of them are read: a modifier is published the moment
 * it is bought, but a starting balance, a remembered layout and a bonded
 * creature all only mean something at the instant a run begins. Those are the
 * aggregate readers at the bottom of this file, and `Simulation` calls them from
 * one place — the run-start path — rather than scattering `level('seedcase')`
 * through the reset.
 */

/** Source id every heirloom's modifiers are granted under. */
export const HEIRLOOM_SOURCE = 'heirlooms';

/**
 * Levels owned per heirloom.
 *
 * Survives prestige, which is the whole point: it is the only ledger in the game
 * that a reset copies across rather than replaces.
 */
export class HeirloomLedger {
  private readonly levels = new Map<string, number>();

  /** Levels owned (0 when never bought). */
  level(id: string): number {
    return this.levels.get(id) ?? 0;
  }

  /** Overwrite a level. Used by purchases and, later, by save loading. */
  setLevel(id: string, level: number): void {
    this.levels.set(id, Math.max(0, Math.floor(level)));
  }

  /** Every owned heirloom as `[id, level]` pairs. */
  entries(): [string, number][] {
    return [...this.levels.entries()].filter(([, level]) => level > 0);
  }

  /** Total levels bought across the whole Vault. */
  get spent(): number {
    let total = 0;
    for (const level of this.levels.values()) total += level;
    return total;
  }

  /** Forget everything. Used when loading a save — never by prestige. */
  clear(): void {
    this.levels.clear();
  }
}

/**
 * Anything that can answer "how many levels of this are owned".
 *
 * A parameter type rather than the ledger itself, because the run-start readers
 * below are asked two different questions with the same code: "what does the
 * Vault provide" (the ledger) and "what does it provide that this run has not
 * been given yet" (a delta over the ledger). See `Simulation.grantRunStart`.
 */
export interface HeirloomLevels {
  level(id: string): number;
}

/** Cost of the next level in Seeds: `baseCost × costGrowth ^ level`. */
export function heirloomCost(def: HeirloomDef, level: number): Decimal {
  return new Decimal(def.baseCost).mul(Decimal.pow(def.costGrowth, Math.max(0, level)));
}

/** Whether an heirloom's track has no further levels. */
export function isHeirloomMaxed(def: HeirloomDef, level: number): boolean {
  return level >= def.maxLevel;
}

/**
 * Whether a node is open for purchase: the one before it on its branch is
 * owned. The first node of every branch is always open.
 */
export function isHeirloomUnlocked(id: string, ledger: HeirloomLevels): boolean {
  const required = heirloomPrerequisite(id);
  return required === null || ledger.level(required) > 0;
}

/**
 * Every modifier the owned heirlooms grant, under one revocable source.
 *
 * Additive effects scale linearly with the level and multiplicative ones
 * compound, exactly as an upgrade's do. `allProduction` expands into one `mul`
 * per resource the way a Ring does — "everything the tree makes" has to mean all
 * of it, and a future producer that forgets a tag must not quietly opt out of a
 * bonus the player spent Seeds on.
 */
export function heirloomModifiers(ledger: HeirloomLevels): Modifier[] {
  const modifiers: Modifier[] = [];

  for (const def of HEIRLOOMS) {
    const level = ledger.level(def.id);
    if (level <= 0) continue;

    for (const effect of def.effects) {
      if (effect.kind === 'modifier') {
        modifiers.push({
          id: `heirloom:${def.id}:${effect.target}`,
          source: HEIRLOOM_SOURCE,
          type: effect.type,
          targetKind: effect.targetKind,
          target: effect.target,
          value:
            effect.type === 'mul'
              ? Decimal.pow(effect.valuePerLevel, level)
              : new Decimal(effect.valuePerLevel).mul(level),
        });
        continue;
      }

      if (effect.kind === 'allProduction') {
        const value = Decimal.pow(effect.mulPerLevel, level);
        for (const resource of RESOURCE_IDS) {
          modifiers.push({
            id: `heirloom:${def.id}:${resource}`,
            source: HEIRLOOM_SOURCE,
            type: 'mul',
            targetKind: 'resource',
            target: resource,
            value,
          });
        }
      }
      // Every other kind is a capability read at run start, not a modifier.
    }
  }

  return modifiers;
}

/** One resource a run opens with something of. */
export interface StartingResource {
  readonly resource: ResourceId;
  readonly amount: Decimal;
}

/** What the Vault puts in the seed's pocket, summed across every heirloom. */
export function startingResources(ledger: HeirloomLevels): StartingResource[] {
  const totals = new Map<ResourceId, Decimal>();

  for (const def of HEIRLOOMS) {
    const level = ledger.level(def.id);
    if (level <= 0) continue;

    for (const effect of def.effects) {
      if (effect.kind !== 'startingResource') continue;
      const amount = new Decimal(effect.amountPerLevel).mul(level);
      totals.set(effect.resource, (totals.get(effect.resource) ?? new Decimal(0)).add(amount));
    }
  }

  // Catalogue order, so the "you begin with…" line always reads the same way.
  return RESOURCE_IDS.filter((id) => totals.has(id)).map((resource) => ({
    resource,
    amount: totals.get(resource) as Decimal,
  }));
}

/** One kind of part a run opens with some of. */
export interface StartingPart {
  readonly type: TreeNodeType;
  readonly count: number;
}

/** Parts already grown on the trunk when a run begins. */
export function startingParts(ledger: HeirloomLevels): StartingPart[] {
  const totals = new Map<TreeNodeType, number>();

  for (const def of HEIRLOOMS) {
    const level = ledger.level(def.id);
    if (level <= 0) continue;

    for (const effect of def.effects) {
      if (effect.kind !== 'startingPart') continue;
      totals.set(effect.part, (totals.get(effect.part) ?? 0) + effect.countPerLevel * level);
    }
  }

  return [...totals.entries()].map(([type, count]) => ({ type, count }));
}

/**
 * Which halves of the previous tree are rebuilt on the way in.
 *
 * A set rather than a level, because the two Memory nodes are not a track: Root
 * Map and Canopy Map each own one domain outright, and owning both is owning the
 * whole tree.
 */
export function memoryDomains(ledger: HeirloomLevels): Set<'root' | 'canopy'> {
  const domains = new Set<'root' | 'canopy'>();

  for (const def of HEIRLOOMS) {
    if (ledger.level(def.id) <= 0) continue;
    for (const effect of def.effects) {
      if (effect.kind === 'memory') domains.add(effect.domain);
    }
  }

  return domains;
}

/**
 * What level the bonded creature settles in at, or `0` when there is no bond.
 *
 * One rather than zero is the floor, because a bond that granted level 0 would
 * be a creature that is present and does nothing.
 */
export function bondLevel(ledger: HeirloomLevels): number {
  let bonded = false;
  let extra = 0;

  for (const def of HEIRLOOMS) {
    const level = ledger.level(def.id);
    if (level <= 0) continue;

    for (const effect of def.effects) {
      if (effect.kind === 'bond') bonded = true;
      if (effect.kind === 'bondLevel') extra += effect.levelsPerLevel * level;
    }
  }

  return bonded ? 1 + extra : 0;
}

/**
 * What to multiply a season's length by. Never below a floor, so no amount of
 * Tempo can collapse the year into a single tick.
 */
export function seasonLengthFactor(ledger: HeirloomLevels): number {
  let fraction = 0;

  for (const def of HEIRLOOMS) {
    const level = ledger.level(def.id);
    if (level <= 0) continue;
    for (const effect of def.effects) {
      if (effect.kind === 'seasonLength') fraction += effect.fractionPerLevel * level;
    }
  }

  return Math.max(0.1, 1 - fraction);
}

/** Hours of absence the tree will pay for, base plus whatever Tempo added. */
export function offlineCapHours(ledger: HeirloomLevels): number {
  let hours = BASE_OFFLINE_CAP_HOURS;

  for (const def of HEIRLOOMS) {
    const level = ledger.level(def.id);
    if (level <= 0) continue;
    for (const effect of def.effects) {
      if (effect.kind === 'offlineCap') hours += effect.hoursPerLevel * level;
    }
  }

  return hours;
}

/** Whether an id names a real heirloom. */
export function isHeirloom(id: string): boolean {
  return HEIRLOOM_BY_ID[id] !== undefined;
}
