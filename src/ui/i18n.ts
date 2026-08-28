import en from '../content/i18n/en.json';

/**
 * The translation scaffold: every player-visible string in one place, reached
 * through one function.
 *
 * A Polish translation is planned and does not exist yet, so this could have
 * been a `TODO` and a thousand string literals. It is not, for a reason that has
 * nothing to do with translation: **a string table is a list of everything the
 * game says.** Reviewing tone, catching a sentence written for a developer, or
 * finding the four places that call the same thing three different names is a
 * one-file job now and a whole-codebase job later.
 *
 * The table is **flat**: one object of dotted keys, not a nest of objects. The
 * dots are part of the key rather than a path to walk, which means a key can
 * never be ambiguous with a branch above it, a missing string is one line in a
 * diff, and a translator sees the whole file as a list. It is imported directly,
 * so Vite inlines it into the bundle — no fetch, no loading state, and no frame
 * where the UI is rendered in keys.
 *
 * Adding a language later means a second file, a `Record<Locale, Table>` and a
 * setter; nothing above `t()` changes. That is the whole point of the seam.
 */

/** A flat table of dotted keys, as the JSON files are shaped. */
type Table = Readonly<Record<string, string>>;

/** Values interpolated into a string's `{placeholders}`. */
export type Vars = Readonly<Record<string, string | number>>;

const TABLE = en as Table;

/**
 * Look a key up in the table.
 *
 * Returns `undefined` rather than throwing on a miss: a missing string is a
 * content bug, and it must never be able to blank the screen the player is
 * looking at. {@link t} decides what to show instead.
 */
export function lookup(key: string, table: Table = TABLE): string | undefined {
  const text = table[key];
  return typeof text === 'string' ? text : undefined;
}

/**
 * Substitute `{name}` placeholders.
 *
 * A placeholder with no matching variable is left **as written** rather than
 * blanked. "Grow ({key})" with nothing to put in it reads as an obvious bug in
 * a screenshot; "Grow ()" reads as a design decision, and would ship.
 */
export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * The string for `key`, with `vars` filled in.
 *
 * A key that is not in the table falls back to **the key itself**. That is
 * deliberate: it is visible in the UI, greppable, and says exactly what is
 * missing — where an empty string would silently delete a label and a thrown
 * error would take the panel down with it.
 */
export function t(key: string, vars?: Vars): string {
  const text = lookup(key);
  return text === undefined ? key : interpolate(text, vars);
}

/**
 * Every key in the table.
 *
 * Exported for the tests — a second locale is checked against this list, so a
 * translation missing a line fails the build rather than showing a key to a
 * player.
 */
export function allKeys(table: Table = TABLE): string[] {
  return Object.keys(table);
}
