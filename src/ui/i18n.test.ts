import { describe, expect, it } from 'vitest';
import { allKeys, interpolate, lookup, t } from './i18n';

/**
 * Every source file, as text.
 *
 * Read through Vite's glob rather than `node:fs` so the test needs no Node
 * types and no knowledge of where it is being run from — the same bundler that
 * builds the game resolves the paths.
 */
const SOURCES: Record<string, string> = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('lookup', () => {
  it('finds a string by its dot-path', () => {
    expect(lookup('app.title')).toBe('Old Growth');
  });

  it('returns undefined for a key that is not there', () => {
    expect(lookup('app.nonesuch')).toBeUndefined();
    expect(lookup('nonesuch.at.all')).toBeUndefined();
  });

  it('treats the dots as part of the key, not a path to walk', () => {
    // The table is flat: there is no `app` branch to stumble into, and no way
    // for a key to collide with a prefix of another one.
    expect(lookup('app')).toBeUndefined();
    expect(lookup('app.title.deeper')).toBeUndefined();
  });
});

describe('interpolate', () => {
  it('fills a placeholder', () => {
    expect(interpolate('Grow ({key})', { key: 'G' })).toBe('Grow (G)');
  });

  it('fills every occurrence and every name', () => {
    expect(interpolate('{a} and {b} and {a}', { a: 'one', b: 'two' })).toBe('one and two and one');
  });

  it('takes numbers as readily as strings', () => {
    expect(interpolate('{n} parts', { n: 12 })).toBe('12 parts');
  });

  it('leaves an unfilled placeholder visibly unfilled', () => {
    // "Grow ()" would ship; "Grow ({key})" is obviously a bug in a screenshot.
    expect(interpolate('Grow ({key})', {})).toBe('Grow ({key})');
  });

  it('leaves text alone when there is nothing to fill', () => {
    expect(interpolate('Old Growth')).toBe('Old Growth');
  });
});

describe('t', () => {
  it('reads and fills in one call', () => {
    expect(t('hud.perSecond', { rate: '4.2' })).toBe('4.2/s');
  });

  it('falls back to the key itself, which is visible and greppable', () => {
    expect(t('dock.nonesuch')).toBe('dock.nonesuch');
  });
});

describe('the table', () => {
  const keys = allKeys();

  it('has every string the UI asks for', () => {
    expect(keys.length).toBeGreaterThan(100);
  });

  it('has no duplicate paths', () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no empty strings', () => {
    // An empty string renders as a control with no label, which is worse than a
    // wrong label: there is nothing on screen to report.
    for (const key of keys) {
      expect(lookup(key), `${key} is empty`).not.toBe('');
    }
  });

  it('never leaves a placeholder that no caller could fill', () => {
    // A `{name}` in the table is a promise that some call site passes `name`.
    // This does not check the call sites — it checks the placeholders are
    // well-formed, so a typo like `{ key}` fails here rather than on screen.
    for (const key of keys) {
      const text = lookup(key) as string;
      for (const match of text.matchAll(/\{([^}]*)\}/g)) {
        expect(match[1], `${key} has a malformed placeholder`).toMatch(/^\w+$/);
      }
    }
  });
});

/**
 * The other half of "hardcode nothing new" (STEP 18): a key that is used but
 * not defined ships the raw dot-path to the player, and a key that is defined
 * but not used is dead weight a translator will still be asked to translate.
 * Both are cheap to catch here and expensive to notice by eye.
 */
describe('the table matches the code that uses it', () => {
  /**
   * Every key literal the source mentions.
   *
   * Deliberately not scoped to `t(...)` call sites: a key is just as used when
   * it arrives through a map of panel titles or a conditional
   * (`t(ok ? 'a.yes' : 'a.no')`), and a scanner that only recognised the
   * simplest call shape would report those as dead. Any quoted string that
   * happens to be a key in the table counts.
   *
   * Keys assembled from a template (`t(`hydration.${mood}`)`) cannot be seen
   * this way at all, so they are listed below rather than pretended to be
   * found.
   */
  const USED = new Set<string>();
  for (const [path, text] of Object.entries(SOURCES)) {
    if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue;
    for (const match of text.matchAll(/'([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)'/g)) {
      if (lookup(match[1]) !== undefined) USED.add(match[1]);
    }
  }

  /** Prefixes whose keys are chosen at runtime, and so cannot be scanned for. */
  const DYNAMIC = [
    'hydration.parched',
    'hydration.thirsty',
    'hydration.steady',
    'hydration.overcharged',
  ];

  it('defines every key the code asks for', () => {
    const missing = [...USED].filter((key) => lookup(key) === undefined);
    expect(missing).toEqual([]);
  });

  it('has no keys nothing uses', () => {
    const unused = allKeys().filter((key) => !USED.has(key) && !DYNAMIC.includes(key));
    expect(unused).toEqual([]);
  });
});
