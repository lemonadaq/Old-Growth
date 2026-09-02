#!/usr/bin/env node
/**
 * `npm run package:itch` — build the game for itch.io and zip it.
 *
 * itch serves an HTML game from a per-build subdirectory, so this is a *second*
 * build with `--base ./`: the default absolute `/assets/...` URLs would 404
 * there, and the game would be a white page with a working service worker. The
 * zip has `index.html` at its root, which is what itch's uploader looks for.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk } from './lib/sw.mjs';
import { zip } from './lib/zip.mjs';
import { formatBytes } from './lib/bundle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist-itch');
const releaseDir = join(root, 'release');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

const run = (command, args) =>
  execFileSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });

rmSync(outDir, { recursive: true, force: true });

run('npx', ['tsc', '-b']);
run('npx', ['vite', 'build', '--base', './', '--outDir', 'dist-itch', '--emptyOutDir']);
run('node', [join('scripts', 'build-sw.mjs'), 'dist-itch']);

const files = walk(outDir).map((name) => ({ name, data: readFileSync(join(outDir, name)) }));
if (!files.some((file) => file.name === 'index.html')) {
  console.error('package:itch: no index.html at the root of the build — refusing to package.');
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });
const archive = join(releaseDir, `old-growth-${version}-itch.zip`);
writeFileSync(archive, zip(files));

console.log(
  `\npackaged ${files.length} files into ${archive.slice(root.length + 1)} ` +
    `(${formatBytes(readFileSync(archive).length)})`,
);
console.log('Upload it to itch.io as an HTML game and tick "This file will be played in browser".');
