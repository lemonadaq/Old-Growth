import { gzipSync } from 'node:zlib';

/**
 * Bundle accounting for the release build.
 *
 * The budget is on **gzipped JavaScript**, because that is the number that
 * decides whether the game opens on a phone: everything else in the build is
 * either tiny (one stylesheet) or not on the critical path (icons, the social
 * card). It is checked rather than eyeballed — a dependency added in a hurry is
 * exactly the kind of thing nobody notices until a player on 3G does.
 */

/** The ceiling: 1.2 MB of gzipped JS, as the release brief sets it. */
export const JS_BUDGET_BYTES = Math.round(1.2 * 1024 * 1024);

/** What a transfer-encoded response would weigh. Level 9: what a CDN serves. */
export function gzipSize(buffer) {
  return gzipSync(buffer, { level: 9 }).length;
}

/** Group `{ file, raw, gzip }` entries by kind and total them. */
export function summarize(entries) {
  const kindOf = (file) => {
    if (file.endsWith('.js') || file.endsWith('.mjs')) return 'js';
    if (file.endsWith('.css')) return 'css';
    if (file.endsWith('.html')) return 'html';
    return 'other';
  };

  const groups = { js: [], css: [], html: [], other: [] };
  for (const entry of entries) groups[kindOf(entry.file)].push(entry);

  const totals = {};
  for (const [kind, list] of Object.entries(groups)) {
    totals[kind] = {
      count: list.length,
      raw: list.reduce((sum, entry) => sum + entry.raw, 0),
      gzip: list.reduce((sum, entry) => sum + entry.gzip, 0),
    };
  }

  return { groups, totals, withinBudget: totals.js.gzip <= JS_BUDGET_BYTES };
}

/** "412.3 KB" — sizes a person reads, not bytes. */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** The table `npm run analyze` prints, biggest file first within each kind. */
export function formatReport(summary) {
  const lines = [];
  const row = (left, raw, gzip) =>
    `  ${left.padEnd(42)} ${formatBytes(raw).padStart(10)} ${formatBytes(gzip).padStart(11)}`;

  lines.push(`  ${'file'.padEnd(42)} ${'raw'.padStart(10)} ${'gzipped'.padStart(11)}`);
  for (const kind of ['js', 'css', 'html', 'other']) {
    const entries = [...summary.groups[kind]].sort((a, b) => b.gzip - a.gzip);
    if (entries.length === 0) continue;
    lines.push('');
    for (const entry of entries) lines.push(row(entry.file, entry.raw, entry.gzip));
    const total = summary.totals[kind];
    lines.push(row(`— ${kind} total (${total.count})`, total.raw, total.gzip));
  }

  const js = summary.totals.js.gzip;
  lines.push('');
  lines.push(
    summary.withinBudget
      ? `  OK — ${formatBytes(js)} of gzipped JS, budget ${formatBytes(JS_BUDGET_BYTES)} ` +
          `(${Math.round((js / JS_BUDGET_BYTES) * 100)}% used).`
      : `  OVER BUDGET — ${formatBytes(js)} of gzipped JS against a ` +
          `${formatBytes(JS_BUDGET_BYTES)} ceiling.`,
  );
  return lines.join('\n');
}
