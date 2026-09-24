import { OFFLINE_TAG as ROOT_TAG } from './growth';
import { CANOPY_TAG } from './offline';
import { GROWTH_COST_TAG } from './prune';

/**
 * The Heartwood: the passive tree, as data.
 *
 * Read a trunk in cross-section and you get this shape — a pith at the centre
 * and everything the tree has ever done arranged in rings around it. That is
 * the whole design. Six branches radiate from the heartwood, each one an axis
 * the game already has (the canopy's Light, the bark's taps, the roots' Water
 * and Minerals, thrift, symbiosis, age), and every node is a step further out
 * along one of them. Nothing can be bought out of nowhere: a node opens only
 * when something already allocated touches it, so a build is a *route* rather
 * than a shopping list, and the long way round to a keystone is a real cost.
 *
 * Two pools pay for it, and they are earned by playing two different ways:
 *
 * - **Rings** buy the minors and the notables — one point per ring the trunk
 *   lays down, one per badge earned, and one for the sapling itself so the map
 *   is never opened empty.
 * - **Seeds** buy the keystones, one point per Seed ever earned. Six keystones,
 *   each a real trade: they are the only nodes in the game that take something
 *   away, and they cost the currency you only get by finishing a run.
 *
 * Neither pool resets. Rings already survive prestige, and a map that wiped
 * itself every run would be forty taps of admin on a phone.
 *
 * **Every effect here lands on a target the engine actually reads.** That is
 * not a general property of the modifier system — Sap from a tap, Leaf Litter
 * from a pile and Deadwood from a cut are credited directly rather than through
 * a producer, so a `resource: 'sap'` multiplier would be a node that does
 * nothing. Taps are moved through the click stats instead, and the resources
 * that appear below (`light`, `water`, `minerals`) are exactly the three that
 * have producers behind them. See `src/content/tags.ts`.
 *
 * Layer note: content stays free of engine imports. Modifier types, target
 * kinds and stat tags are mirrored by value, exactly as `./upgrades.ts` and
 * `./prestige.ts` do.
 */

/* ------------------------------------------------------------------- types */

/**
 * The engine's click-stat tags, mirrored by value.
 *
 * `src/engine/clicker.ts` owns them; content may not import the engine, and
 * `./upgrades.ts` solves the same problem by writing the strings out at each
 * use. Sixty nodes is too many places to spell `'click.critChance'` correctly,
 * so they are named once here. The two must be changed together — which is what
 * `passives.test.ts` checks, by importing both and comparing.
 */
export const CLICK_STAT_TAGS = {
  clickPower: 'click.power',
  critChance: 'click.critChance',
  critMult: 'click.critMult',
  comboCap: 'combo.cap',
} as const;

/**
 * The underground tag, under the name this file uses it by.
 *
 * `OFFLINE_TAG` is what `./growth.ts` calls it, because the offline calculator
 * was what first needed to tell above ground from below. Every underground part
 * carries it at all times, so a multiplier on it is a multiplier on the roots —
 * which is what the nodes below say, and what they do.
 */
export { ROOT_TAG };

/** Which pool a node is paid from. */
export type PassiveCurrency = 'ring' | 'seed';

/**
 * What a node is, which is also how it is drawn and what it costs.
 *
 * `start` is the heartwood itself: allocated from the first frame, free, and
 * the root every path is measured from.
 */
export type PassiveKind = 'start' | 'minor' | 'notable' | 'keystone';

/** What allocating a node grants. */
export type PassiveEffect =
  /** An ordinary modifier, exactly as an upgrade or an heirloom grants one. */
  | {
      readonly kind: 'modifier';
      readonly type: 'add' | 'mul';
      readonly targetKind: 'tag' | 'resource';
      readonly target: string;
      readonly value: number;
    }
  /** One `mul` per resource, the way a Ring works — everything the tree makes. */
  | { readonly kind: 'allProduction'; readonly mul: number };

/** One branch of the map: a direction out of the centre, and what it is about. */
export interface PassiveBranchDef {
  readonly id: string;
  readonly label: string;
  readonly glyph: string;
  /** One line, shown when a node on this branch is selected. */
  readonly blurb: string;
  /** Drawn colour. Taken from the renderer's palette by eye, not by import. */
  readonly color: string;
  /** Direction out of the centre, in degrees. `-90` is straight up. */
  readonly angle: number;
}

/** A node as the map draws it and the engine reads it. */
export interface PassiveNodeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: PassiveKind;
  /** Branch id, or `null` for the heartwood at the centre. */
  readonly branch: string | null;
  readonly effects: readonly PassiveEffect[];
  /** Position on the map, in map units. The centre is `(0, 0)`. */
  readonly x: number;
  readonly y: number;
  /** Nodes this one is joined to. Undirected — see {@link PASSIVE_EDGES}. */
  readonly links: readonly string[];
}

/* ------------------------------------------------------------------ layout */

/** The node every path starts from. Allocated before the player touches it. */
export const PASSIVE_START_ID = 'heartwood';

/**
 * Where a node sits, relative to its branch.
 *
 * Polar, because the map is a set of rings: `r` is how far out along the branch
 * and `spread` swings it off the branch's own line, in degrees. Authoring in
 * x/y would mean recomputing six sets of coordinates every time a branch moved.
 */
interface NodeSpec {
  /** Id suffix; the branch id is prefixed, so `a` becomes `canopy:a`. */
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly kind: Exclude<PassiveKind, 'start'>;
  readonly effects: readonly PassiveEffect[];
  readonly r: number;
  readonly spread: number;
  /**
   * What it hangs off, as branch-local keys. `'*'` means the heartwood.
   * Cross-branch links are added separately, below.
   */
  readonly from: readonly string[];
}

/* --------------------------------------------------------------- the table */

export const PASSIVE_BRANCHES: readonly PassiveBranchDef[] = [
  {
    id: 'canopy',
    label: 'Canopy',
    glyph: '🍃',
    blurb: 'Light, and the leaves that catch it. Straight up, where the sun is.',
    color: '#6f9e4a',
    angle: -90,
  },
  {
    id: 'bark',
    label: 'Bark',
    glyph: '🪓',
    blurb: 'The tap itself: what one hit on the trunk is worth.',
    color: '#8c6238',
    angle: -30,
  },
  {
    id: 'heart',
    label: 'Heartwood',
    glyph: '◎',
    blurb: 'Age. The slow multipliers a tree only gets by standing for years.',
    color: '#ffd27a',
    angle: 30,
  },
  {
    id: 'roots',
    label: 'Roots',
    glyph: '🫚',
    blurb: 'Water and Minerals, and everything that works while you are gone.',
    color: '#a8875e',
    angle: 90,
  },
  {
    id: 'symbiosis',
    label: 'Symbiosis',
    glyph: '🍄',
    blurb: 'What lives in the tree and pays rent. Broad, shallow bonuses.',
    color: '#cba0e9',
    angle: 150,
  },
  {
    id: 'season',
    label: 'Season',
    glyph: '🍂',
    blurb: 'Thrift. Cheaper wood, and the patience to stand through winter.',
    color: '#c8b06a',
    angle: -150,
  },
];

/**
 * Every branch's nodes, in the same shape.
 *
 * The chain is deliberately identical across branches — two minors, a notable,
 * four more minors, a second notable, one last minor, a keystone — because the
 * map has to be readable at a glance on a phone. What differs is what the nodes
 * *do*, not where they are; an irregular map would be more interesting to look
 * at and far worse to navigate with a thumb.
 */
const BRANCH_NODES: Readonly<Record<string, readonly NodeSpec[]>> = {
  canopy: [
    {
      key: 'a',
      name: 'Broad Blade',
      description: 'A wider leaf catches more of the morning. +6% Light.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 1.06 },
      ],
      r: 1.5,
      spread: -12,
      from: ['*'],
    },
    {
      key: 'b',
      name: 'Thin Cuticle',
      description: 'Less wax between the sun and the work. +6% Light.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 1.06 },
      ],
      r: 1.5,
      spread: 12,
      from: ['*'],
    },
    {
      key: 'c',
      name: 'Sunward Leaf',
      description: 'Every blade turns to face the light. +22% Light.',
      kind: 'notable',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 1.22 },
      ],
      r: 2.5,
      spread: 0,
      from: ['a', 'b'],
    },
    {
      key: 'd',
      name: 'Layered Crown',
      description: 'Leaves stacked so the lower ones still see sky. +7% canopy output.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: CANOPY_TAG, value: 1.07 },
      ],
      r: 3.5,
      spread: -16,
      from: ['c'],
    },
    {
      key: 'e',
      name: 'Stomata',
      description: 'More pores, more traffic. +7% Light.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 1.07 },
      ],
      r: 3.5,
      spread: 16,
      from: ['c'],
    },
    {
      key: 'f',
      name: 'Heliotropy',
      description: 'The whole crown leans through the day. +8% Light.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 1.08 },
      ],
      r: 4.5,
      spread: -22,
      from: ['d'],
    },
    {
      key: 'g',
      name: 'Windbreak',
      description: 'A crown that does not thrash keeps working. +8% canopy output.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: CANOPY_TAG, value: 1.08 },
      ],
      r: 4.5,
      spread: 22,
      from: ['e'],
    },
    {
      key: 'h',
      name: 'Broadleaf',
      description: 'The canopy a whole clearing grows under. +30% Light, +10% canopy output.',
      kind: 'notable',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 1.3 },
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: CANOPY_TAG, value: 1.1 },
      ],
      r: 5.4,
      spread: 0,
      from: ['f', 'g'],
    },
    {
      key: 'i',
      name: 'Crown Shyness',
      description: 'Leaves that keep their distance shade each other less. +10% Light.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 1.1 },
      ],
      r: 6.4,
      spread: 0,
      from: ['h'],
    },
    {
      key: 'k',
      name: 'Deep Shade',
      description:
        'Grow for the sun and nothing else. Light ×2.3 — and the bark goes quiet: half the Sap per tap.',
      kind: 'keystone',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 2.3 },
        {
          kind: 'modifier',
          type: 'mul',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.clickPower,
          value: 0.5,
        },
      ],
      r: 7.4,
      spread: 0,
      from: ['i'],
    },
  ],

  bark: [
    {
      key: 'a',
      name: 'Thin Bark',
      description: 'Less to get through. +1 Sap per tap.',
      kind: 'minor',
      effects: [
        {
          kind: 'modifier',
          type: 'add',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.clickPower,
          value: 1,
        },
      ],
      r: 1.5,
      spread: -12,
      from: ['*'],
    },
    {
      key: 'b',
      name: 'Sweet Run',
      description: 'The sap under this patch runs richer. +1 Sap per tap.',
      kind: 'minor',
      effects: [
        {
          kind: 'modifier',
          type: 'add',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.clickPower,
          value: 1,
        },
      ],
      r: 1.5,
      spread: 12,
      from: ['*'],
    },
    {
      key: 'c',
      name: 'Ironbark',
      description: 'Hard wood pays back what you put into it. +4 Sap per tap.',
      kind: 'notable',
      effects: [
        {
          kind: 'modifier',
          type: 'add',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.clickPower,
          value: 4,
        },
      ],
      r: 2.5,
      spread: 0,
      from: ['a', 'b'],
    },
    {
      key: 'd',
      name: 'Quick Eye',
      description: 'You start to see where the wood gives. +1.5% critical taps.',
      kind: 'minor',
      effects: [
        {
          kind: 'modifier',
          type: 'add',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.critChance,
          value: 0.015,
        },
      ],
      r: 3.5,
      spread: -16,
      from: ['c'],
    },
    {
      key: 'e',
      name: 'Deep Notch',
      description: 'When it does give, it gives more. +1 to the critical multiplier.',
      kind: 'minor',
      effects: [
        {
          kind: 'modifier',
          type: 'add',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.critMult,
          value: 1,
        },
      ],
      r: 3.5,
      spread: 16,
      from: ['c'],
    },
    {
      key: 'f',
      name: 'Practised Hand',
      description: 'The same swing, landed properly. +3 Sap per tap.',
      kind: 'minor',
      effects: [
        {
          kind: 'modifier',
          type: 'add',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.clickPower,
          value: 3,
        },
      ],
      r: 4.5,
      spread: -22,
      from: ['d'],
    },
    {
      key: 'g',
      name: 'Steady Beat',
      description: 'A rhythm the meter can hold onto. +12 combo stacks.',
      kind: 'minor',
      effects: [
        {
          kind: 'modifier',
          type: 'add',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.comboCap,
          value: 12,
        },
      ],
      r: 4.5,
      spread: 22,
      from: ['e'],
    },
    {
      key: 'h',
      name: 'Reading the Grain',
      description: 'You know this trunk now. +5% critical taps, +2 to the critical multiplier.',
      kind: 'notable',
      effects: [
        {
          kind: 'modifier',
          type: 'add',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.critChance,
          value: 0.05,
        },
        {
          kind: 'modifier',
          type: 'add',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.critMult,
          value: 2,
        },
      ],
      r: 5.4,
      spread: 0,
      from: ['f', 'g'],
    },
    {
      key: 'i',
      name: 'Heartwood Tap',
      description: 'Down to the oldest wood in the trunk. +25% Sap per tap.',
      kind: 'minor',
      effects: [
        {
          kind: 'modifier',
          type: 'mul',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.clickPower,
          value: 1.25,
        },
      ],
      r: 6.4,
      spread: 0,
      from: ['h'],
    },
    {
      key: 'k',
      name: 'Splitbark',
      description:
        'One enormous cut instead of a rhythm. Taps hit four times as hard, and the combo meter never fills again.',
      kind: 'keystone',
      effects: [
        {
          kind: 'modifier',
          type: 'mul',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.clickPower,
          value: 4,
        },
        {
          kind: 'modifier',
          type: 'mul',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.comboCap,
          value: 0,
        },
      ],
      r: 7.4,
      spread: 0,
      from: ['i'],
    },
  ],

  heart: [
    {
      key: 'a',
      name: 'Sapwood',
      description: 'The living ring, doing the work. +4% to everything the tree makes.',
      kind: 'minor',
      effects: [{ kind: 'allProduction', mul: 1.04 }],
      r: 1.5,
      spread: -12,
      from: ['*'],
    },
    {
      key: 'b',
      name: 'Latewood',
      description: 'The dense band laid down at the end of a good year. +6% Light.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 1.06 },
      ],
      r: 1.5,
      spread: 12,
      from: ['*'],
    },
    {
      key: 'c',
      name: 'Old Growth',
      description: 'Nothing here is in a hurry. +15% to everything the tree makes.',
      kind: 'notable',
      effects: [{ kind: 'allProduction', mul: 1.15 }],
      r: 2.5,
      spread: 0,
      from: ['a', 'b'],
    },
    {
      key: 'd',
      name: 'Standing Dead',
      description: 'Even the dry wood holds the shape. +5% to everything the tree makes.',
      kind: 'minor',
      effects: [{ kind: 'allProduction', mul: 1.05 }],
      r: 3.5,
      spread: -16,
      from: ['c'],
    },
    {
      key: 'e',
      name: 'Long Shadow',
      description: 'Tall enough to be the thing casting it. +8% Light.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 1.08 },
      ],
      r: 3.5,
      spread: 16,
      from: ['c'],
    },
    {
      key: 'f',
      name: 'Weathered',
      description: 'It has done this before. New growth costs 5% less.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: GROWTH_COST_TAG, value: 0.95 },
      ],
      r: 4.5,
      spread: -22,
      from: ['d'],
    },
    {
      key: 'g',
      name: 'Century Wood',
      description: 'A hundred rings of practice. +6% to everything the tree makes.',
      kind: 'minor',
      effects: [{ kind: 'allProduction', mul: 1.06 }],
      r: 4.5,
      spread: 22,
      from: ['e'],
    },
    {
      key: 'h',
      name: 'Crown Fire',
      description: 'Burn bright while the standing is good. +40% Light.',
      kind: 'notable',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 1.4 },
      ],
      r: 5.4,
      spread: 0,
      from: ['f', 'g'],
    },
    {
      key: 'i',
      name: 'Seed Year',
      description:
        'A year the whole tree spends on cones. +12% Light, which is what Seeds are counted from.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 1.12 },
      ],
      r: 6.4,
      spread: 0,
      from: ['h'],
    },
    {
      key: 'k',
      name: 'Mast Year',
      description:
        'Throw everything into the cones. Light ×2.2 — and every new limb costs half again as much.',
      kind: 'keystone',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 2.2 },
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: GROWTH_COST_TAG, value: 1.5 },
      ],
      r: 7.4,
      spread: 0,
      from: ['i'],
    },
  ],

  roots: [
    {
      key: 'a',
      name: 'First Hairs',
      description: 'The fine ends that actually drink. +7% Water.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'water', value: 1.07 },
      ],
      r: 1.5,
      spread: -12,
      from: ['*'],
    },
    {
      key: 'b',
      name: 'Grit Seeker',
      description: 'A tip that knows stone from soil. +7% Minerals.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'minerals', value: 1.07 },
      ],
      r: 1.5,
      spread: 12,
      from: ['*'],
    },
    {
      key: 'c',
      name: 'Taproot',
      description: 'One root straight down, past the easy ground. +30% Minerals.',
      kind: 'notable',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'minerals', value: 1.3 },
      ],
      r: 2.5,
      spread: 0,
      from: ['a', 'b'],
    },
    {
      key: 'd',
      name: 'Capillary',
      description: 'Water climbs on its own once the column is unbroken. +8% Water.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'water', value: 1.08 },
      ],
      r: 3.5,
      spread: -16,
      from: ['c'],
    },
    {
      key: 'e',
      name: 'Ore Sense',
      description: 'It grows toward the seam. +8% Minerals.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'minerals', value: 1.08 },
      ],
      r: 3.5,
      spread: 16,
      from: ['c'],
    },
    {
      key: 'f',
      name: 'Wide Mat',
      description: 'Shallow, broad, and always working. +7% from everything underground.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: ROOT_TAG, value: 1.07 },
      ],
      r: 4.5,
      spread: -22,
      from: ['d'],
    },
    {
      key: 'g',
      name: 'Deep Reach',
      description: 'Down where the pockets are. +9% Minerals.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'minerals', value: 1.09 },
      ],
      r: 4.5,
      spread: 22,
      from: ['e'],
    },
    {
      key: 'h',
      name: 'Fine Hairs',
      description: 'Ten thousand of them, each one drinking. +35% Water.',
      kind: 'notable',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'water', value: 1.35 },
      ],
      r: 5.4,
      spread: 0,
      from: ['f', 'g'],
    },
    {
      key: 'i',
      name: 'Root Pressure',
      description:
        'The column pushes whether anyone is watching or not. +10% from everything underground.',
      kind: 'minor',
      effects: [{ kind: 'modifier', type: 'mul', targetKind: 'tag', target: ROOT_TAG, value: 1.1 }],
      r: 6.4,
      spread: 0,
      from: ['h'],
    },
    {
      key: 'k',
      name: 'Mycelial Net',
      description:
        'Trade the light for the dark. Everything underground works twice as hard, and the canopy loses nearly half.',
      kind: 'keystone',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: ROOT_TAG, value: 2 },
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: CANOPY_TAG, value: 0.55 },
      ],
      r: 7.4,
      spread: 0,
      from: ['i'],
    },
  ],

  symbiosis: [
    {
      key: 'a',
      name: 'Leaf Mould',
      description: 'Last year, feeding this one. +4% to everything the tree makes.',
      kind: 'minor',
      effects: [{ kind: 'allProduction', mul: 1.04 }],
      r: 1.5,
      spread: -12,
      from: ['*'],
    },
    {
      key: 'b',
      name: 'Ant Road',
      description: 'A supply line nobody had to dig. +7% Minerals.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'minerals', value: 1.07 },
      ],
      r: 1.5,
      spread: 12,
      from: ['*'],
    },
    {
      key: 'c',
      name: 'Hive Mind',
      description: 'Everyone living here pulls the same way. +12% to everything the tree makes.',
      kind: 'notable',
      effects: [{ kind: 'allProduction', mul: 1.12 }],
      r: 2.5,
      spread: 0,
      from: ['a', 'b'],
    },
    {
      key: 'd',
      name: 'Warm Litter',
      description: 'The ground under the tree holds its heat and its damp. +7% Water.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'water', value: 1.07 },
      ],
      r: 3.5,
      spread: -16,
      from: ['c'],
    },
    {
      key: 'e',
      name: 'Pollen Drift',
      description: 'Traffic in the crown all summer. +7% Light.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'resource', target: 'light', value: 1.07 },
      ],
      r: 3.5,
      spread: 16,
      from: ['c'],
    },
    {
      key: 'f',
      name: 'Fungal Thread',
      description: 'A second root system, borrowed. +8% from everything underground.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: ROOT_TAG, value: 1.08 },
      ],
      r: 4.5,
      spread: -22,
      from: ['d'],
    },
    {
      key: 'g',
      name: 'Nectar Trade',
      description: 'Something sweet at the tap, and something in return. +2 Sap per tap.',
      kind: 'minor',
      effects: [
        {
          kind: 'modifier',
          type: 'add',
          targetKind: 'tag',
          target: CLICK_STAT_TAGS.clickPower,
          value: 2,
        },
      ],
      r: 4.5,
      spread: 22,
      from: ['e'],
    },
    {
      key: 'h',
      name: 'Rot and Renewal',
      description: 'Nothing here is wasted twice. +16% to everything the tree makes.',
      kind: 'notable',
      effects: [{ kind: 'allProduction', mul: 1.16 }],
      r: 5.4,
      spread: 0,
      from: ['f', 'g'],
    },
    {
      key: 'i',
      name: 'Mutualism',
      description: 'Both sides ahead. +8% to everything the tree makes.',
      kind: 'minor',
      effects: [{ kind: 'allProduction', mul: 1.08 }],
      r: 6.4,
      spread: 0,
      from: ['h'],
    },
    {
      key: 'k',
      name: 'Heartrot',
      description:
        'Let the core go soft and give the tenants the run of it. Everything the tree makes ×1.7, and every new limb costs 70% more.',
      kind: 'keystone',
      effects: [
        { kind: 'allProduction', mul: 1.7 },
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: GROWTH_COST_TAG, value: 1.7 },
      ],
      r: 7.4,
      spread: 0,
      from: ['i'],
    },
  ],

  season: [
    {
      key: 'a',
      name: 'Frugal Wood',
      description: 'Nothing spent on show. New growth costs 3% less.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: GROWTH_COST_TAG, value: 0.97 },
      ],
      r: 1.5,
      spread: -12,
      from: ['*'],
    },
    {
      key: 'b',
      name: 'Slow Start',
      description: 'Begin late, end further on. +4% to everything the tree makes.',
      kind: 'minor',
      effects: [{ kind: 'allProduction', mul: 1.04 }],
      r: 1.5,
      spread: 12,
      from: ['*'],
    },
    {
      key: 'c',
      name: 'Thrift',
      description:
        'A tree that wastes nothing grows further on the same Sap. New growth costs 10% less.',
      kind: 'notable',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: GROWTH_COST_TAG, value: 0.9 },
      ],
      r: 2.5,
      spread: 0,
      from: ['a', 'b'],
    },
    {
      key: 'd',
      name: 'Hard Frost',
      description: 'What survives it is stronger. +5% to everything the tree makes.',
      kind: 'minor',
      effects: [{ kind: 'allProduction', mul: 1.05 }],
      r: 3.5,
      spread: -16,
      from: ['c'],
    },
    {
      key: 'e',
      name: 'Lean Year',
      description: 'You learn what a limb really costs. New growth costs 4% less.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: GROWTH_COST_TAG, value: 0.96 },
      ],
      r: 3.5,
      spread: 16,
      from: ['c'],
    },
    {
      key: 'f',
      name: 'Spring Surge',
      description: 'Everything at once, the moment it thaws. +6% to everything the tree makes.',
      kind: 'minor',
      effects: [{ kind: 'allProduction', mul: 1.06 }],
      r: 4.5,
      spread: -22,
      from: ['d'],
    },
    {
      key: 'g',
      name: 'Dormancy',
      description: 'Shut down properly and spend nothing. New growth costs 5% less.',
      kind: 'minor',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: GROWTH_COST_TAG, value: 0.95 },
      ],
      r: 4.5,
      spread: 22,
      from: ['e'],
    },
    {
      key: 'h',
      name: 'Hardwood',
      description: 'Slow, dense, and worth the wait. +14% to everything the tree makes.',
      kind: 'notable',
      effects: [{ kind: 'allProduction', mul: 1.14 }],
      r: 5.4,
      spread: 0,
      from: ['f', 'g'],
    },
    {
      key: 'i',
      name: 'Annual Ring',
      description: 'One more year on the count. +7% to everything the tree makes.',
      kind: 'minor',
      effects: [{ kind: 'allProduction', mul: 1.07 }],
      r: 6.4,
      spread: 0,
      from: ['h'],
    },
    {
      key: 'k',
      name: 'Evergreen',
      description:
        'Never drop a leaf, never start again. Growth costs half — and the tree makes 15% less of everything.',
      kind: 'keystone',
      effects: [
        { kind: 'modifier', type: 'mul', targetKind: 'tag', target: GROWTH_COST_TAG, value: 0.5 },
        { kind: 'allProduction', mul: 0.85 },
      ],
      r: 7.4,
      spread: 0,
      from: ['i'],
    },
  ],
};

/**
 * Links between branches, as pairs of branch-local keys.
 *
 * Each branch's `g` node reaches around to the next branch's `f`, which is what
 * turns six separate lines into a map: the cheapest route to a far keystone may
 * run around the rim rather than back through the centre, and deciding that is
 * most of what a passive tree is for.
 */
const RIM_LINK: readonly [string, string] = ['g', 'f'];

/* ----------------------------------------------------------------- assembly */

/** Degrees → radians. */
const RADIANS = Math.PI / 180;

/** Place a node: `r` out along `angle`, swung `spread` degrees off it. */
function place(angle: number, spread: number, r: number): { x: number; y: number } {
  const theta = (angle + spread) * RADIANS;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

/** Fully-qualified node id: `canopy:a`. */
export function passiveNodeId(branch: string, key: string): string {
  return `${branch}:${key}`;
}

function buildNodes(): readonly PassiveNodeDef[] {
  const nodes: PassiveNodeDef[] = [
    {
      id: PASSIVE_START_ID,
      name: 'Heartwood',
      description:
        'The oldest wood in the trunk, and the middle of the map. Every path starts here.',
      kind: 'start',
      branch: null,
      effects: [],
      x: 0,
      y: 0,
      links: [],
    },
  ];

  for (const branch of PASSIVE_BRANCHES) {
    for (const spec of BRANCH_NODES[branch.id]) {
      const { x, y } = place(branch.angle, spec.spread, spec.r);
      nodes.push({
        id: passiveNodeId(branch.id, spec.key),
        name: spec.name,
        description: spec.description,
        kind: spec.kind,
        branch: branch.id,
        effects: spec.effects,
        x,
        y,
        links: spec.from.map((key) =>
          key === '*' ? PASSIVE_START_ID : passiveNodeId(branch.id, key),
        ),
      });
    }
  }

  // The rim, added after every node exists so a link can point forward.
  const rim: [string, string][] = PASSIVE_BRANCHES.map((branch, index) => {
    const next = PASSIVE_BRANCHES[(index + 1) % PASSIVE_BRANCHES.length];
    return [passiveNodeId(branch.id, RIM_LINK[0]), passiveNodeId(next.id, RIM_LINK[1])];
  });

  return nodes.map((node) => {
    const extra = rim.filter(([from]) => from === node.id).map(([, to]) => to);
    return extra.length === 0 ? node : { ...node, links: [...node.links, ...extra] };
  });
}

/** Every node on the map, the heartwood first. */
export const PASSIVE_NODES: readonly PassiveNodeDef[] = buildNodes();

/** Lookup from id → definition. */
export const PASSIVE_NODE_BY_ID: Readonly<Record<string, PassiveNodeDef>> = Object.fromEntries(
  PASSIVE_NODES.map((node) => [node.id, node]),
);

/** Lookup from id → branch definition. `null` for the heartwood. */
export const PASSIVE_BRANCH_BY_ID: Readonly<Record<string, PassiveBranchDef>> = Object.fromEntries(
  PASSIVE_BRANCHES.map((branch) => [branch.id, branch]),
);

/**
 * Every link, once each, as an ordered pair.
 *
 * Authored one way round — a node names what it hangs off — and read both ways
 * by {@link PASSIVE_NEIGHBOURS}, because allocation does not care which end of
 * an edge was written first.
 */
export const PASSIVE_EDGES: readonly (readonly [string, string])[] = PASSIVE_NODES.flatMap((node) =>
  node.links.map((other) => [node.id, other] as const),
);

/** Adjacency, both ways. The one structure allocation is measured against. */
export const PASSIVE_NEIGHBOURS: Readonly<Record<string, readonly string[]>> = (() => {
  const map: Record<string, string[]> = Object.fromEntries(
    PASSIVE_NODES.map((node) => [node.id, [] as string[]]),
  );
  for (const [from, to] of PASSIVE_EDGES) {
    if (!map[from].includes(to)) map[from].push(to);
    if (!map[to].includes(from)) map[to].push(from);
  }
  return map;
})();

/** What a node costs to allocate: one point, from this pool. */
export function passiveCurrency(kind: PassiveKind): PassiveCurrency | null {
  if (kind === 'start') return null;
  return kind === 'keystone' ? 'seed' : 'ring';
}

/** How far out the furthest node sits, for the map's initial framing. */
export const PASSIVE_MAP_RADIUS = PASSIVE_NODES.reduce(
  (max, node) => Math.max(max, Math.hypot(node.x, node.y)),
  0,
);
