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
  /** Feedback: ordinary gain, critical gain, and the click ripple. */
  gain: '#fdf3e0',
  crit: '#ffcc4d',
  ripple: 'rgba(253, 243, 224, 0.85)',
  /** Combo meter track and fill. */
  comboTrack: 'rgba(28, 20, 12, 0.55)',
  comboFill: '#ffd27a',
  comboFull: '#ffcc4d',
} as const;

/** Fraction of the canvas height occupied by sky (above the soil line). */
export const HORIZON_RATIO = 0.62;
