import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * The magic-number rule, run in CI.
 *
 * STEP 19's whole premise is that a designer can open one file and find every
 * number the game is made of. That only stays true if it is *checked*: the rule
 * would be broken within a week by an innocent-looking `* 0.75` in the middle of
 * a production formula, and nobody would notice until the next balance pass went
 * looking for a knob that was not there.
 *
 * `check-magic-numbers.mjs` walks `/src/engine` and fails on any numeric literal
 * that is neither structural (0, 1, 2, -1 and the like) nor listed in
 * `magic-numbers.allowlist.json` with a reason. This runs that script rather
 * than reimplementing it, so the test and the command can never disagree about
 * what the rule is.
 *
 * It lives here, in JavaScript, rather than in `/src/engine` beside the code it
 * guards: `tsc -b` type-checks `src` against the browser's lib and nothing else,
 * so a test that spawns a process would fail the production build for wanting
 * `node:child_process`. Vitest picks `scripts/**\/*.test.mjs` up by config.
 *
 * If this fails: move the number to `src/content/balance.ts` and import it, or —
 * if it genuinely is not a knob (a parseInt radix, a PRNG constant) — add it to
 * the allowlist with a sentence saying why.
 */
describe('the engine has no magic numbers', () => {
  it('passes its own check', () => {
    let output = '';
    let failed = false;

    try {
      output = execFileSync('node', ['scripts/check-magic-numbers.mjs'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      failed = true;
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }

    // Asserted as the empty string rather than as `false`, so a failure prints
    // the offending lines instead of "expected true to be false".
    expect(failed ? output : '').toBe('');
    expect(output).toContain('No magic numbers');
  });
});
