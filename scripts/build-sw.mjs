#!/usr/bin/env node
/**
 * Write `sw.js` into a finished build.
 *
 * Runs after `vite build` (see the `build` script). Takes the output directory
 * as its only argument, so the itch.io package — which is a second build with a
 * relative base — gets its own worker naming its own hashed files.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildId, precacheList, serviceWorkerSource, walk } from './lib/sw.mjs';

const outDir = resolve(process.argv[2] ?? 'dist');
if (!existsSync(outDir)) {
  console.error(`build-sw: ${outDir} does not exist — run the build first.`);
  process.exit(1);
}

const assets = precacheList(walk(outDir));
if (!assets.includes('index.html')) {
  console.error(`build-sw: no index.html in ${outDir} — refusing to write a worker for it.`);
  process.exit(1);
}

const cacheName = `old-growth-${buildId(outDir, assets)}`;
writeFileSync(join(outDir, 'sw.js'), serviceWorkerSource({ cacheName, assets }));
console.log(`sw.js written to ${outDir}: ${assets.length} files precached as ${cacheName}`);
