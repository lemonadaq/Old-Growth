import type { TreeNodeType } from './growth';
import type { ResourceId } from './resources';

/**
 * Prestige: what "Go to Seed" costs, what it pays, and what the Seeds buy.
 *
 * Everything above the line is a number a balance pass will move; everything
 * below it is the Seed Vault as data. The split matters because the Vault is the
 * first screen in the game whose *shape* is content — four branches of five
 * nodes, each node knowing what it grants — so adding an heirloom is an edit
 * here and nowhere else.
 *
 * Layer note: content stays free of engine imports. Modifier types, target kinds
 * and click-stat tags are mirrored by value, exactly as `./upgrades.ts` and
 * `./totems.ts` do.
 */

/* ---------------------------------------------------------------- maturity */

/**
 * Lifetime Light one Seed is measured against: `Seeds = ⌊√(light / this)⌋`.
 *
 * Straight from the design line. It is a *square root*, so the second Seed costs
 * four times the first and the tenth a hundred times — which is what stops a
 * player from prestiging on a whim and what makes each run want to be longer
 * than the last.
 */
export const SEED_LIGHT_DIVISOR = 1e6;

/** Seed Fragments the songbird has to drop before they are worth one Seed. */
export const SEED_FRAGMENTS_PER_SEED = 100;

/**
 * How tall the tree must stand before it can seed, in canonical units.
 *
 * A bare trunk is 0.6, so this is nearly twice the sapling the run starts as:
 * enough deliberate upward building that "maturity" is something the player made
 * rather than something that happened. It is measured to the highest point of
 * the canopy — see `treeHeight` — because height is the one thing about a tree
 * you can judge from across a field.
 *
 * **The canopy has a ceiling, and this has to sit under it.** `depthFalloff`
 * shrinks every generation of wood, so each branch added above the last buys
 * less height than the one before: a tree grown as greedily upward as the rules
 * allow tops out around 1.32, and one grown as a normal round canopy lands well
 * short of that. A gate at the ceiling would be a gate nobody could pass. This
 * is roughly a dozen well-placed parts, with real headroom above it.
 */
export const PRESTIGE_HEIGHT_UNITS = 1.15;

/**
 * Lifetime Light the tree must have gathered before it can seed.
 *
 * Deliberately *equal* to {@link SEED_LIGHT_DIVISOR} rather than a number of its
 * own: it is the point at which the yield formula first pays out a whole Seed,
 * so the gate and the reward cannot drift apart. A prestige that reset the run
 * and handed back nothing would be a trap, and this is the one line that
 * guarantees it can never happen.
 */
export const PRESTIGE_LIGHT_REQUIREMENT = SEED_LIGHT_DIVISOR;

/** How long the "Go to Seed" ceremony runs before the reset lands. */
export const CEREMONY_SECONDS = 6;

/* ------------------------------------------------------------------ forest */

/** What one tree standing in the Old Growth forest adds to all production. */
export const FOREST_PRODUCTION_BONUS = 0.01;

/**
 * Most silhouettes drawn on the hills at once.
 *
 * Past this the forest is a *counter* rather than more marks on the ridge: the
 * thirty-first tree is a pixel nobody can pick out, and the bonus it grants is
 * already legible in the badge. The trees drawn are the most recent thirty, each
 * standing in the spot its own planting index gave it, so the newest tree is
 * always visible and no existing one ever moves.
 */
export const FOREST_RENDER_LIMIT = 30;

/* ---------------------------------------------------------------- offline */

/**
 * Hours of absence the tree pays for before STEP 14's calculator stops counting.
 *
 * Stated here, unused by anything but the Tempo heirloom and the Vault's own
 * readout, because Tempo's second node is "+4h offline cap" and a bonus with no
 * base to add to would be a number the player cannot check. STEP 14 owns what
 * the cap *does*; this owns what it is.
 */
export const BASE_OFFLINE_CAP_HOURS = 8;

/* --------------------------------------------------------------- heirlooms */

/**
 * What one level of an heirloom grants.
 *
 * Most are ordinary modifiers, and those look exactly like an upgrade's. The
 * rest are *capabilities* the engine reads directly — a starting balance, a
 * remembered layout, a friend already in residence — which is the same shape the
 * Rake takes: bending them into modifiers would need stats that do not exist to
 * carry numbers nothing reads.
 */
export type HeirloomEffect =
  /** An ordinary modifier: `add` sums per level, `mul` compounds per level. */
  | {
      readonly kind: 'modifier';
      readonly type: 'add' | 'mul';
      readonly targetKind: 'tag' | 'resource';
      readonly target: string;
      readonly valuePerLevel: number;
    }
  /** One `mul` per resource, the way a Ring works — "everything the tree makes". */
  | { readonly kind: 'allProduction'; readonly mulPerLevel: number }
  /** The run opens with this much of a resource already banked. */
  | {
      readonly kind: 'startingResource';
      readonly resource: ResourceId;
      readonly amountPerLevel: number;
    }
  /** The run opens with this many parts already grown on the trunk. */
  | { readonly kind: 'startingPart'; readonly part: TreeNodeType; readonly countPerLevel: number }
  /** The run opens with the previous tree's layout, for one half of the tree. */
  | { readonly kind: 'memory'; readonly domain: 'root' | 'canopy' }
  /** The chosen symbiont is in residence from the first tick. */
  | { readonly kind: 'bond' }
  /** …and arrives this many levels above the one it would normally settle at. */
  | { readonly kind: 'bondLevel'; readonly levelsPerLevel: number }
  /** Seasons run shorter by this fraction per level. */
  | { readonly kind: 'seasonLength'; readonly fractionPerLevel: number }
  /** Hours added to the offline cap per level. */
  | { readonly kind: 'offlineCap'; readonly hoursPerLevel: number };

export interface HeirloomDef {
  readonly id: string;
  readonly name: string;
  /** One glyph for the node on the cross-section. */
  readonly glyph: string;
  /** One line, written for a player, saying what a level buys. */
  readonly description: string;
  /** Levels available. Every heirloom is capped — the Vault is a map, not a sink. */
  readonly maxLevel: number;
  /** Seeds the first level costs. */
  readonly baseCost: number;
  /** Multiplicative cost growth per level already owned. */
  readonly costGrowth: number;
  readonly effects: readonly HeirloomEffect[];
}

/** One of the four limbs of the Seed Vault. */
export interface HeirloomBranchDef {
  readonly id: string;
  readonly label: string;
  readonly glyph: string;
  /** One line naming what the whole branch is *for*. */
  readonly blurb: string;
  /** Accent colour, used by the cross-section and the node cards. */
  readonly color: string;
  /**
   * The branch's nodes, root-end first.
   *
   * Order is structure, not presentation: a node opens only once the one before
   * it is owned, which is what makes a branch a branch rather than five
   * unrelated purchases sharing a heading.
   */
  readonly nodes: readonly HeirloomDef[];
}

/**
 * The Seed Vault: twenty heirlooms in four short branches.
 *
 * Each branch answers a different "the next run should be…": Start says
 * *sooner*, Memory says *further along*, Bond says *not alone*, Tempo says
 * *faster*. They deliberately do not stack into one build — a branch is five
 * levels deep and the deepest nodes cost more Seeds than a first prestige will
 * ever pay, so early runs choose one and commit.
 *
 * Costs are first-pass; STEP 19 owns real balance.
 */
export const HEIRLOOM_BRANCHES: readonly HeirloomBranchDef[] = [
  {
    id: 'start',
    label: 'Start',
    glyph: '🌱',
    blurb: 'Skip the first ten minutes. The seed lands with something in its pocket.',
    color: '#a9c46c',
    nodes: [
      {
        id: 'seedcase',
        name: 'Seedcase',
        glyph: '🥜',
        description: 'The seed carries its own first meal. Begin each run with 200 Sap.',
        maxLevel: 4,
        baseCost: 1,
        costGrowth: 2.5,
        effects: [{ kind: 'startingResource', resource: 'sap', amountPerLevel: 200 }],
      },
      {
        id: 'firstLimb',
        name: 'First Limb',
        glyph: '🌿',
        description: 'A branch is already out before you touch the trunk.',
        maxLevel: 2,
        baseCost: 3,
        costGrowth: 4,
        effects: [{ kind: 'startingPart', part: 'branch', countPerLevel: 1 }],
      },
      {
        id: 'firstRoot',
        name: 'First Root',
        glyph: '🫚',
        description: 'A root is already in the ground, drawing Water from the first tick.',
        maxLevel: 2,
        baseCost: 3,
        costGrowth: 4,
        effects: [{ kind: 'startingPart', part: 'rootSegment', countPerLevel: 1 }],
      },
      {
        id: 'cotyledon',
        name: 'Cotyledon',
        glyph: '☀️',
        description: 'Seed leaves, opened before the first dawn. Begin with 150 Light.',
        maxLevel: 3,
        baseCost: 6,
        costGrowth: 3,
        effects: [{ kind: 'startingResource', resource: 'light', amountPerLevel: 150 }],
      },
      {
        id: 'vigour',
        name: 'Vigour',
        glyph: '💪',
        description: 'Young wood runs freely. Every tap pays 12% more Sap.',
        maxLevel: 5,
        baseCost: 8,
        costGrowth: 2.2,
        effects: [
          {
            kind: 'modifier',
            type: 'mul',
            targetKind: 'tag',
            target: 'click.power',
            valuePerLevel: 1.12,
          },
        ],
      },
    ],
  },
  {
    id: 'memory',
    label: 'Memory',
    glyph: '🧠',
    blurb: 'The ground remembers where the water was. So does the tree that grew there.',
    color: '#c9a878',
    nodes: [
      {
        id: 'rootMap',
        name: 'Root Map',
        glyph: '🗺️',
        description: 'The new tree puts its roots down exactly where the old one had them.',
        maxLevel: 1,
        baseCost: 5,
        costGrowth: 1,
        effects: [{ kind: 'memory', domain: 'root' }],
      },
      {
        id: 'deepHabit',
        name: 'Deep Habit',
        glyph: '⛏️',
        description: 'Roots that have been this way before work 12% harder.',
        maxLevel: 4,
        baseCost: 4,
        costGrowth: 2.4,
        effects: [
          { kind: 'modifier', type: 'mul', targetKind: 'tag', target: 'root', valuePerLevel: 1.12 },
        ],
      },
      {
        id: 'canopyMap',
        name: 'Canopy Map',
        glyph: '🌳',
        description: 'And the canopy too — the whole tree you left, standing again.',
        maxLevel: 1,
        baseCost: 25,
        costGrowth: 1,
        effects: [{ kind: 'memory', domain: 'canopy' }],
      },
      {
        id: 'oreSense',
        name: 'Ore Sense',
        glyph: '🪨',
        description: 'A root tip that has struck this seam before finds 15% more of it.',
        maxLevel: 4,
        baseCost: 10,
        costGrowth: 2.4,
        effects: [
          {
            kind: 'modifier',
            type: 'mul',
            targetKind: 'resource',
            target: 'minerals',
            valuePerLevel: 1.15,
          },
        ],
      },
      {
        id: 'heartwoodLedger',
        name: 'Heartwood Ledger',
        glyph: '📜',
        description:
          'Everything the tree has ever learned, kept in the grain. +4% to all production.',
        maxLevel: 5,
        baseCost: 30,
        costGrowth: 2.6,
        effects: [{ kind: 'allProduction', mulPerLevel: 1.04 }],
      },
    ],
  },
  {
    id: 'bond',
    label: 'Bond',
    glyph: '🐝',
    blurb: 'Somebody was living here before the seed fell, and stayed.',
    color: '#f2c341',
    nodes: [
      {
        id: 'oldFriend',
        name: 'Old Friend',
        glyph: '🤝',
        description: 'One creature of your choosing is already in residence when the run begins.',
        maxLevel: 1,
        baseCost: 8,
        costGrowth: 1,
        effects: [{ kind: 'bond' }],
      },
      {
        id: 'warmWelcome',
        name: 'Warm Welcome',
        glyph: '🔥',
        description: 'Your old friend arrives one level further along per level bought.',
        maxLevel: 3,
        baseCost: 12,
        costGrowth: 3,
        effects: [{ kind: 'bondLevel', levelsPerLevel: 1 }],
      },
      {
        id: 'nectarFlow',
        name: 'Nectar Flow',
        glyph: '🌸',
        description: 'A canopy worth visiting is a canopy worth 10% more.',
        maxLevel: 4,
        baseCost: 10,
        costGrowth: 2.4,
        effects: [
          {
            kind: 'modifier',
            type: 'mul',
            targetKind: 'tag',
            target: 'canopy',
            valuePerLevel: 1.1,
          },
        ],
      },
      {
        id: 'leafMould',
        name: 'Leaf Mould',
        glyph: '🍂',
        description: 'Everything that falls is worked back in. +25% Leaf Litter.',
        maxLevel: 3,
        baseCost: 8,
        costGrowth: 2.5,
        effects: [
          {
            kind: 'modifier',
            type: 'mul',
            targetKind: 'resource',
            target: 'leafLitter',
            valuePerLevel: 1.25,
          },
        ],
      },
      {
        id: 'chorus',
        name: 'Chorus',
        glyph: '🎶',
        description: 'A tree full of neighbours is a louder tree. +3% to all production.',
        maxLevel: 5,
        baseCost: 26,
        costGrowth: 2.6,
        effects: [{ kind: 'allProduction', mulPerLevel: 1.03 }],
      },
    ],
  },
  {
    id: 'tempo',
    label: 'Tempo',
    glyph: '⏳',
    blurb: 'The same year, run through faster — and a longer leash while you are away.',
    color: '#6fb7e0',
    nodes: [
      {
        id: 'quickening',
        name: 'Quickening',
        glyph: '🌀',
        description: 'Seasons turn 10% sooner per level, so a Ring is that much nearer.',
        maxLevel: 3,
        baseCost: 6,
        costGrowth: 3,
        effects: [{ kind: 'seasonLength', fractionPerLevel: 0.1 }],
      },
      {
        id: 'longSleep',
        name: 'Long Sleep',
        glyph: '🌙',
        description: 'The roots keep working four hours longer into your absence, per level.',
        maxLevel: 3,
        baseCost: 6,
        costGrowth: 3,
        effects: [{ kind: 'offlineCap', hoursPerLevel: 4 }],
      },
      {
        id: 'sundial',
        name: 'Sundial',
        glyph: '🕰️',
        description: 'The canopy turns to follow the sun. +10% Light.',
        maxLevel: 4,
        baseCost: 9,
        costGrowth: 2.4,
        effects: [
          {
            kind: 'modifier',
            type: 'mul',
            targetKind: 'resource',
            target: 'light',
            valuePerLevel: 1.1,
          },
        ],
      },
      {
        id: 'metronome',
        name: 'Metronome',
        glyph: '🥁',
        description: 'A steadier hand on the bark. The combo meter banks 15 more stacks.',
        maxLevel: 3,
        baseCost: 7,
        costGrowth: 2.6,
        effects: [
          {
            kind: 'modifier',
            type: 'add',
            targetKind: 'tag',
            target: 'combo.cap',
            valuePerLevel: 15,
          },
        ],
      },
      {
        id: 'evergreen',
        name: 'Evergreen',
        glyph: '🌲',
        description: 'Nothing about this tree has an off season. +5% to all production.',
        maxLevel: 4,
        baseCost: 34,
        costGrowth: 2.8,
        effects: [{ kind: 'allProduction', mulPerLevel: 1.05 }],
      },
    ],
  },
] as const;

/** Every heirloom, flattened in branch order. */
export const HEIRLOOMS: readonly HeirloomDef[] = HEIRLOOM_BRANCHES.flatMap(
  (branch) => branch.nodes,
);

/** Lookup map from id → definition. */
export const HEIRLOOM_BY_ID: Readonly<Record<string, HeirloomDef>> = Object.fromEntries(
  HEIRLOOMS.map((def) => [def.id, def]),
);

/**
 * The branch each heirloom belongs to, and how deep along it it sits.
 *
 * Derived rather than restated on the definitions, so a node moved between
 * branches cannot end up claiming to be in two places at once.
 */
export const HEIRLOOM_PLACE: Readonly<
  Record<string, { readonly branchId: string; readonly depth: number }>
> = Object.fromEntries(
  HEIRLOOM_BRANCHES.flatMap((branch) =>
    branch.nodes.map((def, depth) => [def.id, { branchId: branch.id, depth }]),
  ),
);

/**
 * The heirloom that must be owned before `id` opens, or `null` for the first
 * node of a branch.
 */
export function heirloomPrerequisite(id: string): string | null {
  const place = HEIRLOOM_PLACE[id];
  if (!place || place.depth === 0) return null;

  const branch = HEIRLOOM_BRANCHES.find((b) => b.id === place.branchId);
  return branch?.nodes[place.depth - 1].id ?? null;
}
