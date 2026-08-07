/**
 * The underground as data: what the soil is made of, how deep each layer runs,
 * and where minerals hide in it.
 *
 * ## Units
 *
 * Depth is quoted in **soil units**, a player-facing scale where the surface is
 * `0` and depth grows downward. The tree graph works in *canonical* units where
 * 1 ≈ a mature tree's height, so the two are related by
 * {@link SOIL_UNITS_PER_CANONICAL}: one canonical unit of root reaches 1000
 * soil units down. Keeping the readouts in soil units is what lets the strata
 * table read the way the design does — Topsoil `0…-300`, Clay `-300…-800` —
 * while all the geometry stays resolution-independent.
 */

/** Stable identifiers for the layers of soil, surface downward. */
export type StratumId = 'topsoil' | 'clay' | 'rock' | 'bedrock';

export interface Stratum {
  readonly id: StratumId;
  readonly label: string;
  /** One line of flavour + mechanics, shown in tooltips. */
  readonly description: string;
  /** Depth (soil units) where the band begins. The surface is 0. */
  readonly top: number;
  /** Depth where it ends. `Infinity` for the bottom-most band. */
  readonly bottom: number;
  /** Band fill at its top edge. */
  readonly colorTop: string;
  /** Band fill at its bottom edge, so each layer shades within itself. */
  readonly colorBottom: string;
  /**
   * Relative chance a mineral pocket is generated in this band. Clay and rock
   * carry most of the ore; topsoil is nearly picked clean and bedrock is too
   * hard to be worth much yet.
   */
  readonly veinWeight: number;
}

/** Soil units per canonical tree unit — see the module note on units. */
export const SOIL_UNITS_PER_CANONICAL = 1000;

/**
 * Root production is multiplied by `1 + depth / DEPTH_PRODUCTION_SCALE`, so a
 * root reaching the clay (500 soil units) draws twice what a surface root does.
 * Depth is where the payoff is, and it is what makes a long root chain worth
 * more than the same number of shallow stubs.
 */
export const DEPTH_PRODUCTION_SCALE = 500;

/** The soil column, surface downward. Contiguous: each band's top is the previous band's bottom. */
export const STRATA: readonly Stratum[] = [
  {
    id: 'topsoil',
    label: 'Topsoil',
    description: 'Dark crumbly earth, thick with old leaves. Easy digging, little in it.',
    top: 0,
    bottom: 300,
    colorTop: '#6b4a2b',
    colorBottom: '#553a22',
    veinWeight: 1,
  },
  {
    id: 'clay',
    label: 'Clay',
    description: 'Heavy red clay that holds water — and hides most of the mineral pockets.',
    top: 300,
    bottom: 800,
    colorTop: '#8a5a3a',
    colorBottom: '#6a4229',
    veinWeight: 4,
  },
  {
    id: 'rock',
    label: 'Rock',
    description: 'Fractured stone. Slow going for a root, but the veins here run rich.',
    top: 800,
    bottom: 1600,
    colorTop: '#565049',
    colorBottom: '#3d3833',
    veinWeight: 4,
  },
  {
    id: 'bedrock',
    label: 'Bedrock',
    description: 'The old floor of the world. Almost nothing gets through it.',
    top: 1600,
    bottom: Infinity,
    colorTop: '#2c2926',
    colorBottom: '#1a1817',
    veinWeight: 0.5,
  },
] as const;

/** Lookup map from id → stratum. */
export const STRATUM_BY_ID: Readonly<Record<StratumId, Stratum>> = Object.fromEntries(
  STRATA.map((s) => [s.id, s]),
) as Record<StratumId, Stratum>;

/** Seed behind the mineral vein layout. One world, one arrangement of ore. */
export const DEFAULT_SOIL_SEED = 19470322;

/** How many mineral pockets are scattered through the column. */
export const VEIN_COUNT = 24;

/** No pocket is generated below this depth — nothing can reach it yet. */
export const VEIN_MAX_DEPTH = 1800;

/** Half-width (canonical units) of the band veins are scattered across. */
export const VEIN_HALF_SPAN = 0.95;

/** Pocket radius range, in soil units. */
export const VEIN_RADIUS_MIN = 70;
export const VEIN_RADIUS_MAX = 180;

/**
 * Mineral yield multiplier for a root tip sitting in a pocket. A tip outside
 * every pocket finds nothing at all, so where a tip lands is the whole game.
 */
export const VEIN_RICHNESS_MIN = 1;
export const VEIN_RICHNESS_MAX = 2.2;
