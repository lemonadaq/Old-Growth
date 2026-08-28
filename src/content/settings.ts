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
}

/** What a fresh save starts with. */
export const DEFAULT_SETTINGS: GameSettings = {
  muted: false,
  masterVolume: DEFAULT_VOLUME,
  musicVolume: DEFAULT_VOLUME,
  sfxVolume: DEFAULT_VOLUME,
  seenHints: [],
};

/** A volume read out of a save: clamped, and defaulted if it is not a number. */
function volume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
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
    // Duplicates are dropped rather than trusted: the list is only ever asked
    // "has this been seen", and a file that grew the same id a thousand times
    // through some future bug should not turn that question into a scan.
    seenHints: Array.isArray(raw.seenHints)
      ? [...new Set(raw.seenHints.filter((id): id is string => typeof id === 'string'))]
      : [...DEFAULT_SETTINGS.seenHints],
  };
}
