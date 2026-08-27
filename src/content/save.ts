/**
 * Persistence constants.
 *
 * Everything here is a decision about *the file*, not about the game inside it:
 * where it lives, what it is called, how often it is written, and what a player
 * has to type before it is thrown away. Kept in `/src/content` with the rest of
 * the tunables so the engine reads them rather than owning them.
 */

/**
 * Version of the **save format**, not of the game.
 *
 * It moves when the shape of `SaveData` changes in a way an older file cannot
 * simply be read as — and every move is paired with a migration (see
 * `src/engine/migrations.ts`). It does not move because balance changed, or
 * because a new upgrade was added: unknown ids are already skipped on load, and
 * a version bump for every content edit would make the registry meaningless.
 */
export const SAVE_VERSION = '1.0';

/**
 * The build that wrote the file, recorded inside the data rather than in the
 * envelope.
 *
 * The envelope's `version` answers "can this be read"; this answers "what was
 * running when it was written", which is the question a bug report asks. Kept in
 * step with `package.json` by hand — a build-time define would drag Vite's
 * config into the engine's tests for a string.
 */
export const ENGINE_VERSION = '0.1.0';

/** localStorage key the live save is written to. */
export const SAVE_KEY = 'old-growth:save';

/**
 * localStorage key holding the previous save.
 *
 * The corruption guard: a save is only ever *replaced*, never edited in place,
 * so whatever is under this key parsed cleanly the last time it was the live
 * one. A file truncated by a tab dying mid-write costs the player one autosave
 * interval rather than the run.
 */
export const SAVE_BACKUP_KEY = 'old-growth:save.backup';

/** How often the game writes itself down while it is being played, in ms. */
export const AUTOSAVE_INTERVAL_MS = 30_000;

/**
 * What must be typed to confirm a hard reset.
 *
 * A word rather than a click, because this is the one button in the game that
 * cannot be undone by playing on — Go to Seed at least leaves a forest behind.
 */
export const HARD_RESET_PHRASE = 'UPROOT';

/**
 * Marker at the head of an exported save, naming how the rest is encoded.
 *
 * `OG1` is deflate-then-base64; `OG0` is base64 alone, which is what a browser
 * with no `CompressionStream` falls back to. Reading is driven by the marker, so
 * a file exported on a desktop still imports on an old phone.
 */
export const EXPORT_PREFIX_DEFLATE = 'OG1:';

/** @see EXPORT_PREFIX_DEFLATE */
export const EXPORT_PREFIX_PLAIN = 'OG0:';
