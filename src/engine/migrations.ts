import { SAVE_VERSION } from '../content/save';
import type { SaveEnvelope } from './save';

/**
 * The migration registry: how a file written by an older build becomes one this
 * build can read.
 *
 * An **ordered list of one-version steps**, each knowing only how to get from
 * the version it names to the next one. A save three versions behind is walked
 * forward three times rather than jumped, so every step stays a small readable
 * function about one change — and a step written today never has to be revisited
 * when a later one is added.
 *
 * The registry is deliberately empty at `1.0`, and that is the point: the
 * machinery is here, tested, and running on every load *before* the first
 * breaking change rather than after it. Adding a migration is appending one
 * entry and bumping {@link SAVE_VERSION}.
 *
 * Rules a step must keep:
 *
 * - **Pure.** It takes data and returns data; it never touches storage.
 * - **Total.** It is handed whatever was in the file, including nonsense, and
 *   must not throw. `restoreState` reads defensively after it, so a step only
 *   needs to move the shape, not to validate it.
 * - **Forward only.** There is no down-migration. A player who opens an old
 *   build with a new save is told the save is too new (see {@link migrateSave}),
 *   which is honest and recoverable; a lossy down-conversion is neither.
 */

/** One step from `from` to `to`. */
export interface Migration {
  /** The version this step reads. */
  readonly from: string;
  /** The version it produces. */
  readonly to: string;
  /** One line for the log and for the tests to read back. */
  readonly summary: string;
  /** Reshape the data. Must not throw, whatever it is handed. */
  readonly migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Every migration, oldest first.
 *
 * Empty until the save format's first breaking change. See the module note for
 * why it exists anyway.
 */
export const MIGRATIONS: readonly Migration[] = [];

/** How a migration attempt ended. */
export type MigrationResult =
  | {
      readonly ok: true;
      readonly envelope: SaveEnvelope;
      /** Steps applied, in order. Empty when the save was already current. */
      readonly applied: readonly string[];
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Walk a save forward to {@link SAVE_VERSION}.
 *
 * Refuses two things and reports both plainly: a version newer than this build
 * knows (the player is on an old tab, and guessing at a format from the future
 * is how saves get eaten), and a version with no path forward (a file from a
 * branch that never shipped).
 *
 * The step budget is the registry's own length: a cycle in the table would
 * otherwise spin here rather than failing, and a table that can loop is a bug in
 * the table, not a condition to handle at runtime.
 */
export function migrateSave(envelope: SaveEnvelope): MigrationResult {
  if (envelope.version === SAVE_VERSION) {
    return { ok: true, envelope, applied: [] };
  }

  if (isNewerThanCurrent(envelope.version)) {
    return {
      ok: false,
      reason: `This save was written by a newer version of Old Growth (${envelope.version}). Update the game to open it.`,
    };
  }

  let version = envelope.version;
  let data = envelope.data as unknown as Record<string, unknown>;
  const applied: string[] = [];

  for (let step = 0; step <= MIGRATIONS.length; step += 1) {
    if (version === SAVE_VERSION) {
      return {
        ok: true,
        envelope: { ...envelope, version, data: data as never },
        applied,
      };
    }

    const migration = MIGRATIONS.find((entry) => entry.from === version);
    if (!migration) {
      return {
        ok: false,
        reason: `This save is version ${version}, which this build cannot read.`,
      };
    }

    data = migration.migrate(data);
    version = migration.to;
    applied.push(migration.summary);
  }

  return { ok: false, reason: 'The save could not be brought up to date.' };
}

/**
 * Whether `version` is ahead of what this build writes.
 *
 * Compared field by field as numbers, so `1.10` is correctly newer than `1.9` —
 * a string comparison would call it older, and would quietly try to migrate a
 * file from the future.
 */
export function isNewerThanCurrent(version: string): boolean {
  const theirs = version.split('.').map((part) => Number.parseInt(part, 10));
  const ours = SAVE_VERSION.split('.').map((part) => Number.parseInt(part, 10));

  for (let i = 0; i < Math.max(theirs.length, ours.length); i += 1) {
    const a = Number.isFinite(theirs[i]) ? theirs[i] : 0;
    const b = Number.isFinite(ours[i]) ? ours[i] : 0;
    if (a !== b) return a > b;
  }
  return false;
}
