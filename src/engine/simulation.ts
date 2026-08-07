import Decimal from 'break_infinity.js';
import { BUFF_BY_ID, LATERAL_SURGE_ID } from '../content/buffs';
import { GROWTH_RULE_BY_TYPE, type TreeNodeType } from '../content/growth';
import { DEW_MIN_TAPS, DEW_SECONDS, EXPOSURE_INTERVAL_SECONDS } from '../content/light';
import { RESOURCE_IDS } from '../content/resources';
import { TOTEM_BY_ID } from '../content/totems';
import { UPGRADES, UPGRADE_BY_ID } from '../content/upgrades';
import { buffModifiers, buffSource, type ActiveBuff } from './buffs';
import { resolveClick, resolveClickStats, type ClickResult, type ClickStats } from './clicker';
import { comboFill, comboMultiplier, comboStacksAt, registerComboClick } from './combo';
import { dayCycle } from './daylight';
import { computeProduction, computeResourceRate, type Producer } from './economy';
import {
  partCost,
  partProducer,
  partProducerId,
  priceGrowthOptions,
  type PricedGrowthOption,
} from './growth';
import { computeHydration, hydrationModifiers, HYDRATION_SOURCE } from './hydration';
import {
  canopyIndex,
  computeLeafExposures,
  daylightModifiers,
  lightFactorAt,
  DAYLIGHT_SOURCE,
} from './light';
import { applyModifiers, type Modifier } from './modifiers';
import { quotePrune, type PruneQuote } from './prune';
import type { RandomSource } from './rng';
import { hasFreeSlot, totemCost, totemModifiers, TOTEM_SOURCE } from './totems';
import { DEFAULT_SPECIES_ID, type TreeNode } from './treeGraph';
import { isMaxed, upgradeCost, upgradeModifiers, upgradeSource } from './upgrades';
import {
  createInitialState,
  type BuffSnapshot,
  type GameSnapshot,
  type GameState,
  type LeafLight,
  type Resources,
  type UpgradeSnapshot,
} from './types';

/** What one resolved tap did, including any dawn Dew it happened to collect. */
export interface ClickOutcome extends ClickResult {
  /** Sap from the day's first tap, or `null` when this was not that tap. */
  readonly dew: Decimal | null;
}

/** What a completed cut removed and paid out. */
export interface PruneResult {
  /** The quote the cut was executed against — exactly what the preview showed. */
  readonly quote: PruneQuote;
  /** The nodes that came off, the cut node first. */
  readonly removed: readonly TreeNode[];
  /** The Lateral Surge this cut started or refreshed, or `null`. */
  readonly surge: ActiveBuff | null;
}

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
    this.syncPartProducers();
    // Permanent auras and any running buffs first: they are inputs to everything
    // measured below them, and a loaded save arrives with both already set.
    this.republishTotems();
    this.republishBuffs();
    this.updateDaylight();
    this.updateHydration();
    this.updateLightExposure();
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
  click(now: number = Date.now(), random: RandomSource = Math.random): ClickOutcome {
    const stats = resolveClickStats(this.state.modifiers);
    const stacks = registerComboClick(this.state.combo, now, stats.comboCap);
    const result = resolveClick(stats, stacks, random());

    this.state.resources.add('sap', result.gain);
    this.state.clicks += 1;
    return { ...result, dew: this.collectDew(stats) };
  }

  /**
   * The dawn bonus: the first tap of each new engine day finds Dew on the tree
   * and cashes it for {@link DEW_SECONDS} of Sap income.
   *
   * Returns `null` on every other tap of that day, so it fires once and the
   * caller knows whether to celebrate.
   *
   * The floor is doing the real work today — see {@link DEW_MIN_TAPS}: nothing
   * makes Sap passively yet, so "60 seconds of income" would be nothing at all.
   */
  private collectDew(stats: ClickStats): Decimal | null {
    const day = dayCycle(this.state.elapsedSeconds).dayNumber;
    if (day <= this.state.lastDewDay) return null;
    this.state.lastDewDay = day;

    const income = this.state.resources.perSecond('sap').mul(DEW_SECONDS);
    const floor = stats.clickPower.mul(DEW_MIN_TAPS);
    const dew = income.gt(floor) ? income : floor;

    this.state.resources.add('sap', dew);
    return dew;
  }

  /**
   * Everything growable on `nodeId` right now, priced against the player's
   * balances. This is what the radial grow menu renders.
   */
  growthOptions(nodeId: string): PricedGrowthOption[] {
    return priceGrowthOptions(
      this.state.tree,
      nodeId,
      this.state.resources,
      this.state.modifiers,
      this.state.soil,
    );
  }

  /**
   * Grow a new part on an existing node, paying for it.
   *
   * Returns the new node, or `null` when the purchase cannot go through — the
   * growth rules forbid that child there, or the player cannot afford it.
   * Nothing is spent on a failed call.
   */
  growPart(
    nodeId: string,
    childType: TreeNodeType,
    speciesId: string = DEFAULT_SPECIES_ID,
  ): TreeNode | null {
    const tree = this.state.tree;
    if (!tree.getValidGrowthOptions(nodeId).some((option) => option.type === childType)) {
      return null;
    }

    const rule = GROWTH_RULE_BY_TYPE[childType];
    // Priced through the modifiers, so a growth discount reaches the till and
    // not just the menu label.
    const cost = partCost(childType, tree.countOfType(childType), this.state.modifiers);
    if (this.state.resources.amount(rule.costResource).lt(cost)) return null;

    const node = tree.grow(nodeId, childType, speciesId, this.state.tick);
    if (!node) return null;

    this.state.resources.add(rule.costResource, cost.neg());

    const producer = partProducer(node, {
      soil: this.state.soil,
      placement: tree.placements().get(node.id),
    });
    if (producer) this.addProducer(producer);

    // A new root (or a new leaf drinking from them) moves the hydration balance
    // immediately, so the HUD and the next tap agree with the purchase that was
    // just made rather than lagging a tick behind it. The same goes for shade:
    // a leaf dropped into a crowded canopy dims its neighbours the moment it
    // lands, not on the next sweep.
    this.updateHydration();
    this.updateLightExposure();
    return node;
  }

  /**
   * What cutting at `nodeId` would remove and pay. `null` when nothing can be
   * cut there — this is what the prune-mode tooltip renders.
   */
  pruneQuote(nodeId: string): PruneQuote | null {
    return quotePrune(this.state.tree, nodeId, this.state.modifiers);
  }

  /**
   * Cut a limb (or root) and everything hanging off it: drop the production it
   * carried, hand back the refund and the Deadwood, and — if the cut took the
   * tree's leader with it — release the buds below into a Lateral Surge.
   *
   * Returns `null` and changes nothing when there is nothing to cut there.
   *
   * The payout is taken from {@link pruneQuote} *before* the graph is touched,
   * so the transaction and the preview the player was reading are the same
   * numbers: prices depend on how many parts of a type the tree carries, and
   * that changes the instant the subtree comes off.
   */
  prunePart(nodeId: string): PruneResult | null {
    const quote = this.pruneQuote(nodeId);
    if (!quote) return null;

    const removed = this.state.tree.prune(nodeId);
    if (removed.length === 0) return null;

    for (const node of removed) {
      this.removeProducer(partProducerId(node.id));
    }

    for (const refund of quote.refunds) {
      this.state.resources.add(refund.resource, refund.amount);
    }
    this.state.resources.add('deadwood', quote.deadwood);
    this.state.prunes += 1;

    const surge = quote.apical ? this.grantBuff(LATERAL_SURGE_ID) : null;

    this.updateHydration();
    this.updateLightExposure();
    return { quote, removed, surge };
  }

  /**
   * Start a timed buff, or refresh one already running. Returns the active
   * record, or `null` for an unknown id.
   *
   * Modifiers are revoked and re-granted rather than topped up, so refreshing a
   * buff can never stack its effects with its own previous instance.
   */
  grantBuff(id: string, now: number = this.state.elapsedSeconds): ActiveBuff | null {
    const def = BUFF_BY_ID[id];
    if (!def) return null;

    const active = this.state.buffs.grant(def, now);
    this.state.modifiers.removeBySource(buffSource(id));
    for (const modifier of buffModifiers(def)) {
      this.state.modifiers.add(modifier);
    }
    return active;
  }

  /**
   * Re-grant the modifiers of every running buff. The from-scratch path, used at
   * construction and after loading a save; ordinary grants keep themselves in
   * step.
   */
  republishBuffs(): void {
    for (const buff of this.state.buffs.entries()) {
      const def = BUFF_BY_ID[buff.id];
      if (!def) continue;
      this.state.modifiers.removeBySource(buffSource(buff.id));
      for (const modifier of buffModifiers(def)) {
        this.state.modifiers.add(modifier);
      }
    }
  }

  /** Retire buffs whose time is up, revoking everything they granted. */
  updateBuffs(): void {
    for (const id of this.state.buffs.expire(this.state.elapsedSeconds)) {
      this.state.modifiers.removeBySource(buffSource(id));
    }
  }

  /**
   * Carve a totem from Deadwood and plant it at the tree base.
   *
   * Returns `false` and changes nothing when the id is unknown, every slot is
   * taken, or there is not enough Deadwood. Totems are permanent — there is no
   * uproot path on purpose.
   */
  craftTotem(totemId: string): boolean {
    const def = TOTEM_BY_ID[totemId];
    if (!def) return false;
    if (!hasFreeSlot(this.state.totems)) return false;

    const cost = totemCost(def);
    if (this.state.resources.amount(def.costResource).lt(cost)) return false;

    this.state.resources.add(def.costResource, cost.neg());
    this.state.totems.push(totemId);
    this.republishTotems();
    return true;
  }

  /**
   * Republish every planted totem's aura under one source.
   *
   * A Rain totem moves Water income and therefore hydration; a Sun totem moves
   * what each leaf earns. Both are re-derived here so the HUD and the next tap
   * agree with the carving that was just planted.
   */
  republishTotems(): void {
    this.state.modifiers.removeBySource(TOTEM_SOURCE);
    for (const modifier of totemModifiers(this.state.totems)) {
      this.state.modifiers.add(modifier);
    }
    this.updateHydration();
    this.updateLightExposure();
  }

  /**
   * Rebuild every part producer from the tree graph.
   *
   * Growth and pruning keep producers in step incrementally; this is the
   * from-scratch path, used at construction and (later) after loading a save.
   */
  syncPartProducers(): void {
    for (const id of [...this.state.producers.keys()]) {
      if (id.startsWith('part:')) this.state.producers.delete(id);
    }
    const placements = this.state.tree.placements();
    for (const node of this.state.tree.allNodes()) {
      const producer = partProducer(node, {
        soil: this.state.soil,
        placement: placements.get(node.id),
        exposure: this.state.leafLight.get(node.id)?.exposure,
      });
      if (producer) this.addProducer(producer);
    }
  }

  /**
   * Republish the time-of-day multiplier on Light.
   *
   * One `mul` on the Light resource, revoked and re-granted, so the canopy's
   * output rides the sun without any producer having to know what time it is.
   */
  updateDaylight(): void {
    this.state.modifiers.removeBySource(DAYLIGHT_SOURCE);

    const factor = lightFactorAt(dayCycle(this.state.elapsedSeconds).t);
    this.state.lightFactor = factor;

    for (const modifier of daylightModifiers(factor)) {
      this.state.modifiers.add(modifier);
    }
  }

  /**
   * Re-shade the canopy: recompute every leaf's exposure and re-register its
   * producer at the rate that exposure earns.
   *
   * Exposure lives on the producer's *base rate* rather than in a modifier
   * because it is per node — there is no tag that means "this leaf and no
   * other". Rebuilding the producers wholesale keeps the pipeline itself
   * unchanged: a leaf is still one ordinary producer summed with the rest.
   *
   * The per-leaf `/s` is banked at the same time, for the leaf tooltip.
   */
  updateLightExposure(): void {
    const exposures = computeLeafExposures(canopyIndex(this.state.tree));
    const placements = this.state.tree.placements();
    const leafLight = new Map<string, LeafLight>();

    for (const [nodeId, exposure] of exposures) {
      const node = this.state.tree.node(nodeId);
      if (!node) continue;

      const producer = partProducer(node, {
        soil: this.state.soil,
        placement: placements.get(nodeId),
        exposure: exposure.exposure,
      });

      let rate = new Decimal(0);
      if (producer) {
        this.addProducer(producer);
        rate = applyModifiers(
          new Decimal(producer.baseRate),
          this.state.modifiers.matching(producer.resource, producer.tags),
        );
      } else {
        this.removeProducer(partProducerId(nodeId));
      }

      leafLight.set(nodeId, { ...exposure, rate });
    }

    this.state.leafLight = leafLight;
  }

  /**
   * Re-read the hydration link and republish its modifiers.
   *
   * The existing hydration modifiers are revoked *before* Water income is
   * measured. They do not target Water, so it would read the same either way —
   * but doing it in this order means no future tagging mistake can turn the
   * link into a feedback loop.
   */
  updateHydration(): void {
    this.state.modifiers.removeBySource(HYDRATION_SOURCE);

    const income = computeResourceRate(
      this.state.producers.values(),
      this.state.modifiers,
      'water',
    );
    const hydration = computeHydration(income, this.state.tree.countOfType('leafCluster'));
    this.state.hydration = hydration;

    for (const modifier of hydrationModifiers(hydration.value)) {
      this.state.modifiers.add(modifier);
    }
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

    // Order matters. Lapsed buffs go first — a tick must not pay out through a
    // modifier whose time ran out before it started. Then the sun sets the
    // ceiling on what Light is worth, hydration sets what the roots can pay for,
    // and only then is it worth asking what each leaf is earning — so the rate
    // banked for the tooltips is the one the tick actually pays out.
    this.updateBuffs();
    this.updateDaylight();
    this.updateHydration();

    if (this.state.elapsedSeconds >= this.state.nextExposureAt) {
      this.state.nextExposureAt = this.state.elapsedSeconds + EXPOSURE_INTERVAL_SECONDS;
      this.updateLightExposure();
    }

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

    const hydration = this.state.hydration;

    const elapsed = this.state.elapsedSeconds;
    const buffs: BuffSnapshot[] = this.state.buffs.entries().map((buff) => {
      const duration = Math.max(1e-9, buff.expiresAt - buff.grantedAt);
      const remainingSeconds = Math.max(0, buff.expiresAt - elapsed);
      return {
        id: buff.id,
        remainingSeconds,
        fraction: Math.min(1, remainingSeconds / duration),
      };
    });

    return {
      resources,
      totals,
      perSecond,
      clickStats,
      hydration: {
        income: new Decimal(hydration.income),
        need: new Decimal(hydration.need),
        leaves: hydration.leaves,
        ratio: hydration.ratio,
        value: hydration.value,
      },
      day: dayCycle(this.state.elapsedSeconds),
      lightFactor: this.state.lightFactor,
      leafLight: this.state.leafLight,
      combo: {
        stacks,
        cap: clickStats.comboCap,
        multiplier: comboMultiplier(stacks, clickStats.comboCap),
        fill: comboFill(this.state.combo, now, clickStats.comboCap),
      },
      upgrades,
      buffs,
      // Copied, not shared: the engine pushes onto this array in place.
      totems: [...this.state.totems],
      clicks: this.state.clicks,
      prunes: this.state.prunes,
      treeRevision: this.state.tree.revision,
      treeSize: this.state.tree.size,
      tick: this.state.tick,
      elapsedSeconds: this.state.elapsedSeconds,
    };
  }
}
