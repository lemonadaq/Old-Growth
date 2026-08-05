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
} as const;

/** Fraction of the canvas height occupied by sky (above the soil line). */
export const HORIZON_RATIO = 0.62;
