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
   * Distant hills. Two bands, far and near, and the colour each is dragged
   * toward once the sun is down. They are the ground the Old Growth forest will
   * eventually stand on, so they are deliberately flat and low-contrast — the
   * tree in front has to stay the thing you look at.
   */
  hillFar: '#9fb7a0',
  hillNear: '#7f9c7e',
  hillFarNight: '#2c3a4a',
  hillNearNight: '#232f3d',
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
