#!/usr/bin/env node
/**
 * The engine holds no magic numbers.
 *
 * `/src/content/balance.ts` is the balance pass's desk: every cost, curve,
 * threshold, duration and cap is declared there and imported by whoever reads
 * it. That rule is only worth anything if something enforces it, because the
 * way a balance table rots is one plausible literal at a time — a `0.85` inside
 * a formula, a `3600` in a conversion, a `12` that turns out to be a price.
 *
 * So this walks `/src/engine` (tests excluded — a test asserting `expect(x).toBe(42)`
 * is exactly where a literal belongs) and fails on any numeric literal that is
 * neither structural nor in the allowlist beside this file.
 *
 * **Structural** means 0, 1 and 2: array indices, "is it empty", halves and
 * doubles. Nobody tunes those and naming them would make the code worse.
 *
 * **Allowlisted** means a number that is genuinely not a knob — the mulberry32
 * constants, the 1e3/1e6/1e9 tiers a K/M/B suffix is defined by, a `parseInt`
 * radix. Each entry carries a reason, and the allowlist is keyed by *value per
 * file* rather than by line, so ordinary edits never invalidate it but a new
 * value in a file does.
 *
 * Run directly (`npm run check:magic`) or through
 * `src/engine/magicNumbers.test.ts`, which is what puts it in CI.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_DIR = join(ROOT, 'src', 'engine');
const ALLOWLIST_PATH = join(ROOT, 'scripts', 'magic-numbers.allowlist.json');

/** Values every file may use without explanation. */
const STRUCTURAL = new Set(['0', '1', '2']);

/**
 * Blank out everything that is not code, in place, preserving newlines so line
 * numbers survive.
 *
 * A character-scanner rather than a set of regexes: `'it\'s'`, a `//` inside a
 * string and a `/* ` inside a template literal all break the regex version, and
 * the failure mode there is a checker that quietly stops seeing part of a file.
 */
function stripNonCode(source) {
  const out = [];
  let i = 0;
  const n = source.length;

  const keepNewlines = (text) => text.replace(/[^\n]/g, ' ');

  while (i < n) {
    const two = source.slice(i, i + 2);

    if (two === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out.push(keepNewlines(source.slice(i, stop)));
      i = stop;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out.push(keepNewlines(source.slice(i, stop)));
      i = stop;
      continue;
    }

    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === ch) break;
        j += 1;
      }
      const stop = Math.min(n, j + 1);
      out.push(keepNewlines(source.slice(i, stop)));
      i = stop;
      continue;
    }

    out.push(ch);
    i += 1;
  }

  return out.join('');
}

/**
 * Every numeric literal in one file, with the line it sits on.
 *
 * The lookbehind is what keeps `state.x2`, `Vec2` and `0x6d2b79f5`'s tail from
 * reading as literals: a digit preceded by a word character, a `$` or a dot is
 * part of an identifier or a number already being matched, not the start of one.
 */
function literalsIn(source) {
  const code = stripNonCode(source);
  const pattern = /(?<![\w$.])(0[xX][0-9a-fA-F]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][-+]?\d+)?)/g;
  const found = [];

  for (const match of code.matchAll(pattern)) {
    const line = code.slice(0, match.index).split('\n').length;
    found.push({ value: match[1], line });
  }
  return found;
}

/** Every non-test `.ts` file under `dir`, recursively, repo-relative and sorted. */
function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(relative(ROOT, full).split('\\').join('/'));
    }
  }
  return files.sort();
}

/**
 * Check the engine. Returns `{ offenders, stale }` rather than exiting, so the
 * test can assert on it and the CLI can print it.
 *
 * `stale` is the other half of the contract: an allowlist entry whose literal is
 * gone means somebody moved a number into `balance.ts` and left its excuse
 * behind. Reported, not fatal — a stale entry is untidy, a new literal is a bug.
 */
export function checkMagicNumbers() {
  const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  const offenders = [];
  const seen = new Map();

  for (const file of sourceFiles(ENGINE_DIR)) {
    const allowed = allowlist[file] ?? {};
    const used = new Set();

    for (const { value, line } of literalsIn(readFileSync(join(ROOT, file), 'utf8'))) {
      if (STRUCTURAL.has(value)) continue;
      if (value in allowed) {
        used.add(value);
        continue;
      }
      offenders.push({ file, line, value });
    }
    seen.set(file, used);
  }

  const stale = [];
  for (const [file, allowed] of Object.entries(allowlist)) {
    const used = seen.get(file);
    for (const value of Object.keys(allowed)) {
      if (!used || !used.has(value)) stale.push({ file, value });
    }
  }

  return { offenders, stale };
}

/* --------------------------------------------------------------------- cli */

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const { offenders, stale } = checkMagicNumbers();

  for (const { file, value } of stale) {
    console.warn(`stale allowlist entry: ${file} no longer uses ${value}`);
  }

  if (offenders.length === 0) {
    console.log('No magic numbers in /src/engine.');
    process.exit(0);
  }

  console.error(`\n${offenders.length} magic number(s) in /src/engine:\n`);
  for (const { file, line, value } of offenders) {
    console.error(`  ${file}:${line}  ${value}`);
  }
  console.error(
    '\nMove the value into src/content/balance.ts and import it, or — if it is not' +
      '\na knob anybody would turn — add it to scripts/magic-numbers.allowlist.json' +
      '\nwith a reason.\n',
  );
  process.exit(1);
}
