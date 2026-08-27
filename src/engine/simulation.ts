import Decimal from 'break_infinity.js';
import {
  LITTER_INTERVAL_SECONDS,
  SEASON_LENGTH_SECONDS,
  STORM_BRACE_TAPS,
} from '../content/balance';
import { BUFF_BY_ID, LATERAL_SURGE_ID } from '../content/buffs';
import { GROWTH_RULE_BY_TYPE, type TreeNodeType } from '../content/growth';
import type { HybridDef } from '../content/hybrids';
import { DEW_MIN_TAPS, DEW_SECONDS, EXPOSURE_INTERVAL_SECONDS } from '../content/light';
import { RESOURCE_IDS } from '../content/resources';
import { SPECIES, STARTER_SPECIES_ID } from '../content/species';
import { SYMBIONTS, SYMBIONT_BY_ID } from '../content/symbionts';
import { TOTEM_BY_ID } from '../content/totems';
import { RAKE_ID, UPGRADES, UPGRADE_BY_ID } from '../content/upgrades';
import { WEATHER_BY_ID } from '../content/weather';
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
import {
  bondLevel,
  heirloomCost,
  heirloomModifiers,
  isHeirloomMaxed,
  isHeirloomUnlocked,
  memoryDomains,
  offlineCapHours,
  seasonLengthFactor,
  startingParts,
  startingResources,
  HEIRLOOM_SOURCE,
} from './heirlooms';
import { computeHydration, hydrationModifiers, HYDRATION_SOURCE } from './hydration';
import {
  canopyIndex,
  computeLeafExposures,
  daylightModifiers,
  lightFactorAt,
  DAYLIGHT_SOURCE,
} from './light';
import { litterAmount, litterPosition, type LitterPile } from './litter';
import { applyModifiers, type Modifier } from './modifiers';
import {
  beginCeremony,
  captureMemory,
  ceremonyFraction,
  forestModifiers,
  forestMultiplier,
  memoryParts,
  prestigeProgress as computePrestigeProgress,
  seedYield as computeSeedYield,
  summariseTree,
  treeHeight,
  FOREST_SOURCE,
  type Ceremony,
  type PrestigeProgress,
  type SeedYield,
  type TreeMemory,
} from './prestige';
import { deadwoodFor, quotePrune, woodVolume, type PruneQuote } from './prune';
import { quoteGraft, type GraftAssessment, type GraftQuote } from './graft';
import type { RandomSource } from './rng';
import {
  ringModifiers,
  ringMultiplier,
  ringsEarnedBetween,
  seasonAt,
  seasonModifiers,
  RING_SOURCE,
  SEASON_SOURCE,
  type SeasonEvent,
} from './seasons';
import {
  clickScopes,
  speciesModifiers,
  unlockProgress,
  unlockedSpeciesIds,
  SPECIES_SOURCE,
  type UnlockContext,
} from './species';
import {
  conditionProgress,
  isSymbiontMaxed,
  symbiontContext,
  symbiontLevelCost,
  symbiontModifiers,
  symbiontProgressAll,
  veinReachOf,
  SYMBIONT_SOURCE,
} from './symbionts';
import { hasFreeSlot, totemCost, totemModifiers, TOTEM_SOURCE } from './totems';
import { type TreeNode } from './treeGraph';
import { isMaxed, upgradeCost, upgradeModifiers, upgradeSource } from './upgrades';
import {
  braceFraction,
  chooseSnappedLimbs,
  weatherModifiers,
  wideLimbs,
  WEATHER_SOURCE,
  type StormReport,
  type WeatherLogEntry,
} from './weather';
import {
  createInitialState,
  type BuffSnapshot,
  type GameSnapshot,
  type GameState,
  type HeirloomSnapshot,
  type LeafLight,
  type LitterSnapshot,
  type PrestigeReport,
  type PrestigeSnapshot,
  type Resources,
  type SpeciesSnapshot,
  type SymbiontSnapshot,
  type UpgradeSnapshot,
  type WeatherSnapshot,
} from './types';
import { HEIRLOOMS, HEIRLOOM_BY_ID } from '../content/prestige';

/** What one resolved tap did, including any dawn Dew it happened to collect. */
export interface ClickOutcome extends ClickResult {
  /** Sap from the day's first tap, or `null` when this was not that tap. */
  readonly dew: Decimal | null;
}

/** What a completed graft joined, and whether it was the first of its kind. */
export interface GraftResult {
  /** The quote the graft was executed against — exactly what the preview showed. */
  readonly quote: GraftQuote;
  /** The hybrid the limb became. */
  readonly hybrid: HybridDef;
  /** Ids that changed species. */
  readonly changed: readonly string[];
  /** True when this hybrid had never been made before. */
  readonly discovered: boolean;
}

/** How one tick differs from an ordinary one. */
export interface TickOptions {
  /**
   * True while catching up on time the player was away for.
   *
   * The only thing that reads it today is the weather: a storm is a minigame,
   * and one that blew while the tab was shut is just damage taken in the dark.
   * STEP 14 owns the calculator that will pass it.
   */
  readonly offline?: boolean;
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
  /**
   * The mutable state being advanced.
   *
   * Reassignable, and only by {@link goToSeed}: a prestige builds a **fresh**
   * state and copies across the handful of things that survive, rather than
   * unwinding thirty fields in place. Anything that resets is then reset by
   * construction, and a field added in a later step cannot be forgotten by the
   * reset — the failure mode is that it starts clean, which is the safe way
   * round. Every consumer reads through `sim.state`, so the swap is invisible.
   */
  state: GameState;

  /**
   * The free roots the squirrel's buried nuts sprouted into on the way in.
   *
   * Empty on a fresh tree, and empty today on every tree — nothing persists yet
   * (STEP 15), so no nut has ever survived to a second session. It is the hook
   * the "While you were away" summary (STEP 14) will read.
   */
  readonly sproutedNuts: readonly TreeNode[];

  /**
   * The source behind every roll the simulation makes on its own: which weather
   * comes next, where a pile of leaves lands, which limb the wind takes.
   *
   * Held rather than passed per call because none of those happen in response to
   * an input — they happen in the tick, and a tick has no caller to ask.
   */
  private readonly random: RandomSource;

  constructor(initial: GameState = createInitialState(), random: RandomSource = Math.random) {
    this.state = initial;
    this.random = random;

    // Before anything is measured: a nut buried before the tab closed sprouts
    // now, so the free root is part of the tree that loads rather than something
    // that appears on top of it a moment later.
    this.sproutedNuts = this.sproutNuts(random);
    this.hydrate();
  }

  /**
   * Bring every derived reading and standing modifier into step with the state,
   * from scratch.
   *
   * The path a session takes on the way in, and the one a prestige takes on the
   * way out: both arrive holding a `GameState` nothing has been published from
   * yet, and both need exactly this order.
   */
  private hydrate(): void {
    this.syncPartProducers();
    // Permanent auras and any running buffs first: they are inputs to everything
    // measured below them, and a loaded save arrives with both already set. The
    // species mix is the same kind of standing input — it is a property of the
    // tree that was just loaded, not an event. So are the residents: a symbiont
    // is not an event either, and its vein reach has to be known before the
    // first root tip is priced.
    this.publishSymbiontModifiers();
    this.republishSpecies();
    this.republishTotems();
    this.republishBuffs();
    // The season and the rings are the widest standing inputs of all: one is a
    // condition the whole tree is living in, the other a record of the winters
    // it has already come through. The season is *re-derived* from elapsed time
    // rather than trusted from the state, and the index is marked as seen, so a
    // save loaded in mid-winter does not pay out for the winters before it.
    this.state.season = seasonAt(this.state.elapsedSeconds, this.state.seasonLengthSeconds);
    this.state.seasonIndexSeen = this.state.season.index;
    this.republishSeason();
    this.republishRings();
    // The two that outlive the tree entirely: what the Vault has been spent on,
    // and how many trees stand behind this one. Both are as standing as an aura
    // and neither has anything to do with the run they are being applied to.
    this.republishHeirlooms();
    this.republishForest();
    // Producers are rebuilt once the reach is known: a root tip that only finds
    // its pocket through the fungus would otherwise load barren.
    this.syncPartProducers();
    this.updateDaylight();
    this.updateHydration();
    this.updateLightExposure();
    this.updateSymbionts();
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
   * @param nodeId the part that was struck, when the caller knows it. A tap on a
   *               limb resolves its stats against that limb's species too, which
   *               is what makes a grafted limb worth *tapping* rather than
   *               merely worth owning.
   */
  click(
    now: number = Date.now(),
    random: RandomSource = Math.random,
    nodeId?: string | null,
  ): ClickOutcome {
    const stats = resolveClickStats(this.state.modifiers, clickScopes(this.state.tree, nodeId));
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
  growthOptions(
    nodeId: string,
    speciesId: string = this.state.plantingSpecies,
  ): PricedGrowthOption[] {
    return priceGrowthOptions(
      this.state.tree,
      nodeId,
      this.state.resources,
      this.state.modifiers,
      this.state.soil,
      speciesId,
      this.state.veinReach,
    );
  }

  /**
   * Choose what new parts are grown as. Returns `false` for a species that is
   * unknown, still locked, or a hybrid.
   *
   * This is the one place unlock gating is enforced, because it is the one place
   * the player expresses the choice: {@link growPart} takes the species it is
   * given, the way it takes the node it is given.
   */
  setPlantingSpecies(speciesId: string): boolean {
    if (!this.unlockedSpecies().includes(speciesId)) return false;
    this.state.plantingSpecies = speciesId;
    return true;
  }

  /** Base species the player may currently plant, in catalogue order. */
  unlockedSpecies(): string[] {
    return unlockedSpeciesIds(this.unlockContext());
  }

  /** The live state the unlock milestones are evaluated against. */
  private unlockContext(): UnlockContext {
    const tree = this.state.tree;
    return {
      lifetime: (resource) => this.state.resources.total(resource),
      // The trunk is not something the player grew, so it does not count toward
      // a "grow N parts" milestone.
      parts: Math.max(0, tree.size - 1),
      partsOfType: (type) => tree.countOfType(type),
      prunes: this.state.prunes,
    };
  }

  /**
   * Republish the modifiers the tree's current species mix grants.
   *
   * Called after anything that can change what the tree is made of — growing,
   * pruning, grafting — because whole-tree traits are scaled by each species'
   * *share*, and every one of those events moves the shares.
   */
  republishSpecies(): void {
    this.state.modifiers.removeBySource(SPECIES_SOURCE);
    for (const modifier of speciesModifiers(this.state.tree.countBySpecies())) {
      this.state.modifiers.add(modifier);
    }
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
    speciesId: string = this.state.plantingSpecies,
  ): TreeNode | null {
    const tree = this.state.tree;
    if (!tree.getValidGrowthOptions(nodeId).some((option) => option.type === childType)) {
      return null;
    }

    // Hybrids are made at a fork, not bought from a menu; an unknown id is a
    // caller bug and must not silently plant something else.
    if (!SPECIES.some((def) => def.id === speciesId)) return null;

    const rule = GROWTH_RULE_BY_TYPE[childType];
    // Priced through the modifiers *and* the species, so a cheap species and a
    // growth discount both reach the till and not just the menu label.
    const cost = partCost(childType, tree.countOfType(childType), this.state.modifiers, speciesId);
    if (this.state.resources.amount(rule.costResource).lt(cost)) return null;

    const node = tree.grow(nodeId, childType, speciesId, this.state.tick);
    if (!node) return null;

    this.state.resources.add(rule.costResource, cost.neg());

    const producer = partProducer(node, {
      soil: this.state.soil,
      placement: tree.placements().get(node.id),
      veinReach: this.state.veinReach,
    });
    if (producer) this.addProducer(producer);

    // The mix moved: a whole-tree trait is worth its species' share of the tree,
    // and this part just changed the denominator for every species on it.
    this.republishSpecies();

    // A new root (or a new leaf drinking from them) moves the hydration balance
    // immediately, so the HUD and the next tap agree with the purchase that was
    // just made rather than lagging a tick behind it. The same goes for shade:
    // a leaf dropped into a crowded canopy dims its neighbours the moment it
    // lands, not on the next sweep.
    this.updateHydration();
    this.updateLightExposure();
    // Growing is the only thing that can *satisfy* an attraction condition, so
    // the third blossom brings the bees on the purchase rather than up to a
    // tenth of a second later.
    this.updateSymbionts();
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

    this.republishSpecies();
    this.updateHydration();
    this.updateLightExposure();
    // A cut cannot evict anyone, but it moves the progress bars of everyone who
    // has not arrived yet, and the panel should not read a tenth of a second
    // stale.
    this.updateSymbionts();
    return { quote, removed, surge };
  }

  /**
   * Assess a graft between two limbs: a full quote, or the reason it is refused.
   * This is what the graft-mode tooltip renders.
   */
  graftQuote(aId: string, bId: string): GraftAssessment {
    return quoteGraft(this.state.tree, aId, bId, this.state.grafts, this.state.discoveries);
  }

  /**
   * Join two limbs into a hybrid: pay the price, turn the scion and everything
   * it carries into the new species, and record the discovery if it is the first
   * of its kind.
   *
   * Returns `null` and changes nothing when the pair cannot be grafted or the
   * price cannot be met. As with pruning, the quote is taken before anything is
   * touched, so the transaction is the preview the player was reading.
   */
  graft(aId: string, bId: string): GraftResult | null {
    const quote = this.graftQuote(aId, bId);
    if (!quote.ok) return null;

    for (const line of quote.costs) {
      if (this.state.resources.amount(line.resource).lt(line.amount)) return null;
    }
    for (const line of quote.costs) {
      this.state.resources.add(line.resource, line.amount.neg());
    }

    const changed = this.state.tree.respeciate(quote.scionId, quote.hybrid.id);
    this.state.grafts += 1;

    const discovered = !this.state.discoveries.has(quote.hybrid.id);
    this.state.discoveries.add(quote.hybrid.id);

    // Every producer on the limb now carries different species tags, so they are
    // rebuilt wholesale rather than patched — the same from-scratch path a load
    // takes, and the only one that cannot leave a stale tag behind.
    this.syncPartProducers();
    this.republishSpecies();
    this.updateHydration();
    this.updateLightExposure();
    // The scion changed species, and the squirrel counts oak branches.
    this.updateSymbionts();

    return { quote, hybrid: quote.hybrid, changed: changed.map((node) => node.id), discovered };
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
   * Settle in any creature the tree has become worth living in, and refresh
   * every symbiont's standing for the panel.
   *
   * Arrivals are queued rather than returned, because they happen inside the
   * tick and the thing that wants to celebrate them is a React component two
   * layers away — see {@link drainSymbiontArrivals}.
   *
   * A resident is never evicted. Pruning the blossoms that drew the bees does
   * not send them away: the conditions are an *attraction* mechanic, and a
   * creature that has to be maintained would turn every cut into a hostage
   * negotiation.
   */
  updateSymbionts(): string[] {
    const ctx = symbiontContext(this.state.tree, (resource) => this.state.resources.total(resource));

    const arrived: string[] = [];
    for (const def of SYMBIONTS) {
      if (this.state.symbionts.has(def.id)) continue;
      if (!conditionProgress(def.condition, ctx).met) continue;
      if (this.state.symbionts.arrive(def, this.state.elapsedSeconds)) arrived.push(def.id);
    }

    if (arrived.length > 0) {
      this.state.symbiontArrivals.push(...arrived);
      this.republishSymbionts();
    }

    this.state.symbiontProgress = symbiontProgressAll(
      this.state.symbionts,
      ctx,
      this.state.elapsedSeconds,
    );
    return arrived;
  }

  /**
   * Take the arrivals nobody has celebrated yet. Draining is the point: an
   * arrival is a one-off event, and a queue the UI empties cannot replay a
   * toast on the next frame the way a flag on the snapshot would.
   */
  drainSymbiontArrivals(): string[] {
    if (this.state.symbiontArrivals.length === 0) return [];
    return this.state.symbiontArrivals.splice(0, this.state.symbiontArrivals.length);
  }

  /**
   * Settle the payouts that run on a clock: the songbird's Seed Fragments and
   * the squirrel's buried nuts.
   *
   * Counted in whole intervals rather than once per call, so the same code is
   * correct for a 100 ms tick and for STEP 14's offline catch-up.
   */
  private collectSymbiontPayouts(): void {
    for (const { id, count } of this.state.symbionts.claimDue(this.state.elapsedSeconds)) {
      const payout = SYMBIONT_BY_ID[id]?.cadence?.payout;
      if (!payout) continue;

      const earned = count * payout.perLevel * this.state.symbionts.level(id);
      if (payout.kind === 'seedFragments') {
        this.state.seedFragments += earned;
      } else {
        this.state.buriedNuts += earned;
      }
    }
  }

  /**
   * Publish the residents' modifiers and re-read the reach they lend to
   * mineral detection. Returns whether that reach moved.
   *
   * Split out from {@link republishSymbionts} so construction can order the
   * refresh itself: at that point there are no producers to rebuild yet.
   */
  private publishSymbiontModifiers(): boolean {
    this.state.modifiers.removeBySource(SYMBIONT_SOURCE);

    const living = this.state.symbionts.entries();
    for (const modifier of symbiontModifiers(living)) {
      this.state.modifiers.add(modifier);
    }

    const reach = veinReachOf(living);
    const moved = reach !== this.state.veinReach;
    this.state.veinReach = reach;
    return moved;
  }

  /**
   * Republish every resident's effects after an arrival or a level-up.
   *
   * A wider vein reach can turn a barren root tip into a producing one, and a
   * producer that does not exist cannot be patched — so the whole part
   * pipeline is rebuilt whenever the reach moves, the same from-scratch path a
   * graft takes.
   */
  republishSymbionts(): void {
    if (this.publishSymbiontModifiers()) this.syncPartProducers();
    this.updateHydration();
    this.updateLightExposure();
  }

  /**
   * Buy one level of a symbiont's track, paying every line of its price.
   *
   * Returns `false` and changes nothing when it has not arrived, is already at
   * the top of its track, or any one line cannot be met — prices are mixed on
   * purpose, and a partial payment would be worse than a refusal.
   */
  upgradeSymbiont(id: string): boolean {
    const def = SYMBIONT_BY_ID[id];
    if (!def) return false;

    const level = this.state.symbionts.level(id);
    if (level <= 0 || isSymbiontMaxed(level)) return false;

    const cost = symbiontLevelCost(def, level);
    if (!cost) return false;

    for (const line of cost) {
      if (this.state.resources.amount(line.resource).lt(line.amount)) return false;
    }
    for (const line of cost) {
      this.state.resources.add(line.resource, line.amount.neg());
    }

    this.state.symbionts.setLevel(id, level + 1);
    this.republishSymbionts();
    // The panel reads the banked progress rows, so they have to move with the
    // purchase: a level pip that fills a tenth of a second after the click reads
    // as the button not having worked.
    this.updateSymbionts();
    return true;
  }

  /**
   * Grow the buried nuts into free root segments, without touching anything
   * else. The low-level half of {@link plantBuriedNuts}, so the constructor can
   * order the refresh that follows for itself.
   *
   * A nut that has nowhere to sprout is *kept*, not spent: the ground is full
   * today and will not be after the next prune.
   */
  private sproutNuts(random: RandomSource): TreeNode[] {
    const grown: TreeNode[] = [];

    while (this.state.buriedNuts > 0) {
      const hosts = this.state.tree
        .allNodes()
        .filter((node) =>
          this.state.tree.getValidGrowthOptions(node.id).some((o) => o.type === 'rootSegment'),
        );
      if (hosts.length === 0) break;

      const host = hosts[Math.min(hosts.length - 1, Math.floor(random() * hosts.length))];
      // A squirrel buries acorns, and it took up residence in an oak — so what
      // comes up is oak, whatever the player happens to be planting today.
      const node = this.state.tree.grow(host.id, 'rootSegment', STARTER_SPECIES_ID, this.state.tick);
      if (!node) break;

      this.state.buriedNuts -= 1;
      grown.push(node);
    }

    return grown;
  }

  /**
   * Sprout every buried nut into a free root segment and bring the economy back
   * into step. Returns the new roots.
   *
   * Called once on the way into a session (see the constructor). Exposed so a
   * test — and, later, the offline calculator — can drive it directly.
   */
  plantBuriedNuts(random: RandomSource = Math.random): TreeNode[] {
    const grown = this.sproutNuts(random);
    if (grown.length === 0) return grown;

    this.syncPartProducers();
    this.republishSpecies();
    this.updateHydration();
    this.updateLightExposure();
    return grown;
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
        veinReach: this.state.veinReach,
      });
      if (producer) this.addProducer(producer);
    }
  }

  /**
   * Republish the standing modifiers of whichever season it is.
   *
   * One revocable source, so a season can never leave anything behind when the
   * wheel turns — the same contract a buff keeps, on a much slower clock.
   */
  republishSeason(): void {
    this.state.modifiers.removeBySource(SEASON_SOURCE);
    for (const modifier of seasonModifiers(this.state.season.def)) {
      this.state.modifiers.add(modifier);
    }
  }

  /** Republish what the trunk's rings are worth on everything the tree makes. */
  republishRings(): void {
    this.state.modifiers.removeBySource(RING_SOURCE);
    for (const modifier of ringModifiers(this.state.rings)) {
      this.state.modifiers.add(modifier);
    }
  }

  /**
   * Turn the wheel: re-read the season and, when it has moved, hand out the
   * rings owed for every winter that came through in between.
   *
   * The reading is derived from elapsed time, so it is right whether the last
   * call was a tenth of a second ago or a week; `seasonIndexSeen` exists only so
   * a *boundary* can be noticed. Rings are counted over the whole span rather
   * than one per call, which is what makes an offline jump pay exactly what
   * sitting through it would have.
   */
  updateSeason(): SeasonEvent[] {
    const cycle = seasonAt(this.state.elapsedSeconds, this.state.seasonLengthSeconds);
    this.state.season = cycle;
    if (cycle.index === this.state.seasonIndexSeen) return [];

    const events: SeasonEvent[] = [];
    const rings = ringsEarnedBetween(this.state.seasonIndexSeen, cycle.index);
    this.state.seasonIndexSeen = cycle.index;

    if (rings > 0) {
      this.state.rings += rings;
      this.republishRings();
      events.push({ kind: 'ring', rings, total: this.state.rings });
    }

    events.push({ kind: 'season', id: cycle.id, index: cycle.index });
    this.republishSeason();
    // Prices and the value of a leaf both just moved. The banked per-leaf rates
    // feed a tooltip, and a tooltip that still quotes summer in October is the
    // kind of thing a player reads as the season not having taken effect.
    this.updateLightExposure();

    this.state.seasonEvents.push(...events);
    return events;
  }

  /**
   * Take the season turns and rings nobody has celebrated yet.
   *
   * Drained rather than read off the snapshot, for the same reason symbiont
   * arrivals are: a flag would replay the toast on every frame.
   */
  drainSeasonEvents(): SeasonEvent[] {
    if (this.state.seasonEvents.length === 0) return [];
    return this.state.seasonEvents.splice(0, this.state.seasonEvents.length);
  }

  /**
   * Advance the sky, publish whatever it is doing, and settle a storm that has
   * just blown itself out.
   *
   * `offline` is passed straight through to the scheduler as "no storms": one
   * is never drawn while the player is away, and one already announced when they
   * left is dropped rather than run.
   */
  updateWeather(offline = false): WeatherLogEntry[] {
    const events = this.state.weather.update(
      this.state.elapsedSeconds,
      this.random,
      !offline,
    );
    if (events.length === 0) return [];

    const logged: WeatherLogEntry[] = [];
    for (const event of events) {
      if (event.kind === 'start' && event.id === 'storm') this.state.stormTaps = 0;
      logged.push(
        event.kind === 'end' && event.id === 'storm'
          ? { ...event, storm: this.resolveStorm() }
          : event,
      );
    }

    this.publishWeather();
    this.state.weatherEvents.push(...logged);
    return logged;
  }

  /** Take the weather nobody has reacted to yet. */
  drainWeatherEvents(): WeatherLogEntry[] {
    if (this.state.weatherEvents.length === 0) return [];
    return this.state.weatherEvents.splice(0, this.state.weatherEvents.length);
  }

  /**
   * Republish the running event's modifiers, or clear them for a clear sky.
   *
   * Called from inside the tick ahead of hydration, so the Water a rain triples
   * is the Water the canopy is measured against on the very tick it starts.
   */
  publishWeather(): void {
    this.state.modifiers.removeBySource(WEATHER_SOURCE);
    const active = this.state.weather.active;
    if (!active) return;

    const def = WEATHER_BY_ID[active.id];
    if (!def) return;
    for (const modifier of weatherModifiers(def)) {
      this.state.modifiers.add(modifier);
    }
  }

  /**
   * Hold the trunk. One tap on the anchor, banked against the storm currently
   * blowing; `false` when there is no storm to brace against.
   *
   * Resolved immediately and outside the tick, exactly as a tap on the tree is:
   * a brace is a burst of clicks, and a burst the frame loop could coalesce
   * would make the minigame a lie.
   */
  braceStorm(): boolean {
    const active = this.state.weather.active;
    if (!active || active.id !== 'storm') return false;
    this.state.stormTaps += 1;
    return true;
  }

  /**
   * Settle what the storm took on its way out.
   *
   * Every wide limb rolls separately against how well the tree was braced, and
   * at most {@link STORM_MAX_SNAPS} come off however the rolls fall. What snaps
   * pays **Deadwood only** — a storm is not a harvest, and there is no refund
   * for wood the player did not choose to cut.
   */
  private resolveStorm(): StormReport {
    const taps = this.state.stormTaps;
    const brace = braceFraction(taps);
    const exposed = wideLimbs(this.state.tree);

    const snapped: string[] = [];
    let wood = 0;

    for (const limb of chooseSnappedLimbs(exposed, brace, this.random)) {
      // A limb that went with its parent is already gone; the wind cannot take
      // it twice.
      if (!this.state.tree.node(limb.id)) continue;

      const removed = this.state.tree.prune(limb.id);
      if (removed.length === 0) continue;

      for (const node of removed) this.removeProducer(partProducerId(node.id));
      wood += woodVolume(removed);
      snapped.push(limb.id);
    }

    const deadwood = deadwoodFor(wood);
    if (snapped.length > 0) {
      this.state.resources.add('deadwood', deadwood);
      this.syncPartProducers();
      this.republishSpecies();
      this.updateHydration();
      this.updateLightExposure();
      this.updateSymbionts();
    }

    this.state.stormTaps = 0;
    return { taps, brace, exposed: exposed.length, snapped, deadwood };
  }

  /**
   * Shed a pile of leaves at the base, if it is autumn and one is due.
   *
   * Outside autumn the clock is simply kept level with now, so the first pile of
   * a new autumn lands one interval in rather than the instant the wheel turns —
   * and a season spent elsewhere never banks a backlog.
   */
  updateLitter(): LitterPile | null {
    const elapsed = this.state.elapsedSeconds;

    if (!this.state.season.def.shedsLitter) {
      this.state.nextLitterAt = elapsed + LITTER_INTERVAL_SECONDS;
      return null;
    }
    if (elapsed < this.state.nextLitterAt) return null;
    this.state.nextLitterAt = elapsed + LITTER_INTERVAL_SECONDS;

    // A bare tree sheds nothing. There is no minimum pile for a tree with no
    // leaves on it — the floor is for a *thin* canopy, not for an absent one.
    const leaves = this.state.tree.countOfType('leafCluster');
    if (leaves <= 0) return null;

    const pile = this.state.litter.spawn(
      litterAmount(leaves),
      litterPosition(this.random),
      elapsed,
    );
    if (pile && this.hasRake()) {
      this.collectLitter(pile.id);
      return null;
    }
    return pile;
  }

  /** Whether the Rake has been bought — autumn's piles sweep themselves. */
  hasRake(): boolean {
    return this.state.upgrades.level(RAKE_ID) > 0;
  }

  /**
   * Sweep one pile up. Returns what it was worth, or `null` when there is no
   * pile by that id — a second click on the same heap must not pay twice.
   */
  collectLitter(id: string): LitterPile | null {
    const pile = this.state.litter.collect(id);
    if (!pile) return null;
    this.state.resources.add('leafLitter', pile.amount);
    return pile;
  }

  /** Sweep the whole base at once. What the Rake does, and what buying it does. */
  sweepLitter(): Decimal {
    let total = new Decimal(0);
    for (const pile of this.state.litter.collectAll()) {
      this.state.resources.add('leafLitter', pile.amount);
      total = total.add(pile.amount);
    }
    return total;
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
        veinReach: this.state.veinReach,
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
    // Buying the Rake sweeps the base on the spot. A tool that only works on
    // leaves shed *after* it was bought would be a strange tool.
    if (def.id === RAKE_ID) this.sweepLitter();
    return true;
  }

  /* ------------------------------------------------------------- prestige */

  /**
   * Republish what the Seed Vault is worth.
   *
   * One revocable source for twenty heirlooms, exactly as the season has one for
   * four: buying a level revokes the whole set and re-grants it at the new level,
   * so an effect can never stack with its own previous instance.
   */
  republishHeirlooms(): void {
    this.state.modifiers.removeBySource(HEIRLOOM_SOURCE);
    for (const modifier of heirloomModifiers(this.state.heirlooms)) {
      this.state.modifiers.add(modifier);
    }
  }

  /** Republish what the trees standing behind this one are worth. */
  republishForest(): void {
    this.state.modifiers.removeBySource(FOREST_SOURCE);
    for (const modifier of forestModifiers(this.state.forest.length)) {
      this.state.modifiers.add(modifier);
    }
  }

  /** How close the tree is to maturity, against both gates. */
  prestigeProgress(): PrestigeProgress {
    return computePrestigeProgress(treeHeight(this.state.tree), this.state.resources.total('light'));
  }

  /** What going to seed right now would pay. */
  prestigeYield(): SeedYield {
    return computeSeedYield(this.state.resources.total('light'), this.state.seedFragments);
  }

  /** Whether the ceremony can be started: mature, and not already under way. */
  canGoToSeed(): boolean {
    return this.state.ceremony === null && this.prestigeProgress().ready;
  }

  /**
   * Commit to seeding. Starts the six-second ceremony and returns it, or `null`
   * when the tree is not ready (or is already seeding).
   *
   * The payout is **locked in here**, not when the ceremony lands: the number on
   * the confirm button is the number the player agreed to, and six more seconds
   * of Light must not quietly change it. There is deliberately no way to call it
   * off — going to seed is the one irreversible thing in the game, and a cancel
   * button would turn the ceremony into a dialog.
   */
  goToSeed(): Ceremony | null {
    if (!this.canGoToSeed()) return null;

    const ceremony = beginCeremony(this.state.elapsedSeconds, this.prestigeYield());
    this.state.ceremony = ceremony;
    return ceremony;
  }

  /**
   * Land a ceremony whose six seconds are up. Returns what it did, or `null`
   * when there is nothing running or it has not finished.
   */
  updateCeremony(): PrestigeReport | null {
    const ceremony = this.state.ceremony;
    if (!ceremony || this.state.elapsedSeconds < ceremony.endsAt) return null;

    const report = this.commitPrestige(ceremony);
    this.state.prestigeEvents.push(report);
    return report;
  }

  /** Take the prestiges nobody has celebrated yet. */
  drainPrestigeEvents(): PrestigeReport[] {
    if (this.state.prestigeEvents.length === 0) return [];
    return this.state.prestigeEvents.splice(0, this.state.prestigeEvents.length);
  }

  /**
   * End the run: pay the Seeds, stand the old tree on the hills, and start again.
   *
   * The reset is a **swap, not an unwind**. A fresh {@link createInitialState} is
   * built and the handful of things that outlive a tree are copied onto it —
   * Seeds, Heirlooms, Rings, the Journal's discoveries, the forest, the bond, and
   * the ground itself. Everything else resets because it was never carried, which
   * is the safe way round: a field added by a later step starts clean rather than
   * leaking into the next run because someone forgot a line here.
   *
   * What is deliberately *not* carried, beyond the obvious:
   * - **Planted totems.** The recipes are content and are never forgotten, but a
   *   carving stands at the base of a tree that no longer exists.
   * - **Residents.** A creature lived in *that* tree. The Bond heirloom is the
   *   supported way to keep one, and it costs Seeds precisely because free
   *   symbionts across a reset would make the whole branch pointless.
   * - **Species unlocks.** They are milestones against this run's totals, so they
   *   re-earn themselves — much faster, on a tree that starts with heirlooms.
   */
  private commitPrestige(ceremony: Ceremony): PrestigeReport {
    const old = this.state;
    const awarded = ceremony.yield.total;

    const tree = summariseTree(old.tree, {
      slot: old.forest.length,
      rings: old.rings,
      seeds: awarded,
    });
    // Recorded even when no Memory heirloom is owned: it costs nothing, and a
    // player who buys Root Map later should get the tree they actually left.
    const memory = captureMemory(old.tree);

    const seeds = old.resources.amount('seeds').add(awarded);
    const seedsEverEarned = old.resources.total('seeds').add(awarded);

    const next = createInitialState(Date.now());
    // The ground does not change because a tree died. Carrying the same soil map
    // is also what keeps the Memory heirlooms honest — a remembered root layout
    // has to come up in the same veins it was dug for.
    next.soil = old.soil;
    next.rings = old.rings;
    next.discoveries = old.discoveries;
    next.heirlooms = old.heirlooms;
    next.bondSymbiont = old.bondSymbiont;
    next.forest = [...old.forest, tree];
    next.memory = memory;
    next.resources.restore('seeds', seeds, seedsEverEarned);
    next.seedFragments = ceremony.yield.fragmentsRemaining;
    // Tempo applies from the first tick of the new run, and the year is derived
    // from elapsed time — which is back at zero, so the seedling opens in Spring
    // exactly as the very first one did.
    next.seasonLengthSeconds = SEASON_LENGTH_SECONDS * seasonLengthFactor(old.heirlooms);
    next.season = seasonAt(0, next.seasonLengthSeconds);

    this.state = next;
    // `runStartLevels` is empty on the fresh state, so this grants the whole
    // Vault rather than a delta — and this is the one call that replays a layout.
    const remembered = this.grantRunStart(true);
    this.hydrate();

    return {
      yield: ceremony.yield,
      tree,
      forestSize: next.forest.length,
      seeds,
      remembered,
    };
  }

  /**
   * Hand the run whatever the Vault has bought it and this run has not been
   * given yet: a balance, a layout, a friend.
   *
   * Returns how many parts came back from memory.
   *
   * Called from two places, and the difference between them is the whole point
   * of `runStartLevels`. At a **prestige** the record is empty, so this grants
   * everything the Vault provides. At a **purchase** the record holds what the
   * run already had, so it grants only the level just bought — which is what
   * makes a Seedcase bought with the Seed the reset just paid put 200 Sap on the
   * tree *now* rather than a whole run later. Deferring it would leave the first
   * purchase every player makes looking like a button that does nothing.
   *
   * The layout is the exception and stays deferred: replaying a remembered tree
   * into one the player has already been building would fight for slots that are
   * taken, and half a tree arriving mid-run is not what "start with your previous
   * layout" means. `replayed` is what says so.
   *
   * At a prestige this runs *before* {@link hydrate}, so nothing here has to
   * register a producer or republish a species share — the from-scratch pass that
   * follows does all of it at once, on the finished tree rather than part by part.
   */
  private grantRunStart(replayed: boolean): number {
    const state = this.state;
    const heirlooms = state.heirlooms;

    // What the Vault provides *minus* what this run has already been handed.
    const granted = state.runStartLevels;
    const owed = { level: (id: string) => Math.max(0, heirlooms.level(id) - (granted[id] ?? 0)) };

    for (const line of startingResources(owed)) {
      state.resources.add(line.resource, line.amount);
    }

    const domains = memoryDomains(heirlooms);
    const remembered =
      replayed && state.memory && domains.size > 0
        ? this.replayMemory(state.memory, domains)
        : 0;

    // Loose parts go on *after* the layout: with Memory owned the trunk may
    // already be carrying what the previous run put there, and First Limb should
    // add to that rather than compete for the same slot.
    for (const { type, count } of startingParts(owed)) {
      for (let i = 0; i < count; i += 1) {
        if (!this.growFree(state.tree.rootId, type, STARTER_SPECIES_ID)) break;
      }
    }

    // The bond is settled against the *full* ledger rather than the delta: both
    // calls beneath it are idempotent — a creature already in residence does not
    // arrive twice, and a level is set rather than added — so asking for the
    // whole thing every time is both simpler and correct.
    const level = bondLevel(heirlooms);
    const def = state.bondSymbiont ? SYMBIONT_BY_ID[state.bondSymbiont] : undefined;
    if (level > 0 && def) {
      state.symbionts.arrive(def, state.elapsedSeconds);
      state.symbionts.setLevel(def.id, level);
    }

    for (const [id, owned] of heirlooms.entries()) granted[id] = owned;
    return remembered;
  }

  /**
   * Rebuild one or both halves of the previous tree, free of charge.
   *
   * The memory is a list of purchases in the order they were made, so a plain
   * forward walk always has the parent already standing — old ids are mapped to
   * new ones as they are grown. A part whose parent belonged to the half that is
   * *not* being replayed simply finds nothing in the map and is skipped, which is
   * what makes "roots only" a filter rather than a special case.
   *
   * Anything the growth rules now refuse is skipped too rather than retried
   * elsewhere: a remembered tree is a shape, and a part that cannot go back where
   * it was does not belong somewhere else instead.
   */
  private replayMemory(memory: TreeMemory, domains: ReadonlySet<'root' | 'canopy'>): number {
    const ids = new Map<string, string>([[memory.rootId, this.state.tree.rootId]]);
    let grown = 0;

    for (const part of memoryParts(memory, domains)) {
      const parentId = ids.get(part.parentId);
      if (!parentId) continue;

      const node = this.growFree(parentId, part.type, part.speciesId);
      if (!node) continue;

      ids.set(part.id, node.id);
      grown += 1;
    }

    return grown;
  }

  /**
   * Grow a part without charging for it. The Vault's purchases are made in Seeds,
   * and the part is what the Seeds already bought.
   */
  private growFree(
    parentId: string,
    type: TreeNodeType,
    speciesId: string,
  ): TreeNode | null {
    return this.state.tree.grow(parentId, type, speciesId, this.state.tick);
  }

  /**
   * Buy one level of an heirloom, paying in Seeds.
   *
   * Returns `false` and changes nothing when the id is unknown, the node is still
   * closed behind the one before it, its track is full, or the Seeds are not
   * there.
   */
  buyHeirloom(id: string): boolean {
    const def = HEIRLOOM_BY_ID[id];
    if (!def) return false;

    const heirlooms = this.state.heirlooms;
    const level = heirlooms.level(id);
    if (isHeirloomMaxed(def, level)) return false;
    if (!isHeirloomUnlocked(id, heirlooms)) return false;

    const cost = heirloomCost(def, level);
    if (this.state.resources.amount('seeds').lt(cost)) return false;

    this.state.resources.add('seeds', cost.neg());
    heirlooms.setLevel(id, level + 1);
    this.republishHeirlooms();

    // Top the current run up by exactly the level just bought. A layout is never
    // replayed mid-run — see {@link grantRunStart}.
    const planted = this.state.tree.size;
    this.grantRunStart(false);
    if (this.state.tree.size !== planted) {
      this.syncPartProducers();
      this.republishSpecies();
    }
    this.republishSymbionts();

    // Tempo's Quickening shortens the season *this run is already inside*, and
    // which season it is is derived from elapsed time — so a shorter year means
    // a different reading of the same moment. The index is re-marked as seen at
    // the same time: the winters that would suddenly be "behind" the tree were
    // never lived through, and paying rings for them would make the heirloom a
    // way to buy the one multiplier that cannot be bought.
    this.state.seasonLengthSeconds =
      SEASON_LENGTH_SECONDS * seasonLengthFactor(heirlooms);
    this.state.season = seasonAt(this.state.elapsedSeconds, this.state.seasonLengthSeconds);
    this.state.seasonIndexSeen = this.state.season.index;
    this.republishSeason();

    this.updateHydration();
    this.updateLightExposure();
    return true;
  }

  /**
   * Choose which creature the Bond heirloom brings. `null` clears the choice.
   *
   * Storable before the bond is bought and kept after prestige, because it is a
   * *preference* rather than a purchase — the Vault shows the picker greyed until
   * Old Friend is owned, and a player who changes their mind between runs should
   * not have to buy anything again.
   */
  setBondSymbiont(id: string | null): boolean {
    if (id === null) {
      this.state.bondSymbiont = null;
      return true;
    }
    if (!SYMBIONT_BY_ID[id]) return false;
    this.state.bondSymbiont = id;
    return true;
  }

  /** Advance the simulation by one fixed step of `dtSeconds`. */
  tick(dtSeconds: number, options: TickOptions = {}): void {
    this.state.tick += 1;
    this.state.elapsedSeconds += dtSeconds;
    this.state.lastUpdatedAt = Date.now();

    // Order matters. Lapsed buffs go first — a tick must not pay out through a
    // modifier whose time ran out before it started. The season and the sky
    // follow, because they are the widest standing conditions there are: a rain
    // that starts on this tick must be worth its triple *on* this tick, and a
    // winter that turns on it must not pay out a single second at summer's
    // rates. Residents come next for the same reason. Then the sun sets the
    // ceiling on what Light is worth, hydration sets what the roots can pay for,
    // and only then is it worth asking what each leaf is earning — so the rate
    // banked for the tooltips is the one the tick actually pays out.
    // A ceremony that has run its six seconds lands before anything else, because
    // everything below this line belongs to a tree that may no longer exist. The
    // rest of the tick then runs on the seedling, which is right: the new run's
    // clock starts here.
    this.updateCeremony();

    this.updateBuffs();
    this.updateSeason();
    this.updateWeather(options.offline === true);
    this.updateLitter();
    this.updateSymbionts();
    this.collectSymbiontPayouts();
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

    const unlocks = this.unlockContext();
    const species: SpeciesSnapshot = {
      planting: this.state.plantingSpecies,
      unlocked: unlockedSpeciesIds(unlocks),
      unlocks: SPECIES.map((def) => ({ id: def.id, ...unlockProgress(def, unlocks) })),
      // Copied: the graph keeps this tally live and mutates it in place.
      counts: new Map(this.state.tree.countBySpecies()),
      discovered: [...this.state.discoveries],
      grafts: this.state.grafts,
    };

    const elapsed = this.state.elapsedSeconds;

    const heirloomLedger = this.state.heirlooms;
    const heirlooms: HeirloomSnapshot[] = HEIRLOOMS.map((def) => {
      const level = heirloomLedger.level(def.id);
      const cost = heirloomCost(def, level);
      return {
        id: def.id,
        level,
        cost,
        affordable: resources.seeds.gte(cost),
        maxed: isHeirloomMaxed(def, level),
        unlocked: isHeirloomUnlocked(def.id, heirloomLedger),
      };
    });

    const ceremony = this.state.ceremony;
    const prestige: PrestigeSnapshot = {
      progress: this.prestigeProgress(),
      yield: this.prestigeYield(),
      ceremony: ceremony
        ? {
            fraction: ceremonyFraction(ceremony, elapsed),
            remainingSeconds: Math.max(0, ceremony.endsAt - elapsed),
            yield: ceremony.yield,
          }
        : null,
      // Copied: the engine pushes onto this array in place.
      forest: [...this.state.forest],
      forestMultiplier: forestMultiplier(this.state.forest.length),
      heirlooms,
      bondSymbiont: this.state.bondSymbiont,
      bonded: bondLevel(heirloomLedger) > 0,
      offlineCapHours: offlineCapHours(heirloomLedger),
      remembered: this.state.memory?.parts.length ?? 0,
    };

    const buffs: BuffSnapshot[] = this.state.buffs.entries().map((buff) => {
      const duration = Math.max(1e-9, buff.expiresAt - buff.grantedAt);
      const remainingSeconds = Math.max(0, buff.expiresAt - elapsed);
      return {
        id: buff.id,
        remainingSeconds,
        fraction: Math.min(1, remainingSeconds / duration),
      };
    });

    const symbionts: SymbiontSnapshot[] = this.state.symbiontProgress.map((progress) => {
      const def = SYMBIONT_BY_ID[progress.id];
      const nextCost = def ? symbiontLevelCost(def, progress.level) : null;
      return {
        ...progress,
        maxed: progress.active && isSymbiontMaxed(progress.level),
        nextCost,
        affordable:
          nextCost !== null && nextCost.every((line) => resources[line.resource].gte(line.amount)),
      };
    });

    const active = this.state.weather.active;
    const pending = this.state.weather.pending;
    const activeDef = active ? WEATHER_BY_ID[active.id] : null;
    const weather: WeatherSnapshot = {
      active:
        active && activeDef
          ? {
              id: active.id,
              remainingSeconds: Math.max(0, active.endsAt - elapsed),
              fraction: Math.min(
                1,
                Math.max(0, (active.endsAt - elapsed) / Math.max(1e-9, activeDef.durationSeconds)),
              ),
            }
          : null,
      pending: pending ? { id: pending.id, inSeconds: Math.max(0, pending.startsAt - elapsed) } : null,
      storm:
        active?.id === 'storm'
          ? {
              taps: this.state.stormTaps,
              target: STORM_BRACE_TAPS,
              brace: braceFraction(this.state.stormTaps),
            }
          : null,
    };

    // Cloned: the ground hands out its own records and the engine splices them.
    const litter: LitterSnapshot[] = this.state.litter
      .entries()
      .map((pile) => ({
        id: pile.id,
        x: pile.x,
        amount: new Decimal(pile.amount),
        spawnedAt: pile.spawnedAt,
      }));

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
      season: this.state.season,
      rings: this.state.rings,
      ringMultiplier: ringMultiplier(this.state.rings),
      weather,
      litter,
      leafLight: this.state.leafLight,
      combo: {
        stacks,
        cap: clickStats.comboCap,
        multiplier: comboMultiplier(stacks, clickStats.comboCap),
        fill: comboFill(this.state.combo, now, clickStats.comboCap),
      },
      upgrades,
      buffs,
      symbionts,
      veinReach: this.state.veinReach,
      prestige,
      seedFragments: this.state.seedFragments,
      buriedNuts: this.state.buriedNuts,
      // Copied, not shared: the engine pushes onto this array in place.
      totems: [...this.state.totems],
      species,
      clicks: this.state.clicks,
      prunes: this.state.prunes,
      treeRevision: this.state.tree.revision,
      treeSize: this.state.tree.size,
      tick: this.state.tick,
      elapsedSeconds: this.state.elapsedSeconds,
    };
  }
}
