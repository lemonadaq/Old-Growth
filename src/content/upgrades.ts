import type { ResourceId } from './resources';

/**
 * Data-driven upgrade definitions.
 *
 * An upgrade is a repeatable purchase: buying level `n → n+1` costs
 * `baseCost × costGrowth^n` and grants modifiers scaled by the level reached.
 * Effects target the engine stat tags declared in `src/engine/clicker.ts`, so
 * adding an upgrade never requires touching engine logic.
 *
 * Layer note: this file stays free of engine imports. `type` mirrors the
 * engine's modifier types by value, not by import.
 */

export interface UpgradeEffect {
  /**
   * `'add'` sums `valuePerLevel × level` onto the stat's base.
   * `'mul'` compounds as `valuePerLevel ^ level`.
   */
  readonly type: 'add' | 'mul';
  /** Modifier tag the effect targets (a `CLICK_STAT_TAG` value). */
  readonly target: string;
  /** Effect size contributed by a single level. */
  readonly valuePerLevel: number;
}

export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Resource the purchase is paid in. */
  readonly costResource: ResourceId;
  /** Cost of the very first level. */
  readonly baseCost: number;
  /** Multiplicative cost growth per level already owned. */
  readonly costGrowth: number;
  /** Optional hard level cap; omitted means unlimited. */
  readonly maxLevel?: number;
  readonly effects: readonly UpgradeEffect[];
}

/**
 * Id of the Rake: the one upgrade that grants no modifiers at all.
 *
 * It buys a *capability* — autumn's leaf-litter piles sweep themselves up — and
 * the engine reads its level directly. Bending that into a modifier would need a
 * stat that does not exist to carry a number nobody reads.
 */
export const RAKE_ID = 'rake';

/**
 * The purchasable upgrades — one per active-play stat, so a player can push raw
 * tap value, crit frequency, or how much combo they can bank; plus the Rake,
 * which autumn pays for.
 */
export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'strongerTaps',
    name: 'Stronger Taps',
    description: 'Bite deeper into the bark. +1 Sap per tap.',
    costResource: 'sap',
    baseCost: 10,
    costGrowth: 1.5,
    effects: [{ type: 'add', target: 'click.power', valuePerLevel: 1 }],
  },
  {
    id: 'sharperInstincts',
    name: 'Sharper Instincts',
    description: 'Learn where the sap runs richest. +1% critical tap chance.',
    costResource: 'sap',
    baseCost: 50,
    costGrowth: 1.6,
    effects: [{ type: 'add', target: 'click.critChance', valuePerLevel: 0.01 }],
  },
  {
    id: 'rhythmOfGrowth',
    name: 'Rhythm of Growth',
    description: 'Hold a steadier beat. +10 combo stacks the meter can bank.',
    costResource: 'sap',
    baseCost: 250,
    costGrowth: 2,
    effects: [{ type: 'add', target: 'combo.cap', valuePerLevel: 10 }],
  },
  {
    id: RAKE_ID,
    name: 'Rake',
    description: 'Sweep the base without stooping. Autumn leaf litter collects itself.',
    // Paid for in the thing it collects: a few piles swept by hand buy the tool
    // that sweeps the rest, which is the only price a rake should have.
    costResource: 'leafLitter',
    baseCost: 40,
    costGrowth: 1,
    maxLevel: 1,
    effects: [],
  },
] as const;

/** Lookup map from id → definition. */
export const UPGRADE_BY_ID: Readonly<Record<string, UpgradeDef>> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
);

/** All upgrade ids in canonical display order. */
export const UPGRADE_IDS: readonly string[] = UPGRADES.map((u) => u.id);
