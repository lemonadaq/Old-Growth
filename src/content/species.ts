import type { TreeNodeType } from './growth';
import type { ResourceId } from './resources';

/**
 * The six base species.
 *
 * A species is what a part is *made of*: it decides the wood and leaf colours it
 * is drawn in, what it costs to grow, and what its production is worth. Oak is
 * the starter; the rest unlock against milestones defined here, and once two are
 * available the radial grow menu grows a species picker.
 *
 * Traits are declared **relative to the species** rather than as raw modifier
 * targets, because most of them are local: Willow's water bonus belongs to
 * willow roots, not to every root on the tree. `src/engine/species.ts` turns
 * these declarations into ordinary {@link Modifier}s — see
 * {@link SpeciesTraitTarget} for what each scope resolves to.
 *
 * Layer note: content stays free of engine imports. Click stat tags are mirrored
 * by value (`'click.critChance'`), exactly as `src/content/totems.ts` does.
 */

/** Click stats a species can move for taps landing on its own wood. */
export type ClickStatTag = 'click.power' | 'click.critChance' | 'click.critMult' | 'combo.cap';

/**
 * What a trait applies to.
 *
 * - `ownProduction` — the parts of this species, and only those. With a
 *   `resource`, only what they make *of* that resource; without one, everything
 *   they make. This is the local scope, and the one most traits want.
 * - `ownLimbClick` — taps landing on this species' wood. The tree knows which
 *   limb was struck, so a species can be worth tapping rather than worth owning.
 * - `tree` — the whole tree, **scaled by this species' share of it**. A ×1.15
 *   held by a third of the tree is worth ×1.05. Global traits have to be diluted
 *   or a single 8-Sap twig would buy a permanent bonus.
 * - `price` — no modifier at all. The trait is already realised by
 *   {@link SpeciesDef.costMultiplier} / {@link SpeciesDef.costByType}, because a
 *   purchase is priced before the part it buys exists. Listed so the Journal can
 *   show a species' price break alongside its other traits instead of hiding the
 *   most important thing about Birch in a number nothing reads out.
 */
export type SpeciesTraitTarget =
  | { readonly kind: 'ownProduction'; readonly resource?: ResourceId }
  | { readonly kind: 'ownLimbClick'; readonly stat: ClickStatTag }
  /**
   * Any tag, scoped to this species. The general form behind `ownLimbClick`, and
   * the one a *local* dormant trait wants: a limb that shrugs off winter is
   * asking for `season.winter.penalty` on its own wood and nowhere else.
   */
  | { readonly kind: 'ownTag'; readonly tag: string }
  | {
      readonly kind: 'tree';
      readonly targetKind: 'tag' | 'resource';
      readonly target: string;
    }
  | { readonly kind: 'price' };

export interface SpeciesTrait {
  /** One line for the Journal, written for a player. */
  readonly label: string;
  readonly target: SpeciesTraitTarget;
  /** `'add'` sums onto the base; `'mul'` multiplies it (1.2 = +20%). */
  readonly type: 'add' | 'mul';
  readonly value: number;
  /**
   * Set when the trait feeds a system that does not exist yet — seasons,
   * weather, leaf fall. It is still published; it simply matches nothing, so it
   * costs nothing and comes alive on its own the moment the system that owns its
   * target lands. The Journal shows these greyed, with what they are waiting for.
   */
  readonly dormant?: boolean;
}

/** How a species becomes available to plant. Evaluated by the engine. */
export type SpeciesUnlock =
  /** Available from the first tap. */
  | { readonly kind: 'starter' }
  /** Lifetime total of a resource, ever earned this run. */
  | { readonly kind: 'lifetime'; readonly resource: ResourceId; readonly amount: number }
  /** Parts grown, trunk excluded. */
  | { readonly kind: 'parts'; readonly count: number }
  /** Parts of one type currently on the tree. */
  | { readonly kind: 'partsOfType'; readonly type: TreeNodeType; readonly count: number }
  /** Limbs cut, lifetime. */
  | { readonly kind: 'prunes'; readonly count: number };

/**
 * The colours a species is drawn in.
 *
 * Every field is required: a species that inherited half its palette from the
 * shared one would read as a recolour of oak rather than as its own tree, and
 * the whole point of choosing one is that you can see what you chose.
 */
export interface SpeciesPalette {
  readonly bark: string;
  readonly barkHighlight: string;
  readonly branch: string;
  readonly twig: string;
  readonly leaf: string;
  readonly leafShade: string;
  readonly leafHighlight: string;
  readonly blossom: string;
  readonly blossomCore: string;
  readonly root: string;
  readonly rootTip: string;
}

/**
 * The mark drawn over a species' foliage when patterns are turned on.
 *
 * A second channel for identity, for anyone whose eyes do not separate the
 * greens this palette leans on — six species and four of them green is a
 * deliberate look, and it is exactly the look that fails under deuteranopia.
 *
 * Shapes rather than textures: a texture on a cluster ten pixels across is
 * noise. These six stay legible at that size and stay distinct from each other
 * in outline alone, which is the whole point — a player who cannot tell the
 * greens apart must be able to tell the marks apart.
 */
export type LeafPattern = 'dot' | 'ring' | 'bar' | 'stripe' | 'cross' | 'chevron';

export interface SpeciesDef {
  readonly id: string;
  readonly name: string;
  /** One glyph for the Journal card and the picker chip. */
  readonly glyph: string;
  /** Its mark under the patterns-on-leaves setting. Unique across species. */
  readonly leafPattern: LeafPattern;
  /** One line of flavour. */
  readonly flavor: string;
  readonly palette: SpeciesPalette;
  /** Blanket price multiplier on every part grown as this species. */
  readonly costMultiplier: number;
  /** Per-type price multipliers, applied on top of {@link costMultiplier}. */
  readonly costByType?: Readonly<Partial<Record<TreeNodeType, number>>>;
  readonly traits: readonly SpeciesTrait[];
  readonly unlock: SpeciesUnlock;
}

/** The species every tree starts as: the trunk, and anything grown before a choice. */
export const STARTER_SPECIES_ID = 'oak';

/** Prefix of the producer tag every part of a species carries. */
export const SPECIES_TAG_PREFIX = 'species:';

/**
 * The tag carried by every producer belonging to `speciesId`.
 *
 * Lives here rather than in the engine because it is *vocabulary*: the part
 * catalogue stamps it onto producers and the species catalogue targets it, and
 * neither may import the engine. The engine re-exports both helpers.
 */
export function speciesTag(speciesId: string): string {
  return `${SPECIES_TAG_PREFIX}${speciesId}`;
}

/**
 * The tag carried by a producer of `resource` belonging to `speciesId`.
 *
 * The two-part tag is what lets "willow's Water" exist as a target at all: a
 * modifier matches a producer by resource *or* by tag and never by both, so the
 * conjunction has to be baked into a tag name.
 */
export function speciesResourceTag(speciesId: string, resource: ResourceId): string {
  return `${speciesTag(speciesId)}/${resource}`;
}

/**
 * How many species must be available before the grow menu shows a picker.
 *
 * With one species there is no choice to make, and a picker offering it would be
 * a control that does nothing.
 */
export const PICKER_MIN_SPECIES = 2;

/**
 * The six.
 *
 * Each has one thing it is *for*, and they deliberately pull in different
 * directions: Oak rewards tapping, Willow and Maple each own half of the
 * economy, Pine is the modest all-rounder, Cherry is the gambler, Birch trades
 * output for volume. Numbers here are first-pass — STEP 19 owns real balance.
 */
export const SPECIES: readonly SpeciesDef[] = [
  {
    id: 'oak',
    name: 'Oak',
    glyph: '🌳',
    leafPattern: 'dot',
    flavor: 'Slow, broad and patient. Whole ecosystems have waited under one.',
    palette: {
      bark: '#6a4726',
      barkHighlight: '#8c6238',
      branch: '#7a5430',
      twig: '#8a6440',
      leaf: '#6f9e4a',
      leafShade: '#4f7a35',
      leafHighlight: '#93bd63',
      blossom: '#d9c98a',
      blossomCore: '#fff0d2',
      root: '#a8875e',
      rootTip: '#d3bd99',
    },
    costMultiplier: 1,
    traits: [
      {
        // Local, not tree-wide, and deliberately so. A new tree is *entirely*
        // oak, so a whole-tree version of this would be baked into the baseline
        // and would then read as a penalty for planting anything else: the
        // player's taps would quietly weaken as they diversified, with nothing
        // on screen explaining why. Scoped to oak wood it is a reason to keep
        // tapping the trunk instead of a tax on growing.
        label: 'Heartwood: taps on oak wood pay 15% more Sap.',
        target: { kind: 'ownLimbClick', stat: 'click.power' },
        type: 'mul',
        value: 1.15,
      },
      {
        label: 'Storm-fast: storms take half as much from an oak.',
        target: { kind: 'tree', targetKind: 'tag', target: 'weather.storm.damage' },
        type: 'mul',
        value: 0.5,
        dormant: true,
      },
    ],
    unlock: { kind: 'starter' },
  },
  {
    id: 'birch',
    name: 'Birch',
    glyph: '🪵',
    leafPattern: 'stripe',
    flavor: 'Paper bark and a short life. Birch grows first and grows fast.',
    palette: {
      bark: '#d8d2c4',
      barkHighlight: '#f2eee4',
      branch: '#c4bcab',
      twig: '#a89c88',
      leaf: '#9ec25c',
      leafShade: '#77974a',
      leafHighlight: '#c2dd85',
      blossom: '#efe6c8',
      blossomCore: '#fffaea',
      root: '#c0b49c',
      rootTip: '#e3dac6',
    },
    costMultiplier: 0.7,
    traits: [
      {
        label: 'Fast wood: every birch part costs 30% less.',
        target: { kind: 'price' },
        type: 'mul',
        value: 0.7,
      },
      {
        label: 'Thin wood: birch parts produce 15% less.',
        target: { kind: 'ownProduction' },
        type: 'mul',
        value: 0.85,
      },
    ],
    unlock: { kind: 'parts', count: 8 },
  },
  {
    id: 'willow',
    name: 'Willow',
    glyph: '🌾',
    leafPattern: 'bar',
    flavor: 'It finds water the way a rumour finds a village.',
    palette: {
      bark: '#7d6b4a',
      barkHighlight: '#9d8a63',
      branch: '#8b7a56',
      twig: '#9b8c66',
      // Pale and silvered rather than the yellow-green it started as: at that
      // value it sat within a couple of percent of birch's foliage in
      // lightness, which is the one channel a red-green deficiency leaves
      // intact — two of the six species were the same tree to those players.
      leaf: '#c3d9a0',
      leafShade: '#9dba76',
      leafHighlight: '#e0edc6',
      blossom: '#e8e2a8',
      blossomCore: '#fdf8d8',
      root: '#b09872',
      rootTip: '#ddccaa',
    },
    costMultiplier: 1,
    traits: [
      {
        label: 'Water-seeking: willow roots draw 50% more Water.',
        target: { kind: 'ownProduction', resource: 'water' },
        type: 'mul',
        value: 1.5,
      },
      {
        label: 'Deep-drinking: drought costs a willow half as much.',
        target: { kind: 'tree', targetKind: 'tag', target: 'weather.drought.penalty' },
        type: 'mul',
        value: 0.5,
        dormant: true,
      },
    ],
    unlock: { kind: 'lifetime', resource: 'water', amount: 40 },
  },
  {
    id: 'maple',
    name: 'Maple',
    glyph: '🍁',
    leafPattern: 'cross',
    flavor: 'Burns red for a fortnight each autumn, then gives the whole lot back to the soil.',
    palette: {
      bark: '#5f4632',
      barkHighlight: '#7f6248',
      branch: '#6f5238',
      twig: '#84644a',
      leaf: '#c1743a',
      leafShade: '#94522a',
      leafHighlight: '#e0975a',
      blossom: '#f3c07a',
      blossomCore: '#fff0d2',
      root: '#9b8060',
      rootTip: '#cdb692',
    },
    costMultiplier: 1,
    traits: [
      {
        label: 'Broad leaves: maple foliage gathers 25% more Light.',
        target: { kind: 'ownProduction', resource: 'light' },
        type: 'mul',
        value: 1.25,
      },
      {
        label: 'Autumn fall: a maple sheds twice the Leaf Litter.',
        target: { kind: 'ownProduction', resource: 'leafLitter' },
        type: 'mul',
        value: 2,
        dormant: true,
      },
    ],
    unlock: { kind: 'lifetime', resource: 'light', amount: 60 },
  },
  {
    id: 'pine',
    name: 'Pine',
    glyph: '🌲',
    leafPattern: 'chevron',
    flavor: 'Keeps its needles through the cold, and keeps working through it too.',
    palette: {
      bark: '#57402c',
      barkHighlight: '#75593d',
      branch: '#634a33',
      twig: '#75593f',
      leaf: '#3f7a55',
      leafShade: '#2c5b3e',
      leafHighlight: '#5d9a6f',
      blossom: '#c8b98a',
      blossomCore: '#f0ecd8',
      root: '#8f7a5c',
      rootTip: '#c3b294',
    },
    costMultiplier: 1,
    traits: [
      {
        label: 'Evergreen: everything a pine part makes, +12%.',
        target: { kind: 'ownProduction' },
        type: 'mul',
        value: 1.12,
      },
      {
        label: 'Hardy: winter costs a pine 60% less.',
        target: { kind: 'tree', targetKind: 'tag', target: 'season.winter.penalty' },
        type: 'mul',
        value: 0.4,
        dormant: true,
      },
    ],
    unlock: { kind: 'prunes', count: 3 },
  },
  {
    id: 'cherry',
    name: 'Cherry',
    glyph: '🌸',
    leafPattern: 'ring',
    flavor: 'Spends everything it has on two weeks of flower, and is right to.',
    palette: {
      bark: '#6b4048',
      barkHighlight: '#8d5a63',
      branch: '#7a4a53',
      twig: '#8f5b64',
      leaf: '#86a95a',
      leafShade: '#628040',
      leafHighlight: '#a8c87e',
      blossom: '#f0b6cd',
      blossomCore: '#fff0f4',
      root: '#a4816e',
      rootTip: '#d6bcae',
    },
    costMultiplier: 1,
    costByType: { blossom: 0.5 },
    traits: [
      {
        label: 'Free-flowering: blossoms cost half on cherry wood.',
        target: { kind: 'price' },
        type: 'mul',
        value: 0.5,
      },
      {
        label: 'Quick sap: taps on cherry wood crit 5% more often.',
        target: { kind: 'ownLimbClick', stat: 'click.critChance' },
        type: 'add',
        value: 0.05,
      },
    ],
    unlock: { kind: 'lifetime', resource: 'sap', amount: 750 },
  },
] as const;

/** Lookup map from id → definition. */
export const SPECIES_BY_ID: Readonly<Record<string, SpeciesDef>> = Object.fromEntries(
  SPECIES.map((s) => [s.id, s]),
);

/** All base species ids in catalogue order. */
export const SPECIES_IDS: readonly string[] = SPECIES.map((s) => s.id);
