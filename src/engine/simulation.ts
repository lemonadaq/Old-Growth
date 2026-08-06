import Decimal from 'break_infinity.js';
import { RESOURCE_IDS } from '../content/resources';
import { UPGRADES, UPGRADE_BY_ID } from '../content/upgrades';
import { resolveClick, resolveClickStats, type ClickResult } from './clicker';
import { comboFill, comboMultiplier, comboStacksAt, registerComboClick } from './combo';
import { computeProduction, type Producer } from './economy';
import type { Modifier } from './modifiers';
import type { RandomSource } from './rng';
import { isMaxed, upgradeCost, upgradeModifiers, upgradeSource } from './upgrades';
import {
  createInitialState,
  type GameSnapshot,
  type GameState,
  type Resources,
  type UpgradeSnapshot,
} from './types';

/**
 * Owns the mutable {@link GameState} and advances it one fixed tick at a time.
 *
 * Each tick re-evaluates the production pipeline: every registered producer is
 * combined with the active modifiers to yield a per-second rate per resource,
 * that rate is cached on the registry, and the resource amounts are advanced by
 * `rate × dt`. Kept pure and framework-free so it can be driven by the loop, by
 * tests, or by an offline-progress calculator.
 *
 * Player taps are *not* part of the tick: {@link click} resolves immediately so
 * a burst of rapid taps can never be coalesced or dropped by the frame loop.
 */
export class Simulation {
  readonly state: GameState;

  constructor(initial: GameState = createInitialState()) {
    this.state = initial;
  }

  /** Register (or replace) a producer by its id. */
  addProducer(producer: Producer): void {
    this.state.producers.set(producer.id, producer);
  }

  /** Remove a producer by id. No-op if it is not registered. */
  removeProducer(id: string): void {
    this.state.producers.delete(id);
  }

  /** Register a modifier. */
  addModifier(modifier: Modifier): void {
    this.state.modifiers.add(modifier);
  }

  /** Remove every modifier granted by `source`. */
  removeModifiersBySource(source: string): void {
    this.state.modifiers.removeBySource(source);
  }

  /**
   * Resolve one tap on the tree, immediately and synchronously.
   *
   * Builds the combo, rolls for a crit, credits the Sap, and returns what
   * happened so the caller can spawn the matching visual feedback. Hit-testing
   * happens before this call — reaching here means wood was struck.
   *
   * The tap banks its combo stack *before* it is paid out, so the multiplier on
   * the meter is always the one the floating number was computed with. A first
   * tap therefore pays ×1.02, and the 50th consecutive tap pays the full ×2.
   *
   * @param now    timestamp (ms) the tap landed; drives combo timing.
   * @param random source for the crit roll, injectable for tests.
   */
  click(now: number = Date.now(), random: RandomSource = Math.random): ClickResult {
    const stats = resolveClickStats(this.state.modifiers);
    const stacks = registerComboClick(this.state.combo, now, stats.comboCap);
    const result = resolveClick(stats, stacks, random());

    this.state.resources.add('sap', result.gain);
    this.state.clicks += 1;
    return result;
  }

  /**
   * Buy one level of an upgrade if it is affordable and not maxed.
   *
   * The upgrade's whole modifier set is revoked and re-granted at the new level,
   * so effects never double up. Returns `false` (and changes nothing) when the
   * purchase cannot go through.
   */
  buyUpgrade(id: string): boolean {
    const def = UPGRADE_BY_ID[id];
    if (!def) return false;

    const level = this.state.upgrades.level(id);
    if (isMaxed(def, level)) return false;

    const cost = upgradeCost(def, level);
    if (this.state.resources.amount(def.costResource).lt(cost)) return false;

    this.state.resources.add(def.costResource, cost.neg());
    this.state.upgrades.setLevel(id, level + 1);

    this.state.modifiers.removeBySource(upgradeSource(id));
    for (const mod of upgradeModifiers(def, level + 1)) {
      this.state.modifiers.add(mod);
    }
    return true;
  }

  /** Advance the simulation by one fixed step of `dtSeconds`. */
  tick(dtSeconds: number): void {
    this.state.tick += 1;
    this.state.elapsedSeconds += dtSeconds;
    this.state.lastUpdatedAt = Date.now();

    const perSecond = computeProduction(this.state.producers.values(), this.state.modifiers);
    for (const id of RESOURCE_IDS) {
      const rate = perSecond[id];
      this.state.resources.setPerSecond(id, rate);
      if (!rate.eq(0)) {
        this.state.resources.add(id, rate.mul(dtSeconds));
      }
    }
  }

  /**
   * Produce an immutable snapshot for the UI/renderer to read.
   *
   * `now` is needed because the combo meter decays continuously: its effective
   * value is derived from the last click rather than stepped per tick.
   */
  snapshot(now: number = Date.now()): GameSnapshot {
    const resources = {} as Resources;
    const totals = {} as Resources;
    const perSecond = {} as Resources;
    for (const id of RESOURCE_IDS) {
      // Clone so consumers can never mutate live engine Decimals.
      resources[id] = new Decimal(this.state.resources.amount(id));
      totals[id] = new Decimal(this.state.resources.total(id));
      perSecond[id] = new Decimal(this.state.resources.perSecond(id));
    }

    const clickStats = resolveClickStats(this.state.modifiers);
    const stacks = comboStacksAt(this.state.combo, now);

    const upgrades: UpgradeSnapshot[] = UPGRADES.map((def) => {
      const level = this.state.upgrades.level(def.id);
      const cost = upgradeCost(def, level);
      return {
        id: def.id,
        level,
        cost,
        affordable: resources[def.costResource].gte(cost),
        maxed: isMaxed(def, level),
      };
    });

    return {
      resources,
      totals,
      perSecond,
      clickStats,
      combo: {
        stacks,
        cap: clickStats.comboCap,
        multiplier: comboMultiplier(stacks, clickStats.comboCap),
        fill: comboFill(this.state.combo, now, clickStats.comboCap),
      },
      upgrades,
      clicks: this.state.clicks,
      tick: this.state.tick,
      elapsedSeconds: this.state.elapsedSeconds,
    };
  }
}
