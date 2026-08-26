import { DAY_LENGTH_SECONDS } from './daylight';
import type { EffectSpec } from './effects';
import type { TreeNodeType } from './growth';
import type { ResourceId } from './resources';
import type { StratumId } from './soil';
import { STARTER_SPECIES_ID } from './species';

/**
 * The five symbionts.
 *
 * Everything else in the game is bought. A symbiont is *attracted*: it turns up
 * on its own once the tree has become the kind of tree it wants to live in, and
 * the only way to bring one is to build toward what it needs. That is the whole
 * design — the conditions below are readable statements about the tree's shape
 * ("three blossoms", "a root tip in the clay", "an oak branch"), so a player
 * reading the panel is reading a list of things to go and build.
 *
 * Once one has arrived it has a single upgrade track, levels 1–5, paid in mixed
 * resources so no symbiont can be levelled entirely out of the half of the
 * economy it belongs to. Level 1 is free: it is what arriving *means*.
 *
 * Layer note: content stays free of engine imports. Click stat tags are mirrored
 * by value (`'click.power'`), exactly as `src/content/totems.ts` does.
 */

/** Highest level any symbiont's upgrade track reaches. */
export const SYMBIONT_MAX_LEVEL = 5;

/**
 * Seed Fragments that add up to one Seed at prestige.
 *
 * Fragments are the songbird's whole point: a slow trickle of prestige currency
 * that accrues while the player is doing something else, and the only source of
 * Seeds that is not the prestige formula itself.
 */
export const SEED_FRAGMENTS_PER_SEED = 100;

/**
 * What has to be true of the tree before a creature will settle in it.
 *
 * Each variant is a plain measurement the engine can take of the graph, so the
 * panel can show live progress toward one without the condition having to
 * describe itself twice.
 */
export type SymbiontCondition =
  /** Parts of a type currently on the tree. */
  | { readonly kind: 'partsOfType'; readonly type: TreeNodeType; readonly count: number }
  /** Lifetime total of a resource, ever earned this run. */
  | { readonly kind: 'lifetime'; readonly resource: ResourceId; readonly amount: number }
  /** Parts of a type whose working tip sits in a named soil layer. */
  | {
      readonly kind: 'partsInStratum';
      readonly type: TreeNodeType;
      readonly stratum: StratumId;
      readonly count: number;
    }
  /** Canopy height above the ground line, in canonical units. */
  | { readonly kind: 'height'; readonly height: number }
  /** Parts of a type grown as a particular species. */
  | {
      readonly kind: 'speciesParts';
      readonly speciesId: string;
      readonly type: TreeNodeType;
      readonly count: number;
    };

/** One line of an upgrade price. */
export interface SymbiontCostLine {
  readonly resource: ResourceId;
  readonly amount: number;
}

/**
 * A payout a symbiont makes on a clock rather than through a modifier.
 *
 * Two of the five do something the economy has no vocabulary for — a fragment of
 * a Seed, a nut in the ground — so they are declared here and settled by the
 * engine, rather than bent into modifiers that would have to lie about what they
 * are.
 */
export type SymbiontPayout =
  /** Seed Fragments, `perLevel × level` of them each time. */
  | { readonly kind: 'seedFragments'; readonly perLevel: number }
  /** Nuts buried for next session, `perLevel × level` each time. */
  | { readonly kind: 'buryNut'; readonly perLevel: number };

/** A timed payout and how often it comes due, in engine seconds. */
export interface SymbiontCadence {
  readonly intervalSeconds: number;
  readonly payout: SymbiontPayout;
}

export interface SymbiontDef {
  readonly id: string;
  readonly name: string;
  /** One glyph for the panel card and the arrival toast. */
  readonly glyph: string;
  /** One line of flavour. */
  readonly flavor: string;
  /** What the toast says the moment it turns up. */
  readonly arrival: string;
  /** What its levels are called — a Hive, a Colony, a Network. */
  readonly levelLabel: string;
  /** Accent colour, shared by the panel card and the creature on the canvas. */
  readonly color: string;
  /** What has to be true of the tree before it arrives. */
  readonly condition: SymbiontCondition;
  /** One line naming what it does, written for a player. */
  readonly effectLabel: string;
  /**
   * Modifiers it grants, scaled by its level: an `add` is multiplied by the
   * level, a `mul` is raised to it — the same convention repeatable upgrades
   * use, so a level of anything means the same thing everywhere.
   */
  readonly effects: readonly EffectSpec[];
  /**
   * Extra reach it lends mineral-vein detection, per level. `0.5` means a pocket
   * is found half again as far out at level 1.
   */
  readonly veinReachPerLevel?: number;
  /** A payout on a clock, for the things modifiers cannot express. */
  readonly cadence?: SymbiontCadence;
  /**
   * Price of each level after the first, cheapest first: entry `0` buys level 2.
   * Length is therefore {@link SYMBIONT_MAX_LEVEL} − 1.
   */
  readonly upgrades: readonly (readonly SymbiontCostLine[])[];
}

/** How often the songbird drops a Seed Fragment. */
export const SONGBIRD_INTERVAL_SECONDS = 180;

/**
 * How tall the tree must stand before a songbird will nest in it, in canonical
 * units (1 ≈ a mature tree's height).
 *
 * Reachable with a branch carrying a twig, and not before: a bird wants height
 * it can see from, so this is the one condition met by building *upward* rather
 * than by building more.
 */
export const SONGBIRD_HEIGHT = 1.25;

/**
 * The five.
 *
 * One per part of the tree they attach to, and each asks for something the
 * player would not otherwise have a reason to build: blossoms are pure Light
 * until bees want three of them, a root tip in the clay is a gamble until the
 * fungus makes finding ore easier, and the squirrel is the only thing in the
 * game that cares which species a limb is.
 *
 * Numbers here are first-pass — STEP 19 owns real balance.
 */
export const SYMBIONTS: readonly SymbiontDef[] = [
  {
    id: 'bees',
    name: 'Bees',
    glyph: '🐝',
    flavor: 'They found the flowers before you knew you had any.',
    arrival: 'A hive has taken to the blossoms. Every tap now has a better chance of striking rich.',
    levelLabel: 'Hive',
    color: '#e6b422',
    condition: { kind: 'partsOfType', type: 'blossom', count: 3 },
    effectLabel: 'Pollination: +3% critical tap chance per hive level.',
    effects: [{ type: 'add', targetKind: 'tag', target: 'click.critChance', value: 0.03 }],
    upgrades: [
      [
        { resource: 'light', amount: 40 },
        { resource: 'sap', amount: 25 },
      ],
      [
        { resource: 'light', amount: 120 },
        { resource: 'sap', amount: 60 },
      ],
      [
        { resource: 'light', amount: 300 },
        { resource: 'minerals', amount: 40 },
      ],
      [
        { resource: 'light', amount: 700 },
        { resource: 'minerals', amount: 120 },
      ],
    ],
  },
  {
    id: 'ants',
    name: 'Ants',
    glyph: '🐜',
    flavor: 'A road up the bark that was not there yesterday, and is busy at midnight.',
    arrival: 'Ants have found the deadwood and built a road up the trunk. The Sap runs harder.',
    levelLabel: 'Colony',
    color: '#8a5a3a',
    condition: { kind: 'lifetime', resource: 'deadwood', amount: 5 },
    effectLabel: 'Tending: +5% Sap per colony level.',
    effects: [
      { type: 'mul', targetKind: 'resource', target: 'sap', value: 1.05 },
      // Taps are still the only Sap income in the game, so the resource modifier
      // above would be invisible on its own — exactly the problem Lateral Surge
      // has, and solved the same way. The resource line covers every passive Sap
      // producer the later steps add.
      { type: 'mul', targetKind: 'tag', target: 'click.power', value: 1.05 },
    ],
    upgrades: [
      [
        { resource: 'sap', amount: 60 },
        { resource: 'deadwood', amount: 8 },
      ],
      [
        { resource: 'sap', amount: 200 },
        { resource: 'deadwood', amount: 20 },
      ],
      [
        { resource: 'sap', amount: 600 },
        { resource: 'deadwood', amount: 45 },
      ],
      [
        { resource: 'sap', amount: 1500 },
        { resource: 'deadwood', amount: 90 },
      ],
    ],
  },
  {
    id: 'mycorrhiza',
    name: 'Mycorrhiza',
    glyph: '🍄',
    flavor: 'Not quite a plant and not quite an animal, and older at this than either.',
    arrival: 'A fungal network has laced itself through your roots. The ground has fewer secrets now.',
    levelLabel: 'Network',
    color: '#b98cd6',
    condition: { kind: 'partsInStratum', type: 'rootTip', stratum: 'clay', count: 1 },
    effectLabel: 'Hyphae: mineral pockets are found 50% further out per network level.',
    effects: [],
    veinReachPerLevel: 0.5,
    upgrades: [
      [
        { resource: 'water', amount: 30 },
        { resource: 'minerals', amount: 10 },
      ],
      [
        { resource: 'water', amount: 90 },
        { resource: 'minerals', amount: 30 },
      ],
      [
        { resource: 'water', amount: 240 },
        { resource: 'minerals', amount: 80 },
      ],
      [
        { resource: 'water', amount: 600 },
        { resource: 'minerals', amount: 200 },
      ],
    ],
  },
  {
    id: 'songbird',
    name: 'Songbird',
    glyph: '🐦',
    flavor: 'Sings at the top of the tree as though it owns it, which by now it half does.',
    arrival: 'A songbird has taken the high perch. Listen for what it drops.',
    levelLabel: 'Song',
    color: '#6fb7e0',
    condition: { kind: 'height', height: SONGBIRD_HEIGHT },
    effectLabel: `Nesting: a Seed Fragment every ${SONGBIRD_INTERVAL_SECONDS / 60} minutes per song level. ${SEED_FRAGMENTS_PER_SEED} fragments make a Seed at prestige.`,
    effects: [],
    cadence: {
      intervalSeconds: SONGBIRD_INTERVAL_SECONDS,
      payout: { kind: 'seedFragments', perLevel: 1 },
    },
    upgrades: [
      [
        { resource: 'sap', amount: 150 },
        { resource: 'light', amount: 40 },
      ],
      [
        { resource: 'sap', amount: 400 },
        { resource: 'light', amount: 120 },
      ],
      [
        { resource: 'sap', amount: 1000 },
        { resource: 'light', amount: 300 },
      ],
      [
        { resource: 'sap', amount: 2500 },
        { resource: 'light', amount: 800 },
      ],
    ],
  },
  {
    id: 'squirrel',
    name: 'Squirrel',
    glyph: '🐿️',
    flavor: 'Buries far more than it ever digs up. Most oaks are planted by forgetfulness.',
    arrival: 'A squirrel has moved into the oak. It is already burying things and already forgetting where.',
    levelLabel: 'Cache',
    color: '#c07a3a',
    condition: { kind: 'speciesParts', speciesId: STARTER_SPECIES_ID, type: 'branch', count: 1 },
    effectLabel:
      'Caching: buries a nut each day per cache level. Every buried nut sprouts into a free root segment next session.',
    effects: [],
    cadence: {
      intervalSeconds: DAY_LENGTH_SECONDS,
      payout: { kind: 'buryNut', perLevel: 1 },
    },
    upgrades: [
      [
        { resource: 'sap', amount: 80 },
        { resource: 'water', amount: 25 },
      ],
      [
        { resource: 'sap', amount: 250 },
        { resource: 'water', amount: 80 },
      ],
      [
        { resource: 'sap', amount: 700 },
        { resource: 'water', amount: 200 },
      ],
      [
        { resource: 'sap', amount: 1800 },
        { resource: 'water', amount: 500 },
      ],
    ],
  },
] as const;

/** Lookup map from id → definition. */
export const SYMBIONT_BY_ID: Readonly<Record<string, SymbiontDef>> = Object.fromEntries(
  SYMBIONTS.map((s) => [s.id, s]),
);

/** All symbiont ids in catalogue order. */
export const SYMBIONT_IDS: readonly string[] = SYMBIONTS.map((s) => s.id);
