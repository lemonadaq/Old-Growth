/** Cozy, warm botanical palette. Shared by the canvas renderer. */
export const PALETTE = {
  /** Sky gradient, top → horizon. */
  skyTop: '#8fc6e8',
  skyBottom: '#e7f0d8',
  /** Soil gradient, surface → deep. */
  soilTop: '#6b4a2b',
  soilBottom: '#2e1d10',
  /** Thin line where canopy air meets the ground. */
  horizon: '#c8b06a',
  /** Bark: trunk core, sunlit edge, and the thinner outer branches. */
  bark: '#6a4726',
  barkHighlight: '#8c6238',
  branch: '#7a5430',
  twig: '#8a6440',
  /** Canopy: leaf blobs, their shaded underside, and blossom petals. */
  leaf: '#6f9e4a',
  leafShade: '#4f7a35',
  leafHighlight: '#93bd63',
  /**
   * Colour an over-shaded cluster is dragged toward. Cool and dim: a leaf
   * starved of sun should read as *in shadow* at a glance, before the player has
   * ever opened its tooltip.
   */
  leafOccluded: '#2f4a26',
  blossom: '#f0b6cd',
  blossomCore: '#fff0d2',
  /**
   * The sky's own lights. The sun warms toward the horizon the way the sky
   * does; the moon carries a faint halo so it reads against deep night without
   * being bright enough to compete with the tree.
   */
  sunLow: '#ffb765',
  sunHigh: '#fff3c4',
  sunGlow: 'rgba(255, 226, 150, 0.42)',
  sunGlowEdge: 'rgba(255, 226, 150, 0)',
  moon: '#f2f0e4',
  moonHalo: 'rgba(226, 232, 245, 0.12)',
  /**
   * Underground: roots are the same wood, desaturated by the earth — but kept
   * clearly lighter than the soil behind them, or they vanish into it.
   */
  root: '#a8875e',
  rootShade: '#7d6244',
  rootTip: '#d3bd99',
  /**
   * Underground detail. The band fills themselves are content (see
   * `src/content/soil.ts`); these are the lines and ore drawn over them.
   */
  stratumEdge: 'rgba(20, 14, 9, 0.35)',
  stratumLabel: 'rgba(253, 243, 224, 0.34)',
  /** Mineral pockets: the soft halo, the ore specks, and the specks' shadow. */
  veinGlow: 'rgba(214, 190, 126, 0.22)',
  vein: '#cbb478',
  veinCore: '#f2e4b6',
  /** Feedback: ordinary gain, critical gain, and the click ripple. */
  gain: '#fdf3e0',
  crit: '#ffcc4d',
  ripple: 'rgba(253, 243, 224, 0.85)',
  /** Combo meter track and fill. */
  comboTrack: 'rgba(28, 20, 12, 0.55)',
  comboFill: '#ffd27a',
  comboFull: '#ffcc4d',
  /** Radial grow menu. */
  menuBackdrop: 'rgba(28, 20, 12, 0.82)',
  menuBackdropDisabled: 'rgba(28, 20, 12, 0.55)',
  menuBorder: '#c8b06a',
  menuBorderHover: '#ffd27a',
  menuText: '#fdf3e0',
  menuTextDisabled: 'rgba(253, 243, 224, 0.45)',
  menuSpoke: 'rgba(200, 176, 106, 0.5)',
  menuAnchor: 'rgba(255, 210, 122, 0.9)',
  /** Translucent preview of a part that has not been bought yet. */
  ghost: 'rgba(253, 243, 224, 0.42)',
  ghostLeaf: 'rgba(147, 189, 99, 0.45)',
  /**
   * Prune mode. The doomed subtree is washed in red and outlined in a brighter
   * red — deliberately the only red in the game, so "this is about to be cut"
   * cannot be confused with anything else on the canvas.
   */
  pruneMark: 'rgba(214, 88, 74, 0.5)',
  pruneEdge: '#ff8a72',
  prunePanel: 'rgba(58, 18, 14, 0.92)',
  pruneText: '#ffe2d8',
  /**
   * Graft mode. Green for a join that works, red for one that does not — the
   * only other coloured overlay on the canvas, and deliberately not prune's red
   * wash: cutting and joining must never look alike.
   */
  graftMark: '#8fd694',
  graftRefused: 'rgba(214, 88, 74, 0.75)',
  graftPanel: 'rgba(20, 40, 24, 0.92)',
  /** Confetti thrown by a first-time hybrid discovery. */
  confetti: ['#ffd27a', '#8fd694', '#f0b6cd', '#fdf3e0', '#6fb7e0'] as readonly string[],
  /**
   * The creatures. Each is drawn in two or three flat colours and nothing else:
   * they are a few pixels across at any sane zoom, and detail at that size reads
   * as noise. What has to survive is the *silhouette* — a bee is a striped dot
   * with wings, a bird is a body and a beak — plus enough contrast against the
   * wood or sky behind it.
   */
  bee: '#f2c341',
  beeStripe: '#3c2a12',
  beeWing: 'rgba(253, 243, 224, 0.55)',
  ant: '#3a2416',
  antTrail: 'rgba(58, 36, 22, 0.35)',
  /**
   * The fungal web. Violet rather than pale, and deliberately so: a light sheath
   * around a root bleaches it into a bare stick against the brown, while a
   * violet one reads as *something growing on it*.
   */
  mycelium: 'rgba(203, 160, 233, 0.72)',
  myceliumGlow: 'rgba(138, 88, 190, 0.34)',
  myceliumSpore: '#e6d2f4',
  songbird: '#5aa7d6',
  songbirdBelly: '#f6e6c4',
  songbirdBeak: '#e0a458',
  squirrel: '#b5713a',
  squirrelBelly: '#e8cfa8',
  /** The ring that expands under a creature the moment it turns up. */
  arrivalRing: 'rgba(253, 243, 224, 0.8)',
  /** Deadwood, and the falling foliage a cut shakes loose. */
  deadwood: '#8a6a4a',
  leafFall: '#8aab55',
  leafFallDry: '#c08a3a',
  /**
   * Carved stumps. The cut face is pale heartwood with darker rings; the aura
   * colour of each recipe comes from the totem's own content definition, so a
   * new recipe never needs a palette edit.
   */
  stump: '#6b4a2c',
  stumpShade: '#4d3520',
  stumpFace: '#c9a878',
  stumpRing: 'rgba(77, 53, 32, 0.55)',
  /**
   * Distant hills. Two bands, far and near, and the colour each is dragged
   * toward once the sun is down. They are the ground the Old Growth forest will
   * eventually stand on, so they are deliberately flat and low-contrast — the
   * tree in front has to stay the thing you look at.
   */
  hillFar: '#9fb7a0',
  hillNear: '#7f9c7e',
  hillFarNight: '#2c3a4a',
  hillNearNight: '#232f3d',
  /**
   * The Old Growth forest. Only the counter has a colour of its own — every
   * silhouette is drawn in its own species' foliage, hazed toward `hillNear`, so
   * the grove is a *record* of what the player planted rather than a row of
   * identical marks.
   */
  /* Opaque, and faded with `globalAlpha` at the draw: it is cast over by the
     season like everything else on the ridge, and the blender parses hex and
     `rgb(...)` but not `rgba(...)`. */
  forestCount: '#fdf3e0',
  /**
   * Going to Seed. The seeds are deliberately the same warm gold a critical tap
   * throws: the ceremony is the biggest payout in the game, and it should read as
   * one. The dim is near-black rather than a colour — the world is not turning
   * a shade, it is going quiet.
   */
  ceremonyDim: 'rgba(10, 8, 6, 0.55)',
  ceremonySeed: '#ffd27a',
  ceremonyGlow: 'rgba(255, 226, 150, 0.45)',
  ceremonyGlowEdge: 'rgba(255, 226, 150, 0)',
  ceremonyTrailEnd: 'rgba(255, 210, 122, 0)',
  /**
   * Weather. Rain is drawn as pale streaks rather than blue ones — a blue line
   * over a blue sky is a line nobody sees — and the storm's flash is white light
   * thrown over the whole canvas for a few frames.
   */
  raindrop: 'rgba(226, 240, 248, 0.55)',
  raindropBright: 'rgba(255, 255, 255, 0.75)',
  stormShade: 'rgba(24, 28, 40, 0.34)',
  stormFlash: 'rgba(233, 240, 255, 0.5)',
  droughtHaze: 'rgba(238, 220, 170, 0.3)',
  /**
   * The brace anchor: a ring at the base of the trunk that flashes for the
   * fifteen seconds of a storm and fills as it is hammered.
   */
  anchor: 'rgba(28, 20, 12, 0.72)',
  anchorRing: '#ffd27a',
  anchorFill: '#8fd694',
  anchorText: '#fdf3e0',
  /**
   * Leaf litter: a heap of dry foliage at the base, and the pale rim that lifts
   * it off the soil it is lying on.
   */
  litter: '#c08a3a',
  litterDark: '#96682a',
  litterRim: 'rgba(253, 243, 224, 0.35)',
} as const;

/** Fraction of the canvas height occupied by sky (above the soil line). */
export const HORIZON_RATIO = 0.62;

/** Sky gradient at one moment of the day. */
export interface SkyColors {
  readonly top: string;
  readonly bottom: string;
}

/**
 * Sky keyframes through one day, keyed by day fraction.
 *
 * Interpolating between these is what gives the sky its hour: the warm band low
 * on the horizon at dawn and dusk, the pale green-blue of midday, the cold near
 * blacks of deep night. The last entry repeats the first at `1` so the day
 * wraps without a seam at midnight.
 */
export const SKY_KEYFRAMES: readonly (SkyColors & { readonly at: number })[] = [
  { at: 0, top: '#2b3a63', bottom: '#8a6473' },
  { at: 0.1, top: '#7fb0d8', bottom: '#f6d9b0' },
  { at: 0.31, top: '#8fc6e8', bottom: '#e7f0d8' },
  { at: 0.52, top: '#83a9d0', bottom: '#f2c89a' },
  { at: 0.62, top: '#3a4a72', bottom: '#8a6a7a' },
  { at: 0.8, top: '#18213f', bottom: '#2c3352' },
  { at: 1, top: '#2b3a63', bottom: '#8a6473' },
] as const;
