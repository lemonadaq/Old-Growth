import type { SpeciesPalette, SpeciesTrait } from './species';

/**
 * Grafting: the fifteen hybrids.
 *
 * Two established limbs of different species, joined at the fork they already
 * share, become one limb of something else. The table is **deterministic and
 * complete** — every unordered pair of the six base species has exactly one
 * entry, so a graft is a discovery rather than a gamble, and a player who has
 * seen a hybrid once can plan for it.
 *
 * Hybrid traits are always **local**: they apply to the limb that carries them
 * and nothing else. That is the whole appeal of grafting — a limb worth reaching
 * for, rather than another global percentage. The engine enforces it (a hybrid
 * declaring a `tree`-scoped trait is a bug, and a test says so).
 *
 * Layer note: content stays free of engine imports.
 */

/**
 * What a graft costs, and how fast the next one escalates. Both live in
 * `./balance` with the rest of the tuning; re-exported here so the hybrid table
 * still reads as one page.
 */
export { GRAFT_BASE_COST, GRAFT_COST_GROWTH } from './balance';

/**
 * Children a branch must already carry to count as mature enough to graft.
 *
 * A graft joins two *established* limbs. A bare stub bought a second ago has not
 * earned the word, and letting it qualify would turn grafting into "buy two
 * branches, press the button" — no placement, no patience, no decision.
 */
export const GRAFT_MIN_CHILDREN = 1;

export interface HybridDef {
  readonly id: string;
  readonly name: string;
  readonly glyph: string;
  /** The two base species that make it, in catalogue order. */
  readonly parents: readonly [string, string];
  readonly flavor: string;
  /** Shown in the Journal while the hybrid is still a silhouette. */
  readonly hint: string;
  readonly palette: SpeciesPalette;
  /** Price multiplier for parts grown on a limb of this hybrid. */
  readonly costMultiplier: number;
  readonly traits: readonly SpeciesTrait[];
}

/** Stable key for an unordered species pair. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

const OAK_WOOD = { bark: '#6a4726', barkHighlight: '#8c6238', branch: '#7a5430', twig: '#8a6440' };
const PALE_WOOD = { bark: '#c8c0af', barkHighlight: '#eae4d6', branch: '#b3aa97', twig: '#9c9280' };
const DARK_WOOD = { bark: '#4c3826', barkHighlight: '#6b5138', branch: '#584129', twig: '#6b5137' };
const ROSE_WOOD = { bark: '#6b4048', barkHighlight: '#8d5a63', branch: '#7a4a53', twig: '#8f5b64' };
const GREY_WOOD = { bark: '#7d6b4a', barkHighlight: '#9d8a63', branch: '#8b7a56', twig: '#9b8c66' };

/** Build a palette from a wood set plus the foliage that distinguishes it. */
function palette(
  wood: Pick<SpeciesPalette, 'bark' | 'barkHighlight' | 'branch' | 'twig'>,
  leaf: string,
  leafShade: string,
  leafHighlight: string,
  blossom: string,
  root = '#a8875e',
  rootTip = '#d3bd99',
): SpeciesPalette {
  return {
    ...wood,
    leaf,
    leafShade,
    leafHighlight,
    blossom,
    blossomCore: '#fff4e2',
    root,
    rootTip,
  };
}

/**
 * The table. Fifteen pairs, fifteen distinct effects.
 *
 * Every entry does something no other entry does — a Water limb, a Light limb, a
 * crit limb, a cheap limb — so discovering one changes what the next limb is
 * *for*. First-pass numbers; STEP 19 owns real balance.
 */
export const HYBRIDS: readonly HybridDef[] = [
  {
    id: 'riverbind',
    name: 'Riverbind',
    glyph: '🪢',
    parents: ['oak', 'willow'],
    flavor: 'Oak patience wrapped around a willow’s nose for water. It never goes thirsty.',
    hint: 'Patience, joined to something that always knows where the water is.',
    palette: palette(GREY_WOOD, '#8fb063', '#68884a', '#b2cd88', '#e0dba4', '#9c8a68', '#cdbf9c'),
    costMultiplier: 1,
    traits: [
      {
        label: 'This limb draws 60% more Water.',
        target: { kind: 'ownProduction', resource: 'water' },
        type: 'mul',
        value: 1.6,
      },
    ],
  },
  {
    id: 'ironneedle',
    name: 'Ironneedle',
    glyph: '⚙️',
    parents: ['oak', 'pine'],
    flavor: 'Heartwood with needles in it. Nothing spectacular, everything reliable.',
    hint: 'Something that keeps working in weather that stops everything else.',
    palette: palette(DARK_WOOD, '#4c8560', '#356248', '#6da684', '#cfd8bc'),
    costMultiplier: 1,
    traits: [
      {
        label: 'Everything this limb makes, +30%.',
        target: { kind: 'ownProduction' },
        type: 'mul',
        value: 1.3,
      },
    ],
  },
  {
    id: 'ironblossom',
    name: 'Ironblossom',
    glyph: '⚔️',
    parents: ['oak', 'cherry'],
    flavor: 'Flowers on wood hard enough to blunt an axe. Tapping it rings.',
    hint: 'Hard wood that somehow still flowers.',
    palette: palette(OAK_WOOD, '#7f9e52', '#5d7a3a', '#a4c47a', '#f0b6cd'),
    costMultiplier: 1,
    traits: [
      {
        label: 'Critical taps on this limb hit for ×1.5 as much.',
        target: { kind: 'ownLimbClick', stat: 'click.critMult' },
        type: 'mul',
        value: 1.5,
      },
    ],
  },
  {
    id: 'ghostwood',
    name: 'Ghostwood',
    glyph: '👻',
    parents: ['oak', 'birch'],
    flavor: 'Pale as birch, built like oak. Grows almost as cheaply as it looks.',
    hint: 'Pale bark on something that has no business being that strong.',
    palette: palette(PALE_WOOD, '#8fae5a', '#6b8a42', '#b5cf88', '#efe6c8', '#c0b49c', '#e3dac6'),
    costMultiplier: 0.8,
    traits: [
      {
        label: 'Parts on this limb cost 20% less.',
        target: { kind: 'price' },
        type: 'mul',
        value: 0.8,
      },
      {
        label: 'Everything this limb makes, +20%.',
        target: { kind: 'ownProduction' },
        type: 'mul',
        value: 1.2,
      },
    ],
  },
  {
    id: 'sugarheart',
    name: 'Sugarheart',
    glyph: '🍯',
    parents: ['oak', 'maple'],
    flavor: 'The sap runs thick enough to eat. Every autumn it buries its own feet.',
    hint: 'Sap you could pour on breakfast.',
    palette: palette(OAK_WOOD, '#c98a44', '#9a5f2c', '#e5a868', '#f3c07a'),
    costMultiplier: 1,
    traits: [
      {
        label: 'This limb gathers 40% more Light.',
        target: { kind: 'ownProduction', resource: 'light' },
        type: 'mul',
        value: 1.4,
      },
      {
        label: 'And sheds triple Leaf Litter each autumn.',
        target: { kind: 'ownProduction', resource: 'leafLitter' },
        type: 'mul',
        value: 3,
        dormant: true,
      },
    ],
  },
  {
    id: 'fogpine',
    name: 'Fogpine',
    glyph: '🌫️',
    parents: ['willow', 'pine'],
    flavor: 'Needles that comb water out of the air. It is damp under one all summer.',
    hint: 'Needles that drink.',
    palette: palette(GREY_WOOD, '#5c8f6c', '#3f6b4e', '#84ad91', '#dce6cf', '#9c8a68', '#cdbf9c'),
    costMultiplier: 1,
    traits: [
      {
        label: 'This limb draws 35% more Water.',
        target: { kind: 'ownProduction', resource: 'water' },
        type: 'mul',
        value: 1.35,
      },
      {
        label: 'And gathers 15% more Light.',
        target: { kind: 'ownProduction', resource: 'light' },
        type: 'mul',
        value: 1.15,
      },
    ],
  },
  {
    id: 'weeping-cherry',
    name: 'Weeping Cherry',
    glyph: '💗',
    parents: ['willow', 'cherry'],
    flavor: 'It flowers hanging down, which everyone agrees is showing off.',
    hint: 'Flowers that fall toward you instead of away.',
    palette: palette(ROSE_WOOD, '#9ab86a', '#748f4a', '#bcd694', '#f5c3d6'),
    costMultiplier: 1,
    traits: [
      {
        label: 'This limb gathers 30% more Light.',
        target: { kind: 'ownProduction', resource: 'light' },
        type: 'mul',
        value: 1.3,
      },
      {
        label: 'Taps on it crit 3% more often.',
        target: { kind: 'ownLimbClick', stat: 'click.critChance' },
        type: 'add',
        value: 0.03,
      },
    ],
  },
  {
    id: 'whipbirch',
    name: 'Whipbirch',
    glyph: '🎋',
    parents: ['willow', 'birch'],
    flavor: 'Grows faster than you can decide where to put it.',
    hint: 'Cheap, fast, and slightly out of control.',
    palette: palette(PALE_WOOD, '#a6c66e', '#7e9c4c', '#c8dd9a', '#efe6c8', '#c0b49c', '#e3dac6'),
    costMultiplier: 0.55,
    traits: [
      {
        label: 'Parts on this limb cost 45% less.',
        target: { kind: 'price' },
        type: 'mul',
        value: 0.55,
      },
      {
        label: 'This limb draws 15% more Water.',
        target: { kind: 'ownProduction', resource: 'water' },
        type: 'mul',
        value: 1.15,
      },
    ],
  },
  {
    id: 'marshmaple',
    name: 'Marshmaple',
    glyph: '🍂',
    parents: ['willow', 'maple'],
    flavor: 'Stands in the wet with its feet spread and its colour up.',
    hint: 'Autumn colour, standing in water.',
    palette: palette(GREY_WOOD, '#bd7b48', '#8e5530', '#dda06a', '#e9d8a0', '#9c8a68', '#cdbf9c'),
    costMultiplier: 1,
    traits: [
      {
        label: 'This limb draws 25% more Water.',
        target: { kind: 'ownProduction', resource: 'water' },
        type: 'mul',
        value: 1.25,
      },
      {
        label: 'And gathers 25% more Light.',
        target: { kind: 'ownProduction', resource: 'light' },
        type: 'mul',
        value: 1.25,
      },
    ],
  },
  {
    id: 'frostbloom',
    name: 'Frostbloom',
    glyph: '❄️',
    parents: ['pine', 'cherry'],
    flavor: 'Flowers in the cold, out of sheer contrariness.',
    hint: 'A flower that opens when it should not.',
    palette: palette(DARK_WOOD, '#6f9a86', '#4d7364', '#9dc0b0', '#e8dff0'),
    costMultiplier: 1,
    traits: [
      {
        label: 'Critical taps on this limb hit for ×1.3 as much.',
        target: { kind: 'ownLimbClick', stat: 'click.critMult' },
        type: 'mul',
        value: 1.3,
      },
      {
        label: 'Winter costs this limb 70% less.',
        target: { kind: 'ownTag', tag: 'season.winter.penalty' },
        type: 'mul',
        value: 0.3,
        dormant: true,
      },
    ],
  },
  {
    id: 'snowbirch',
    name: 'Snowbirch',
    glyph: '🌨️',
    parents: ['pine', 'birch'],
    flavor: 'White on white. You lose it against the sky in December.',
    hint: 'You would lose it in a snowstorm.',
    palette: palette(PALE_WOOD, '#78a382', '#587f61', '#a2c4a8', '#eef0e4', '#c0b49c', '#e3dac6'),
    costMultiplier: 0.8,
    traits: [
      {
        label: 'Parts on this limb cost 20% less.',
        target: { kind: 'price' },
        type: 'mul',
        value: 0.8,
      },
      {
        label: 'Everything this limb makes, +15%.',
        target: { kind: 'ownProduction' },
        type: 'mul',
        value: 1.15,
      },
    ],
  },
  {
    id: 'resinmaple',
    name: 'Resinmaple',
    glyph: '🔥',
    parents: ['pine', 'maple'],
    flavor: 'Sticky, bright, and faintly flammable. The best light in the canopy.',
    hint: 'Bright enough to read by.',
    palette: palette(DARK_WOOD, '#d08a3e', '#a05c24', '#eaa863', '#f0c890'),
    costMultiplier: 1,
    traits: [
      {
        label: 'This limb gathers 45% more Light.',
        target: { kind: 'ownProduction', resource: 'light' },
        type: 'mul',
        value: 1.45,
      },
    ],
  },
  {
    id: 'paper-blossom',
    name: 'Paper Blossom',
    glyph: '📄',
    parents: ['cherry', 'birch'],
    flavor: 'Petals like tissue on bark like paper. Costs almost nothing to build.',
    hint: 'The cheapest beautiful thing on the tree.',
    palette: palette(PALE_WOOD, '#9cbb68', '#758f48', '#c0d894', '#f7cfdd', '#c0b49c', '#e3dac6'),
    costMultiplier: 0.55,
    traits: [
      {
        label: 'Parts on this limb cost 45% less.',
        target: { kind: 'price' },
        type: 'mul',
        value: 0.55,
      },
      {
        label: 'This limb gathers 10% more Light.',
        target: { kind: 'ownProduction', resource: 'light' },
        type: 'mul',
        value: 1.1,
      },
    ],
  },
  {
    id: 'candyflower',
    name: 'Candyflower',
    glyph: '🍬',
    parents: ['cherry', 'maple'],
    flavor: 'Sweet sap, loud flowers, no restraint whatsoever.',
    hint: 'Sugar and flowers, with no restraint at all.',
    palette: palette(ROSE_WOOD, '#d1874a', '#a35c2c', '#eda76a', '#f6b8d0'),
    costMultiplier: 1,
    traits: [
      {
        label: 'This limb gathers 30% more Light.',
        target: { kind: 'ownProduction', resource: 'light' },
        type: 'mul',
        value: 1.3,
      },
      {
        label: 'Taps on it crit 4% more often.',
        target: { kind: 'ownLimbClick', stat: 'click.critChance' },
        type: 'add',
        value: 0.04,
      },
    ],
  },
  {
    id: 'emberbirch',
    name: 'Emberbirch',
    glyph: '🕯️',
    parents: ['birch', 'maple'],
    flavor: 'Pale trunk, red canopy. It looks like it is burning from the top down.',
    hint: 'Pale below, burning above.',
    palette: palette(PALE_WOOD, '#cd7a3c', '#9d5426', '#e79d5e', '#f2d09a', '#c0b49c', '#e3dac6'),
    costMultiplier: 0.9,
    traits: [
      {
        label: 'This limb gathers 55% more Light.',
        target: { kind: 'ownProduction', resource: 'light' },
        type: 'mul',
        value: 1.55,
      },
      {
        label: 'Parts on this limb cost 10% less.',
        target: { kind: 'price' },
        type: 'mul',
        value: 0.9,
      },
    ],
  },
] as const;

/** Lookup map from hybrid id → definition. */
export const HYBRID_BY_ID: Readonly<Record<string, HybridDef>> = Object.fromEntries(
  HYBRIDS.map((h) => [h.id, h]),
);

/** The combo table: unordered parent pair → hybrid. */
export const HYBRID_BY_PAIR: Readonly<Record<string, HybridDef>> = Object.fromEntries(
  HYBRIDS.map((h) => [pairKey(h.parents[0], h.parents[1]), h]),
);

/** All hybrid ids in catalogue order. */
export const HYBRID_IDS: readonly string[] = HYBRIDS.map((h) => h.id);

/** The hybrid two species make, or `null` when the pair has no entry. */
export function hybridFor(a: string, b: string): HybridDef | null {
  if (a === b) return null;
  return HYBRID_BY_PAIR[pairKey(a, b)] ?? null;
}
