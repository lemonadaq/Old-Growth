import Decimal from 'break_infinity.js';
import { SEASON_LENGTH_SECONDS } from '../content/balance';
import { GROWTH_RULE_BY_TYPE, type TreeNodeType } from '../content/growth';
import { RESOURCE_IDS, type ResourceId } from '../content/resources';
import { FEATURE_BY_ID, type FeatureId } from '../content/progression';
import { ENGINE_VERSION, SAVE_VERSION } from '../content/save';
import { DEFAULT_SETTINGS, normaliseSettings, type GameSettings } from '../content/settings';
import { SPECIES, STARTER_SPECIES_ID } from '../content/species';
import { SYMBIONT_BY_ID } from '../content/symbionts';
import { TOTEM_BY_ID } from '../content/totems';
import { WEATHER_BY_ID, type WeatherId } from '../content/weather';
import type { ActiveBuff } from './buffs';
import type { Ceremony, ForestTree, TreeMemory } from './prestige';
import { createSoilMap } from './soil';
import type { ActiveSymbiont } from './symbionts';
import { TreeGraph, type TreeGraphData, type TreeNode } from './treeGraph';
import { createInitialState, type GameState } from './types';
import type { ActiveWeather, PendingWeather } from './weather';

/**
 * The save: what is written down, and how it comes back.
 *
 * ## What is stored, and what is not
 *
 * Only what cannot be derived. The tree graph, the balances, the ledgers and the
 * clocks are stored; the producers, the modifiers, the hydration reading, the
 * per-leaf light, the vein reach and the season are **not** — every one of them
 * is rebuilt by `Simulation.hydrate()` on the way in, which is the same
 * from-scratch path a prestige takes. Storing a derived value would give the
 * game two sources of truth that a content edit could silently pull apart: a
 * balance change to a species trait would leave every existing save quoting the
 * old number until something happened to move it.
 *
 * ## Everything is a plain value
 *
 * `Decimal`s go out as strings (`break_infinity` reads its own `toString`, at any
 * magnitude), classes go out as the records they hold, and nothing here is
 * `Infinity`, `NaN` or `undefined` — `JSON.stringify` turns all three into
 * something that does not read back as itself. The one place that bit is the
 * symbionts' `nextPayoutAt`, which is `Infinity` for the three creatures with no
 * cadence; it is written as `null` and re-derived from the catalogue on load.
 *
 * ## Loading is tolerant, parsing is strict
 *
 * {@link parseSaveText} refuses anything that is not an envelope with a tree in
 * it. Past that gate, {@link restoreState} never throws: an upgrade id that no
 * longer exists is skipped, a species that was renamed falls back to the
 * starter, a number that arrived as a string becomes its default. A save is a
 * player's whole history with the game, and losing it to a content edit is the
 * worst thing this file could do.
 */

/* --------------------------------------------------------------- the shape */

/** One resource's balance and lifetime, as text. */
export interface SavedResource {
  /** Current spendable amount. */
  readonly amount: string;
  /** Lifetime gross earned. */
  readonly total: string;
}

/** A running buff and when it lapses, in engine seconds. */
export interface SavedBuff {
  readonly id: string;
  readonly grantedAt: number;
  readonly expiresAt: number;
}

/** A resident creature. `nextPayoutAt` is `null` for the three with no cadence. */
export interface SavedSymbiont {
  readonly id: string;
  readonly level: number;
  readonly arrivedAt: number;
  readonly nextPayoutAt: number | null;
}

/** The sky, mid-flight. */
export interface SavedWeather {
  readonly active: ActiveWeather | null;
  readonly pending: PendingWeather | null;
  /** Engine seconds the next roll is due at. */
  readonly nextRollAt: number;
}

/** One heap of leaves waiting at the base. */
export interface SavedLitterPile {
  readonly id: string;
  readonly x: number;
  readonly amount: string;
  readonly spawnedAt: number;
}

/** Everything one save carries. */
export interface SaveData {
  /** The build that wrote it — see {@link ENGINE_VERSION}. */
  readonly engine: string;
  /**
   * Wall-clock ms the player was last present.
   *
   * Offline progress counts from here, so this is the field to edit by hand when
   * testing an absence: export a save, move `lastSeen` back, re-import.
   */
  readonly lastSeen: number;
  /** Wall-clock seconds actually spent playing — absences excluded. */
  readonly playtimeSeconds: number;
  /** Engine seconds simulated, which drives the day, the year and every clock. */
  readonly elapsedSeconds: number;
  /** Fixed ticks executed. */
  readonly tick: number;
  /** The seed the underground is generated from; the veins come back with it. */
  readonly soilSeed: number;
  readonly tree: TreeGraphData;
  readonly resources: Readonly<Record<string, SavedResource>>;
  readonly upgrades: Readonly<Record<string, number>>;
  readonly heirlooms: Readonly<Record<string, number>>;
  /** Heirloom levels this run has already been handed its run-start grants for. */
  readonly runStartLevels: Readonly<Record<string, number>>;
  readonly buffs: readonly SavedBuff[];
  readonly symbionts: readonly SavedSymbiont[];
  readonly totems: readonly string[];
  /** Hybrid ids ever made. */
  readonly discoveries: readonly string[];
  /**
   * Feature gates already passed.
   *
   * Stored rather than re-measured because it is a latch: a player who unlocked
   * pruning at eight parts and then cut back to six must not open their save to
   * find the scissors gone. A file written before this field existed simply
   * re-measures on load, which is right — every gate they had passed is still
   * passed, and `Simulation.hydrate` latches them silently.
   */
  readonly features: readonly string[];
  /** The Old Growth forest, oldest first. */
  readonly forest: readonly ForestTree[];
  /** The tree the last run ended with, for the Memory heirlooms. */
  readonly memory: TreeMemory | null;
  /** A Go to Seed ceremony caught mid-flight, or `null`. */
  readonly ceremony: Ceremony | null;
  readonly bondSymbiont: string | null;
  readonly plantingSpecies: string;
  readonly weather: SavedWeather;
  readonly litter: readonly SavedLitterPile[];
  /** How long one season runs — Tempo's Quickening shortens it. */
  readonly seasonLengthSeconds: number;
  /** Winters survived. */
  readonly rings: number;
  /** Lifetime counters the Stats panel (STEP 19) will read. */
  readonly clicks: number;
  readonly prunes: number;
  readonly grafts: number;
  readonly seedFragments: number;
  readonly buriedNuts: number;
  readonly nextLitterAt: number;
  readonly nextExposureAt: number;
  readonly lastDewDay: number;
  readonly settings: GameSettings;
}

/**
 * What actually goes into localStorage or onto the clipboard.
 *
 * The version and the timestamp sit *outside* the data on purpose: reading them
 * is how you find out whether the data can be read at all, and a migration that
 * had to parse the whole file to learn its own version would be a migration that
 * cannot refuse anything.
 */
export interface SaveEnvelope {
  readonly version: string;
  /** Wall-clock ms the file was written at. */
  readonly timestamp: number;
  readonly data: SaveData;
}

/** A parse that either produced an envelope or has a reason it did not. */
export type ParseResult =
  | { readonly ok: true; readonly envelope: SaveEnvelope }
  | { readonly ok: false; readonly reason: string };

/* ------------------------------------------------------------------ capture */

/** Write a `Decimal` down without losing its magnitude. */
function encodeDecimal(value: Decimal): string {
  return value.toString();
}

/**
 * Read one back. Anything unreadable becomes zero rather than `NaN`, which would
 * otherwise spread through every sum the resource takes part in.
 */
function decodeDecimal(value: unknown): Decimal {
  if (typeof value !== 'string' && typeof value !== 'number') return new Decimal(0);
  const decimal = new Decimal(value);
  return Number.isFinite(decimal.mantissa) && Number.isFinite(decimal.exponent)
    ? decimal
    : new Decimal(0);
}

/** Take a complete record of the state as it stands. */
export function captureSave(state: GameState, now: number = Date.now()): SaveEnvelope {
  const resources: Record<string, SavedResource> = {};
  for (const id of RESOURCE_IDS) {
    resources[id] = {
      amount: encodeDecimal(state.resources.amount(id)),
      total: encodeDecimal(state.resources.total(id)),
    };
  }

  const data: SaveData = {
    engine: ENGINE_VERSION,
    // Not `state.lastUpdatedAt`: that is stamped by the last tick, and a tab
    // that was throttled before it was closed would under-report the absence.
    // The moment the file is written is the last moment the player was here.
    lastSeen: now,
    playtimeSeconds: state.playtimeSeconds,
    elapsedSeconds: state.elapsedSeconds,
    tick: state.tick,
    soilSeed: state.soil.seed,
    tree: state.tree.toJSON(),
    resources,
    upgrades: Object.fromEntries(state.upgrades.entries()),
    heirlooms: Object.fromEntries(state.heirlooms.entries()),
    runStartLevels: { ...state.runStartLevels },
    buffs: state.buffs.entries().map((buff) => ({
      id: buff.id,
      grantedAt: buff.grantedAt,
      expiresAt: buff.expiresAt,
    })),
    symbionts: state.symbionts.entries().map((resident) => ({
      id: resident.id,
      level: resident.level,
      arrivedAt: resident.arrivedAt,
      // `Infinity` does not survive JSON; the catalogue puts it back.
      nextPayoutAt: Number.isFinite(resident.nextPayoutAt) ? resident.nextPayoutAt : null,
    })),
    totems: [...state.totems],
    discoveries: [...state.discoveries],
    features: [...state.features],
    forest: state.forest.map((tree) => ({ ...tree })),
    memory: state.memory
      ? { rootId: state.memory.rootId, parts: state.memory.parts.map((part) => ({ ...part })) }
      : null,
    ceremony: state.ceremony ? { ...state.ceremony, yield: { ...state.ceremony.yield } } : null,
    bondSymbiont: state.bondSymbiont,
    plantingSpecies: state.plantingSpecies,
    weather: {
      active: state.weather.active,
      pending: state.weather.pending,
      nextRollAt: state.weather.nextRollAt,
    },
    litter: state.litter.entries().map((pile) => ({
      id: pile.id,
      x: pile.x,
      amount: encodeDecimal(pile.amount),
      spawnedAt: pile.spawnedAt,
    })),
    seasonLengthSeconds: state.seasonLengthSeconds,
    rings: state.rings,
    clicks: state.clicks,
    prunes: state.prunes,
    grafts: state.grafts,
    seedFragments: state.seedFragments,
    buriedNuts: state.buriedNuts,
    nextLitterAt: state.nextLitterAt,
    nextExposureAt: state.nextExposureAt,
    lastDewDay: state.lastDewDay,
    settings: state.settings,
  };

  return { version: SAVE_VERSION, timestamp: now, data };
}

/* ------------------------------------------------------------ reading parts */

type Unknown = Record<string, unknown>;

/** A finite number, or the fallback. Guards `NaN`, `Infinity` and `null` alike. */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole number at or above `min`. */
function count(value: unknown, fallback = 0, min = 0): number {
  return Math.max(min, Math.floor(num(value, fallback)));
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function isObject(value: unknown): value is Unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `{ id: level }` with every entry read as a whole count, unknown ids kept. */
function levelMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(value)) return out;
  for (const [id, level] of Object.entries(value)) {
    const owned = count(level);
    if (owned > 0) out[id] = owned;
  }
  return out;
}

/* ------------------------------------------------------------------ restore */

/**
 * Rebuild the graph, dropping anything that would not hold together.
 *
 * A node whose parent is missing is not merely cosmetic — placements are derived
 * by walking down from the trunk, so an orphan is invisible, uncuttable and
 * still producing. Returns `null` when even the trunk cannot be found, which is
 * the one structural failure a save cannot be loaded through.
 */
function restoreTree(value: unknown): TreeGraph | null {
  if (!isObject(value)) return null;

  const rootId = str(value.rootId, '');
  if (!rootId) return null;

  const nodes = new Map<string, TreeNode>();
  for (const entry of array(value.nodes)) {
    if (!isObject(entry)) continue;
    const id = str(entry.id, '');
    const type = str(entry.type, '') as TreeNodeType;
    if (!id || !GROWTH_RULE_BY_TYPE[type]) continue;

    const rule = GROWTH_RULE_BY_TYPE[type];
    nodes.set(id, {
      id,
      type,
      parentId: typeof entry.parentId === 'string' ? entry.parentId : null,
      childIds: array(entry.childIds).filter((child): child is string => typeof child === 'string'),
      speciesId: str(entry.speciesId, STARTER_SPECIES_ID),
      level: count(entry.level),
      slot: count(entry.slot),
      angle: num(entry.angle, 0),
      attachT: num(entry.attachT, 1),
      length: num(entry.length, rule.baseLength),
      thickness: num(entry.thickness, rule.baseThickness),
      createdAtTick: count(entry.createdAtTick),
    });
  }

  const root = nodes.get(rootId);
  if (!root || root.parentId !== null) return null;

  // Walk down from the trunk: whatever is not reached is not part of this tree.
  const kept = new Map<string, TreeNode>();
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const node = nodes.get(id);
    if (!node || kept.has(id)) continue;

    const childIds = node.childIds.filter((child) => {
      const kid = nodes.get(child);
      return kid !== undefined && kid.parentId === id && child !== id;
    });
    kept.set(id, { ...node, childIds });
    queue.push(...childIds);
  }

  return TreeGraph.fromJSON({
    version: 1,
    seed: num(value.seed, 0),
    rootId,
    // At least one past the highest id in play, so a new part can never be
    // grown onto the id of one that is already standing.
    nextId: Math.max(count(value.nextId, 1, 1), kept.size + 1),
    nodes: [...kept.values()],
  });
}

/** Read the sky back, dropping an event whose id the game no longer has. */
function restoreWeather(value: unknown): SavedWeather {
  const raw = isObject(value) ? value : {};

  const active = isObject(raw.active) ? raw.active : null;
  const pending = isObject(raw.pending) ? raw.pending : null;
  const knownActive = active && WEATHER_BY_ID[str(active.id, '') as WeatherId] ? active : null;
  const knownPending = pending && WEATHER_BY_ID[str(pending.id, '') as WeatherId] ? pending : null;

  return {
    active: knownActive
      ? {
          id: str(knownActive.id, '') as WeatherId,
          startedAt: num(knownActive.startedAt, 0),
          endsAt: num(knownActive.endsAt, 0),
        }
      : null,
    pending: knownPending
      ? {
          id: str(knownPending.id, '') as WeatherId,
          startsAt: num(knownPending.startsAt, 0),
        }
      : null,
    nextRollAt: num(raw.nextRollAt, 0),
  };
}

/** Read the remembered tree back, keeping only parts whose type still exists. */
function restoreMemory(value: unknown): TreeMemory | null {
  if (!isObject(value)) return null;
  const rootId = str(value.rootId, '');
  if (!rootId) return null;

  const parts = array(value.parts)
    .filter(isObject)
    .filter((part) => GROWTH_RULE_BY_TYPE[str(part.type, '') as TreeNodeType] !== undefined)
    .map((part) => ({
      id: str(part.id, ''),
      parentId: str(part.parentId, ''),
      type: str(part.type, '') as TreeNodeType,
      speciesId: str(part.speciesId, STARTER_SPECIES_ID),
    }))
    .filter((part) => part.id !== '' && part.parentId !== '');

  return { rootId, parts };
}

/** Read a ceremony back. One with no payout left in it is simply dropped. */
function restoreCeremony(value: unknown): Ceremony | null {
  if (!isObject(value)) return null;
  const seeds = isObject(value.yield) ? value.yield : {};

  return {
    startedAt: num(value.startedAt, 0),
    endsAt: num(value.endsAt, 0),
    yield: {
      fromLight: count(seeds.fromLight),
      fromFragments: count(seeds.fromFragments),
      total: count(seeds.total),
      fragmentsRemaining: count(seeds.fragmentsRemaining),
    },
  };
}

/** Read one silhouette on the hills back. */
function restoreForest(value: unknown): ForestTree[] {
  return array(value)
    .filter(isObject)
    .map((tree, index) => ({
      id: str(tree.id, `grove-${index}`),
      speciesId: str(tree.speciesId, STARTER_SPECIES_ID),
      height: num(tree.height, 0),
      spread: num(tree.spread, 0),
      parts: count(tree.parts),
      rings: count(tree.rings),
      seeds: count(tree.seeds),
      slot: count(tree.slot, index),
    }));
}

/**
 * Rebuild a live {@link GameState} from a save.
 *
 * Everything derived is left alone: the caller hands the result to
 * `new Simulation(state)`, whose constructor sprouts any buried nuts and then
 * runs the same from-scratch republish a prestige does. Nothing in here
 * registers a producer or grants a modifier, and nothing in here should.
 *
 * Returns `null` only when the tree cannot be rebuilt — see {@link restoreTree}.
 */
export function restoreState(data: SaveData): GameState | null {
  const raw = data as unknown as Unknown;

  const tree = restoreTree(raw.tree);
  if (!tree) return null;

  const lastSeen = num(raw.lastSeen, Date.now());
  const state = createInitialState(lastSeen);

  state.tree = tree;
  state.soil = createSoilMap(num(raw.soilSeed, state.soil.seed));
  state.elapsedSeconds = Math.max(0, num(raw.elapsedSeconds, 0));
  state.tick = count(raw.tick);
  state.playtimeSeconds = Math.max(0, num(raw.playtimeSeconds, 0));

  const resources = isObject(raw.resources) ? raw.resources : {};
  for (const id of RESOURCE_IDS) {
    const entry = isObject(resources[id]) ? (resources[id] as Unknown) : {};
    const amount = decodeDecimal(entry.amount);
    // A lifetime total below the balance in hand would let a species unlock or a
    // maturity gate go *backwards* across a reload; the balance is the floor.
    const total = decodeDecimal(entry.total);
    state.resources.restore(id as ResourceId, amount, total.gt(amount) ? total : amount);
  }

  for (const [id, level] of Object.entries(levelMap(raw.upgrades))) {
    state.upgrades.setLevel(id, level);
  }
  for (const [id, level] of Object.entries(levelMap(raw.heirlooms))) {
    state.heirlooms.setLevel(id, level);
  }
  state.runStartLevels = levelMap(raw.runStartLevels);

  const buffs: ActiveBuff[] = array(raw.buffs)
    .filter(isObject)
    .map((buff) => ({
      id: str(buff.id, ''),
      grantedAt: num(buff.grantedAt, 0),
      expiresAt: num(buff.expiresAt, 0),
    }))
    // A buff whose time ran out while the tab was shut is simply gone: it would
    // expire on the first tick anyway, and republishing it first would flash its
    // modifiers across one frame of the HUD.
    .filter((buff) => buff.id !== '' && buff.expiresAt > state.elapsedSeconds);
  state.buffs.restore(buffs);

  const residents: ActiveSymbiont[] = [];
  for (const entry of array(raw.symbionts)) {
    if (!isObject(entry)) continue;
    const def = SYMBIONT_BY_ID[str(entry.id, '')];
    if (!def) continue;

    const arrivedAt = num(entry.arrivedAt, state.elapsedSeconds);
    // The cadence comes from the catalogue rather than the file, so a balance
    // change to an interval reaches every existing save.
    const intervalSeconds = def.cadence?.intervalSeconds ?? Infinity;
    residents.push({
      id: def.id,
      level: count(entry.level, 1, 1),
      arrivedAt,
      nextPayoutAt: num(entry.nextPayoutAt, arrivedAt + intervalSeconds),
      intervalSeconds,
    });
  }
  state.symbionts.restore(residents);

  state.totems = array(raw.totems)
    .filter((id): id is string => typeof id === 'string')
    .filter((id) => TOTEM_BY_ID[id] !== undefined);

  state.discoveries = new Set(
    array(raw.discoveries).filter((id): id is string => typeof id === 'string'),
  );

  // An id the game no longer has is dropped rather than kept: unlike a hint,
  // which is a note to the player, a feature id is a key to a control, and a key
  // to a door that was removed is only a way for a `has()` to lie.
  state.features = new Set(
    array(raw.features)
      .filter((id): id is string => typeof id === 'string')
      .filter((id): id is FeatureId => FEATURE_BY_ID[id as FeatureId] !== undefined),
  );

  state.forest = restoreForest(raw.forest);
  state.memory = restoreMemory(raw.memory);
  state.ceremony = restoreCeremony(raw.ceremony);

  const bond = str(raw.bondSymbiont, '');
  state.bondSymbiont = SYMBIONT_BY_ID[bond] ? bond : null;

  const planting = str(raw.plantingSpecies, STARTER_SPECIES_ID);
  state.plantingSpecies = SPECIES.some((def) => def.id === planting)
    ? planting
    : STARTER_SPECIES_ID;

  const weather = restoreWeather(raw.weather);
  state.weather.restore(weather.active, weather.pending, weather.nextRollAt);

  state.litter.restore(
    array(raw.litter)
      .filter(isObject)
      .map((pile) => ({
        id: str(pile.id, ''),
        x: num(pile.x, 0),
        amount: decodeDecimal(pile.amount),
        spawnedAt: num(pile.spawnedAt, state.elapsedSeconds),
      }))
      .filter((pile) => pile.id !== ''),
  );

  state.seasonLengthSeconds = Math.max(1, num(raw.seasonLengthSeconds, SEASON_LENGTH_SECONDS));
  state.rings = count(raw.rings);
  state.clicks = count(raw.clicks);
  state.prunes = count(raw.prunes);
  state.grafts = count(raw.grafts);
  state.seedFragments = count(raw.seedFragments);
  state.buriedNuts = count(raw.buriedNuts);
  state.nextLitterAt = num(raw.nextLitterAt, state.elapsedSeconds);
  state.nextExposureAt = num(raw.nextExposureAt, state.elapsedSeconds);
  // `-1` means "no day has had its Dew yet", so it is the honest default.
  state.lastDewDay = Math.floor(num(raw.lastDewDay, -1));
  state.settings = normaliseSettings(raw.settings);

  return state;
}

/* -------------------------------------------------------------- validation */

/**
 * Turn text into an envelope, or say why it is not one.
 *
 * This is the strict half. Everything past it is read defensively, but a file
 * that is not JSON, or is JSON without a version, a timestamp and a tree, is not
 * a save — and importing it would blank a player's game with a shrug.
 */
export function parseSaveText(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That does not look like a save file.' };
  }
  return validateEnvelope(parsed);
}

/** The structural gate {@link parseSaveText} applies, on already-parsed JSON. */
export function validateEnvelope(value: unknown): ParseResult {
  if (!isObject(value)) {
    return { ok: false, reason: 'That does not look like a save file.' };
  }
  if (typeof value.version !== 'string' || value.version === '') {
    return { ok: false, reason: 'The save has no version on it.' };
  }
  if (!isObject(value.data)) {
    return { ok: false, reason: 'The save has no game in it.' };
  }
  if (!isObject(value.data.tree) || !Array.isArray(value.data.tree.nodes)) {
    return { ok: false, reason: 'The save has no tree in it.' };
  }

  return {
    ok: true,
    envelope: {
      version: value.version,
      timestamp: num(value.timestamp, 0),
      data: value.data as unknown as SaveData,
    },
  };
}

/** What a brand-new save looks like, for tests and for the export of a fresh run. */
export const EMPTY_SETTINGS: GameSettings = DEFAULT_SETTINGS;
