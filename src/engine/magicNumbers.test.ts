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
 * `scripts/check-magic-numbers.mjs` walks `/src/engine` and fails on any numeric
 * literal that is neither structural (0, 1, 2, -1 and the like) nor listed in
 * `scripts/magic-numbers.allowlist.json` with a reason. This runs the same
 * script rather than reimplementing it, so the test and the pre-commit check can
 * never disagree about what the rule is.
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
      const shell = error as { stdout?: string; stderr?: string };
      output = `${shell.stdout ?? ''}${shell.stderr ?? ''}`;
    }

    expect(failed ? output : '').toBe('');
    expect(output).toContain('No magic numbers');
  });
});
