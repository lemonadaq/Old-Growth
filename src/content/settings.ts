import { DEFAULT_VOLUME } from './audio';

/**
 * Player settings — the part of the save that is about the player rather than
 * about the tree.
 *
 * Still deliberately small. STEP 18 owns accessibility (font scale, colour-blind
 * patterns, an in-game reduced-motion override) and will add fields here. What
 * this file establishes is the *shape*: one strictly typed record, carried in the
 * save like everything else, read through {@link normaliseSettings} so a file
 * written before a field existed — or after one was removed — still loads.
 *
 * That last property is why STEP 16's three volumes needed no migration. A save
 * written in STEP 15, which knew only about `muted`, loads into a game with a
 * mixer: the volumes it does not mention come back as the defaults. A migration
 * is for a change that *breaks* an old file, and adding a defaulted field does
 * not.
 *
 * Reduced motion is deliberately **not** here. It is read from the operating
 * system through `prefers-reduced-motion`, which the player has already set once
 * for everything they own; asking them to set it again per-game — and then
 * carrying that answer in a save file that moves between devices — would be
 * worse than honouring the answer they already gave.
 */

/** Everything the player has chosen about how the game behaves. */
export interface GameSettings {
  /** Silence everything. Mirrors the mute control in Settings and the M hotkey. */
  readonly muted: boolean;
  /** Overall level, `[0, 1]`. */
  readonly masterVolume: number;
  /** The ambient season pad, as a fraction of master. */
  readonly musicVolume: number;
  /** Cues and weather loops, as a fraction of master. */
  readonly sfxVolume: number;
  /**
   * Contextual hints the player has already been shown.
   *
   * Here rather than in the game state because a hint is about the *player*, not
   * about the tree: someone who has been told what the scissors do has been told,
   * and going to seed does not un-tell them. It is the one part of progression
   * that deliberately outlives a run — see `Simulation.commitPrestige`, which
   * carries the settings across.
   *
   * Ids are kept as written even when the game no longer has a hint by that name:
   * a save that travels back to an older build should not start re-explaining
   * things, and an unknown id costs a string.
   */
  readonly seenHints: readonly string[];
  /**
   * Text scale, as a multiplier in `[0.9, 1.3]`.
   *
   * A game read on a phone at arm's length and on a monitor at a desk cannot
   * have one right font size. Applied as a CSS custom property on the root, so
   * every panel scales from one number and nothing has to be re-measured.
   */
  readonly fontScale: number;
  /**
   * Draw a pattern on each leaf cluster as well as colouring it.
   *
   * The species palettes are chosen to stay distinguishable under the common
   * colour-blindness simulations, but "distinguishable to most people" is not
   * the same as "readable by everyone", and a canopy is exactly the case where
   * hue is doing all the work. A pattern is a second channel that costs nothing
   * to anyone who does not need it.
   */
  readonly leafPatterns: boolean;
  /**
   * Keep a hint on screen until it is dismissed, rather than fading it.
   *
   * A timed bubble is a reading-speed test. This is the setting that turns it
   * off, and it belongs next to text size rather than in an accessibility
   * ghetto — plenty of people who want it would never look under that heading.
   */
  readonly hintsStay: boolean;
}

/** What a fresh save starts with. */
export const DEFAULT_SETTINGS: GameSettings = {
  muted: false,
  masterVolume: DEFAULT_VOLUME,
  musicVolume: DEFAULT_VOLUME,
  sfxVolume: DEFAULT_VOLUME,
  seenHints: [],
  fontScale: 1,
  leafPatterns: false,
  hintsStay: false,
};

/** The text-scale range the slider offers, as multipliers. */
export const FONT_SCALE_MIN = 0.9;
export const FONT_SCALE_MAX = 1.3;
/** One notch of the text-size slider. Coarse enough to land on a phone. */
export const FONT_SCALE_STEP = 0.05;

/** A volume read out of a save: clamped, and defaulted if it is not a number. */
function volume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/** A text scale read out of a save, clamped to what the slider can offer. */
export function clampFontScale(value: unknown, fallback = 1): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));
}

/**
 * Read a settings block out of unknown JSON, field by field.
 *
 * Anything missing or of the wrong type falls back to its default rather than
 * failing the load: settings are preferences, and losing the whole save because
 * a boolean arrived as a string would be a poor trade. Volumes are clamped as
 * well as defaulted — a hand-edited save asking for `masterVolume: 40` is a
 * request to blow the player's ears off, and the answer is 1.
 */
export function normaliseSettings(value: unknown): GameSettings {
  const raw = (value ?? {}) as Partial<Record<keyof GameSettings, unknown>>;
  return {
    muted: typeof raw.muted === 'boolean' ? raw.muted : DEFAULT_SETTINGS.muted,
    masterVolume: volume(raw.masterVolume, DEFAULT_SETTINGS.masterVolume),
    musicVolume: volume(raw.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: volume(raw.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    fontScale: clampFontScale(raw.fontScale, DEFAULT_SETTINGS.fontScale),
    leafPatterns:
      typeof raw.leafPatterns === 'boolean' ? raw.leafPatterns : DEFAULT_SETTINGS.leafPatterns,
    hintsStay: typeof raw.hintsStay === 'boolean' ? raw.hintsStay : DEFAULT_SETTINGS.hintsStay,
    // Duplicates are dropped rather than trusted: the list is only ever asked
    // "has this been seen", and a file that grew the same id a thousand times
    // through some future bug should not turn that question into a scan.
    seenHints: Array.isArray(raw.seenHints)
      ? [...new Set(raw.seenHints.filter((id): id is string => typeof id === 'string'))]
      : [...DEFAULT_SETTINGS.seenHints],
  };
}
