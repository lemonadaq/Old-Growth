import {
  DROUGHT_DURATION_SECONDS,
  DROUGHT_WATER_MULTIPLIER,
  RAIN_DURATION_SECONDS,
  RAIN_WATER_MULTIPLIER,
  STORM_DURATION_SECONDS,
} from './balance';
import type { EffectSpec } from './effects';
import { STRATA, stratumResourceTag, type StratumId } from './soil';

/**
 * Weather as data: three events that interrupt the season without replacing it.
 *
 * A season is a standing condition the player plans around. Weather is the
 * opposite — it arrives, it is loud, and it is over — so each event carries its
 * own duration, its own telegraph line, and its own colour for the sky to lean
 * toward while it runs.
 *
 * Two rules are declared here rather than lived in the scheduler:
 *
 * - **A storm is `onlineOnly`.** It is a minigame, and a minigame the player was
 *   not present for is just damage taken while the tab was shut. STEP 14's
 *   offline calculator will pass `allowStorm: false` and the storm simply never
 *   comes up in the draw.
 * - **A drought spares the deep roots.** Its modifiers name every layer *except*
 *   {@link DROUGHT_IMMUNE_STRATUM}, so a root that reached the rock keeps
 *   drawing — which turns STEP 7's depth decision into insurance.
 *
 * Layer note: content stays free of engine imports.
 */

/** Stable identifiers for weather events. */
export type WeatherId = 'rain' | 'storm' | 'drought';

/** The layer whose roots a drought cannot touch. */
export const DROUGHT_IMMUNE_STRATUM: StratumId = 'rock';

export interface WeatherDef {
  readonly id: WeatherId;
  readonly label: string;
  /** One glyph for the banner. */
  readonly glyph: string;
  /** One line of flavour. */
  readonly flavor: string;
  /** One line naming what it is doing to the numbers. */
  readonly effectLabel: string;
  /** What the sky says ten seconds before it lands. */
  readonly telegraph: string;
  readonly durationSeconds: number;
  /** Relative chance of being drawn when the scheduler picks the next event. */
  readonly weight: number;
  /** True for events that must never be scheduled while the player is away. */
  readonly onlineOnly: boolean;
  /** Accent colour: the banner's border, and what the sky leans toward. */
  readonly color: string;
  /** How far the sky is dragged toward `color` while it runs, in `[0, 1]`. */
  readonly skyStrength: number;
  readonly effects: readonly EffectSpec[];
}

/**
 * Water modifiers for a drought: one per layer that is *not* immune.
 *
 * Derived from the strata table rather than listed, so adding a layer to the
 * ground cannot quietly leave a hole in the weather.
 */
const droughtEffects: readonly EffectSpec[] = STRATA.filter(
  (stratum) => stratum.id !== DROUGHT_IMMUNE_STRATUM,
).map((stratum) => ({
  type: 'mul' as const,
  targetKind: 'tag' as const,
  target: stratumResourceTag(stratum.id, 'water'),
  value: DROUGHT_WATER_MULTIPLIER,
}));

/** The weather catalogue. */
export const WEATHERS: readonly WeatherDef[] = [
  {
    id: 'rain',
    label: 'Rain',
    glyph: '🌧️',
    flavor: 'Steady, unhurried rain. The whole tree drinks.',
    effectLabel: `Water ×${RAIN_WATER_MULTIPLIER}`,
    telegraph: 'The air goes soft — rain is coming.',
    durationSeconds: RAIN_DURATION_SECONDS,
    weight: 5,
    onlineOnly: false,
    color: '#6fb7e0',
    skyStrength: 0.34,
    effects: [
      { type: 'mul', targetKind: 'resource', target: 'water', value: RAIN_WATER_MULTIPLIER },
    ],
  },
  {
    id: 'storm',
    label: 'Storm',
    glyph: '⛈️',
    flavor: 'Wind with weight behind it. Hold the trunk and the wide limbs may hold too.',
    effectLabel: 'Brace, or lose a limb',
    telegraph: 'The light goes green — brace for a storm.',
    durationSeconds: STORM_DURATION_SECONDS,
    weight: 2,
    // A minigame nobody was there to play is not a minigame; see the module note.
    onlineOnly: true,
    color: '#5b6b8a',
    skyStrength: 0.55,
    // No modifiers on purpose: a storm does its damage to the *tree*, not to a
    // rate, and dressing that up as a multiplier would misrepresent it.
    effects: [],
  },
  {
    id: 'drought',
    label: 'Drought',
    glyph: '🌵',
    flavor: 'The topsoil cracks. Only the roots that went deep are still finding water.',
    effectLabel: `Water ×${DROUGHT_WATER_MULTIPLIER} above the rock`,
    telegraph: 'The sky whitens — a dry spell is setting in.',
    durationSeconds: DROUGHT_DURATION_SECONDS,
    weight: 3,
    onlineOnly: false,
    color: '#e8cf9a',
    skyStrength: 0.3,
    effects: droughtEffects,
  },
] as const;

/** Lookup map from id → definition. */
export const WEATHER_BY_ID: Readonly<Record<WeatherId, WeatherDef>> = Object.fromEntries(
  WEATHERS.map((w) => [w.id, w]),
) as Record<WeatherId, WeatherDef>;

/** Every weather id, in catalogue order. */
export const WEATHER_IDS: readonly WeatherId[] = WEATHERS.map((w) => w.id);
