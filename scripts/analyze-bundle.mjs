#!/usr/bin/env node
/**
 * `npm run analyze` — what the release build actually weighs, and whether the
 * JavaScript still fits under the budget.
 *
 * Exits non-zero when it does not, so it can stand in a release checklist or a
 * CI step without anyone having to read the table.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { formatReport, gzipSize, summarize } from './lib/bundle.mjs';
import { walk } from './lib/sw.mjs';

const outDir = resolve(process.argv[2] ?? 'dist');
if (!existsSync(outDir)) {
  console.error(`analyze: ${outDir} does not exist — run \`npm run build\` first.`);
  process.exit(1);
}

const entries = walk(outDir)
  .filter((file) => !file.endsWith('.map'))
  .map((file) => {
    const bytes = readFileSync(join(outDir, file));
    return { file, raw: statSync(join(outDir, file)).size, gzip: gzipSize(bytes) };
  });

const summary = summarize(entries);
console.log(`Old Growth — bundle report for ${outDir}\n`);
console.log(formatReport(summary));

if (!summary.withinBudget) process.exit(1);
