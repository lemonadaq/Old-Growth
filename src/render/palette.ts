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
  blossom: '#f0b6cd',
  blossomCore: '#fff0d2',
  /**
   * Underground: roots are the same wood, desaturated by the earth — but kept
   * clearly lighter than the soil behind them, or they vanish into it.
   */
  root: '#a8875e',
  rootShade: '#7d6244',
  rootTip: '#d3bd99',
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
} as const;

/** Fraction of the canvas height occupied by sky (above the soil line). */
export const HORIZON_RATIO = 0.62;
