import Decimal from 'break_infinity.js';
import type { UpgradeDef } from '../content/upgrades';
import type { Modifier } from './modifiers';

/**
 * Purchase bookkeeping for repeatable upgrades.
 *
 * The ledger holds nothing but levels; costs and modifiers are derived from the
 * content definitions, so a purchased upgrade is fully described by its level.
 */
export class UpgradeLedger {
  private readonly levels = new Map<string, number>();

  /** Levels owned of an upgrade (0 when never bought). */
  level(id: string): number {
    return this.levels.get(id) ?? 0;
  }

  /** Overwrite an upgrade's level (used by purchases and, later, save loading). */
  setLevel(id: string, level: number): void {
    this.levels.set(id, Math.max(0, Math.floor(level)));
  }

  /** Every owned upgrade as `[id, level]` pairs. */
  entries(): [string, number][] {
    return [...this.levels.entries()];
  }
}

/** The modifier source id an upgrade's effects are registered under. */
export function upgradeSource(id: string): string {
  return `upgrade:${id}`;
}

/**
 * Cost of buying the next level while owning `level` levels:
 * `baseCost × costGrowth ^ level`.
 */
export function upgradeCost(def: UpgradeDef, level: number): Decimal {
  return new Decimal(def.baseCost).mul(Decimal.pow(def.costGrowth, level));
}

/** Whether another level may be bought, ignoring affordability. */
export function isMaxed(def: UpgradeDef, level: number): boolean {
  return def.maxLevel !== undefined && level >= def.maxLevel;
}

/**
 * The modifiers an upgrade grants at `level`, all sharing one source id so the
 * previous level's set can be revoked wholesale before the new one is applied.
 *
 * Additive effects scale linearly with the level; multiplicative ones compound.
 * Level 0 grants nothing.
 */
export function upgradeModifiers(def: UpgradeDef, level: number): Modifier[] {
  if (level <= 0) return [];

  return def.effects.map((effect) => ({
    id: `${def.id}:${effect.target}`,
    source: upgradeSource(def.id),
    type: effect.type,
    targetKind: 'tag' as const,
    target: effect.target,
    value:
      effect.type === 'mul'
        ? Decimal.pow(effect.valuePerLevel, level)
        : new Decimal(effect.valuePerLevel).mul(level),
  }));
}
