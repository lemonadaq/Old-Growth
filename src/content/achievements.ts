import { ACHIEVEMENT_BONUS, ACHIEVEMENT_GOAL } from './balance';
import type { TreeNodeType } from './growth';
import type { ResourceId } from './resources';

/**
 * Thirty things worth remembering you did.
 *
 * An achievement here is **data and nothing else**: a measurement, a threshold,
 * a name, and — for ten of them — a small permanent bonus. There is no engine
 * code per achievement, the same way there is none per species or per gate; the
 * evaluator in `src/engine/achievements.ts` walks this table once a tick and
 * that is the whole system.
 *
 * ## What they are for
 *
 * Two jobs, and the split is deliberate.
 *
 * Twenty of them are a **record**. They fire once, they say something specific
 * about the tree you grew, and they are worth nothing at all. That is the point:
 * a list where every line pays would be a checklist, and a checklist is a thing
 * you clear rather than a thing you notice.
 *
 * Ten of them carry `+1%` on everything the tree makes ({@link ACHIEVEMENT_BONUS}).
 * They are the ten that mark *breadth* rather than depth — every species, every
 * hybrid, a creature in residence, a winter stood through — because the reward
 * for playing widely should be that playing widely is slightly better, and the
 * reward for playing deeply is already the numbers going up. Ten of them
 * together is about what one Ring is worth, earned across a whole first run.
 *
 * Bonuses are granted as one revocable modifier per achievement, so a save that
 * loads with twelve earned publishes twelve and never thirteen.
 *
 * ## Categories
 *
 * The Journal groups by these, in this order. A category is a *kind of playing*
 * rather than a difficulty tier — the list should read as "here is the game",
 * not as a ladder.
 */
export type AchievementCategory = 'taps' | 'growth' | 'craft' | 'nature' | 'legacy';

/** Display order and heading for each category. */
export const ACHIEVEMENT_CATEGORIES: readonly {
  readonly id: AchievementCategory;
  readonly label: string;
}[] = [
  { id: 'taps', label: 'The tapping hand' },
  { id: 'growth', label: 'The growing tree' },
  { id: 'craft', label: 'Cut and joined' },
  { id: 'nature', label: 'What came to live here' },
  { id: 'legacy', label: 'What outlasts a tree' },
];

/**
 * What an achievement watches.
 *
 * Every variant is a **counter compared against a number**, on purpose. A
 * condition that needed to observe an *event* ("crit twice in a row") would need
 * the engine to remember something for it, and the moment one achievement needs
 * bespoke state the table stops being data. Everything here is answerable from
 * the state as it stands, which is also what makes a save loaded from an older
 * version award correctly on the first tick rather than never.
 */
export type AchievementCondition =
  /** Lifetime gross of a resource, ever earned this run. */
  | { readonly kind: 'lifetime'; readonly resource: ResourceId; readonly amount: number }
  /** Lifetime gross of a resource, across every run — only Seeds survive a reset. */
  | { readonly kind: 'lifetimeAcrossRuns'; readonly resource: ResourceId; readonly amount: number }
  /** Successful taps on the tree, lifetime. */
  | { readonly kind: 'clicks'; readonly count: number }
  /** Limbs cut, lifetime. */
  | { readonly kind: 'prunes'; readonly count: number }
  /** Grafts made, lifetime. */
  | { readonly kind: 'grafts'; readonly count: number }
  /** Parts standing on the tree right now, trunk excluded. */
  | { readonly kind: 'parts'; readonly count: number }
  /** Parts of one type standing right now. */
  | { readonly kind: 'partsOfType'; readonly type: TreeNodeType; readonly count: number }
  /** Distinct hybrids ever made. */
  | { readonly kind: 'discoveries'; readonly count: number }
  /** Base species the player may plant. */
  | { readonly kind: 'speciesAvailable'; readonly count: number }
  /** Creatures currently in residence. */
  | { readonly kind: 'symbionts'; readonly count: number }
  /** Totems carved and planted. */
  | { readonly kind: 'totems'; readonly count: number }
  /** Rings in the trunk — winters stood through. */
  | { readonly kind: 'rings'; readonly count: number }
  /** Trees standing in the Old Growth forest. */
  | { readonly kind: 'forest'; readonly count: number }
  /** Heirloom levels bought in the Seed Vault. */
  | { readonly kind: 'heirloomLevels'; readonly count: number }
  /** Wall-clock seconds actually spent playing — absences excluded. */
  | { readonly kind: 'playtime'; readonly seconds: number }
  /** Storms brought to a full brace. */
  | { readonly kind: 'stormsBraced'; readonly count: number }
  /** Hours the offline calculator has paid out for, cumulatively. */
  | { readonly kind: 'offlineHours'; readonly hours: number };

export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  /** One line, written for a player, saying what they did. */
  readonly description: string;
  readonly category: AchievementCategory;
  /** One glyph for the Journal card and the toast. */
  readonly glyph: string;
  readonly condition: AchievementCondition;
  /**
   * `+1%` on everything the tree makes, when set. Ten of the thirty carry one;
   * see the note at the top of this file for which ten and why.
   */
  readonly bonus?: number;
}

const G = ACHIEVEMENT_GOAL;

/**
 * The thirty.
 *
 * Ordered by category and, inside a category, by roughly when a run reaches
 * them — which is the order the Journal reads in and the order they will
 * generally arrive.
 */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  /* ------------------------------------------------------------------ taps */
  {
    id: 'firstHundred',
    name: 'Knuckles',
    description: `Tap the tree ${G.clicksFirst} times.`,
    category: 'taps',
    glyph: '✋',
    condition: { kind: 'clicks', count: G.clicksFirst },
  },
  {
    id: 'tenThousandTaps',
    name: 'The long rhythm',
    description: `Tap the tree ${G.clicksLots.toLocaleString('en')} times.`,
    category: 'taps',
    glyph: '🥁',
    condition: { kind: 'clicks', count: G.clicksLots },
    bonus: ACHIEVEMENT_BONUS,
  },
  {
    id: 'sapEarly',
    name: 'First sap',
    description: `Draw ${G.sapEarly.toLocaleString('en')} Sap from the tree.`,
    category: 'taps',
    glyph: '💧',
    condition: { kind: 'lifetime', resource: 'sap', amount: G.sapEarly },
  },
  {
    id: 'sapLate',
    name: 'The tap never closes',
    description: `Draw ${G.sapLate.toLocaleString('en')} Sap in one run.`,
    category: 'taps',
    glyph: '🌊',
    condition: { kind: 'lifetime', resource: 'sap', amount: G.sapLate },
    bonus: ACHIEVEMENT_BONUS,
  },
  {
    id: 'anHour',
    name: 'An afternoon',
    description: 'Spend an hour with the tree.',
    category: 'taps',
    glyph: '🕰️',
    condition: { kind: 'playtime', seconds: G.playtimeHour },
  },

  /* ---------------------------------------------------------------- growth */
  {
    id: 'tenParts',
    name: 'A shape of its own',
    description: `Have ${G.partsFew} parts on the tree at once.`,
    category: 'growth',
    glyph: '🌱',
    condition: { kind: 'parts', count: G.partsFew },
  },
  {
    id: 'hundredFiftyParts',
    name: 'Old wood',
    description: `Have ${G.partsLots} parts on the tree at once.`,
    category: 'growth',
    glyph: '🪵',
    condition: { kind: 'parts', count: G.partsLots },
    bonus: ACHIEVEMENT_BONUS,
  },
  {
    id: 'canopy',
    name: 'Shade underneath',
    description: `Carry ${G.leavesMany} leaf clusters at once.`,
    category: 'growth',
    glyph: '🍃',
    condition: { kind: 'partsOfType', type: 'leafCluster', count: G.leavesMany },
  },
  {
    id: 'rootMass',
    name: 'Down in the dark',
    description: `Carry ${G.rootsMany} root segments at once.`,
    category: 'growth',
    glyph: '🪱',
    condition: { kind: 'partsOfType', type: 'rootSegment', count: G.rootsMany },
  },
  {
    id: 'blossoming',
    name: 'In flower',
    description: `Carry ${G.blossomsFew} blossoms at once.`,
    category: 'growth',
    glyph: '🌸',
    condition: { kind: 'partsOfType', type: 'blossom', count: G.blossomsFew },
  },
  {
    id: 'lightEarly',
    name: 'Photosynthesis',
    description: `Gather ${G.lightEarly.toLocaleString('en')} Light in one run.`,
    category: 'growth',
    glyph: '☀️',
    condition: { kind: 'lifetime', resource: 'light', amount: G.lightEarly },
  },
  {
    id: 'lightMid',
    name: 'Reaching',
    description: `Gather ${G.lightMid.toLocaleString('en')} Light in one run.`,
    category: 'growth',
    glyph: '🌞',
    condition: { kind: 'lifetime', resource: 'light', amount: G.lightMid },
    bonus: ACHIEVEMENT_BONUS,
  },
  {
    id: 'mineralsEarly',
    name: 'Struck ore',
    description: `Worry ${G.mineralsEarly} Minerals out of the soil.`,
    category: 'growth',
    glyph: '⛏️',
    condition: { kind: 'lifetime', resource: 'minerals', amount: G.mineralsEarly },
  },

  /* ----------------------------------------------------------------- craft */
  {
    id: 'firstCuts',
    name: 'The scissors',
    description: `Cut ${G.prunesFew} limbs.`,
    category: 'craft',
    glyph: '✂️',
    condition: { kind: 'prunes', count: G.prunesFew },
  },
  {
    id: 'deadwood',
    name: 'Good timber',
    description: `Gather ${G.deadwoodEarly} Deadwood.`,
    category: 'craft',
    glyph: '🪓',
    condition: { kind: 'lifetime', resource: 'deadwood', amount: G.deadwoodEarly },
  },
  {
    id: 'litter',
    name: 'Sweeping up',
    description: `Rake ${G.litterEarly} Leaf Litter off the ground.`,
    category: 'craft',
    glyph: '🍂',
    condition: { kind: 'lifetime', resource: 'leafLitter', amount: G.litterEarly },
  },
  {
    id: 'firstGraft',
    name: 'Two woods, one limb',
    description: 'Make your first graft.',
    category: 'craft',
    glyph: '🔗',
    condition: { kind: 'grafts', count: G.graftsFew },
  },
  {
    id: 'allHybrids',
    name: 'The whole table',
    description: `Discover all ${G.discoveriesAll} hybrids.`,
    category: 'craft',
    glyph: '💠',
    condition: { kind: 'discoveries', count: G.discoveriesAll },
    bonus: ACHIEVEMENT_BONUS,
  },
  {
    id: 'firstTotem',
    name: 'Carved',
    description: 'Carve and plant a totem.',
    category: 'craft',
    glyph: '🗿',
    condition: { kind: 'totems', count: G.totemsFew },
  },

  /* ---------------------------------------------------------------- nature */
  {
    id: 'firstSymbiont',
    name: 'Someone moved in',
    description: 'Have a creature take up residence.',
    category: 'nature',
    glyph: '🐝',
    condition: { kind: 'symbionts', count: G.symbiontsFew },
    bonus: ACHIEVEMENT_BONUS,
  },
  {
    id: 'allSymbionts',
    name: 'A whole household',
    description: `Have all ${G.symbiontsAll} creatures in residence at once.`,
    category: 'nature',
    glyph: '🦉',
    condition: { kind: 'symbionts', count: G.symbiontsAll },
    bonus: ACHIEVEMENT_BONUS,
  },
  {
    id: 'allSpecies',
    name: 'Six woods',
    description: `Unlock all ${G.speciesAll} species.`,
    category: 'nature',
    glyph: '🌲',
    condition: { kind: 'speciesAvailable', count: G.speciesAll },
    bonus: ACHIEVEMENT_BONUS,
  },
  {
    id: 'firstRing',
    name: 'One winter',
    description: 'Stand through a winter and lay a ring.',
    category: 'nature',
    glyph: '❄️',
    condition: { kind: 'rings', count: G.ringsFew },
  },
  {
    id: 'manyRings',
    name: 'Four winters',
    description: `Carry ${G.ringsMany} rings in the trunk.`,
    category: 'nature',
    glyph: '🌀',
    condition: { kind: 'rings', count: G.ringsMany },
    bonus: ACHIEVEMENT_BONUS,
  },
  {
    id: 'bracedStorm',
    name: 'Held on',
    description: 'Brace the trunk fully through a storm.',
    category: 'nature',
    glyph: '🌩️',
    condition: { kind: 'stormsBraced', count: G.bracedStorms },
  },
  {
    id: 'sleptOnIt',
    name: 'Slept on it',
    description: `Come back to ${G.offlineHours} hours of root work waiting for you.`,
    category: 'nature',
    glyph: '🌙',
    condition: { kind: 'offlineHours', hours: G.offlineHours },
  },

  /* ---------------------------------------------------------------- legacy */
  {
    id: 'firstSeed',
    name: 'Gone to seed',
    description: 'Send your first tree to the Old Growth.',
    category: 'legacy',
    glyph: '🌰',
    condition: { kind: 'forest', count: G.forestFew },
    bonus: ACHIEVEMENT_BONUS,
  },
  {
    id: 'aGrove',
    name: 'A grove',
    description: `Stand ${G.forestMany} trees on the hills.`,
    category: 'legacy',
    glyph: '🏞️',
    condition: { kind: 'forest', count: G.forestMany },
  },
  {
    id: 'seedsMany',
    name: 'A full purse',
    description: `Earn ${G.seedsMany} Seeds across all your trees.`,
    category: 'legacy',
    glyph: '💰',
    condition: { kind: 'lifetimeAcrossRuns', resource: 'seeds', amount: G.seedsMany },
  },
  {
    id: 'heirlooms',
    name: 'Inheritance',
    description: `Buy ${G.heirloomsFew} levels in the Seed Vault.`,
    category: 'legacy',
    glyph: '🗝️',
    condition: { kind: 'heirloomLevels', count: G.heirloomsFew },
  },
] as const;

/** Lookup map from id → definition. */
export const ACHIEVEMENT_BY_ID: Readonly<Record<string, AchievementDef>> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

/** All achievement ids in table order. */
export const ACHIEVEMENT_IDS: readonly string[] = ACHIEVEMENTS.map((a) => a.id);
