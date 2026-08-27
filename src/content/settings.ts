/**
 * Player settings — the part of the save that is about the player rather than
 * about the tree.
 *
 * Deliberately small. STEP 16 owns audio properly (master/music/SFX volumes over
 * an `AudioManager`) and STEP 18 owns accessibility (font scale, colour-blind
 * patterns, reduced motion), and both will add fields here. What this file
 * establishes now is the *shape*: one strictly typed record, carried in the save
 * like everything else, read through {@link normaliseSettings} so a file written
 * before a field existed — or after one was removed — still loads.
 *
 * The one setting that exists today is the one the game can actually honour
 * today: `muted` gates the placeholder SFX in `src/ui/sfx.ts`. A settings block
 * with nothing in it would be a promise rather than a feature.
 */

/** Everything the player has chosen about how the game behaves. */
export interface GameSettings {
  /** Silence every sound effect. Mirrors the mute control in Settings. */
  readonly muted: boolean;
}

/** What a fresh save starts with. */
export const DEFAULT_SETTINGS: GameSettings = {
  muted: false,
};

/**
 * Read a settings block out of unknown JSON, field by field.
 *
 * Anything missing or of the wrong type falls back to its default rather than
 * failing the load: settings are preferences, and losing the whole save because
 * a boolean arrived as a string would be a poor trade.
 */
export function normaliseSettings(value: unknown): GameSettings {
  const raw = (value ?? {}) as Partial<Record<keyof GameSettings, unknown>>;
  return {
    muted: typeof raw.muted === 'boolean' ? raw.muted : DEFAULT_SETTINGS.muted,
  };
}
