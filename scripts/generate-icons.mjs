#!/usr/bin/env node
/**
 * Generate every raster asset the release needs from one drawing.
 *
 * `npm run assets:icons`. The output is committed — a static host is handed the
 * `public/` folder as it stands, and a build that has to rasterise four PNGs
 * before it can serve a page is a slower build for no gain. Re-run it whenever
 * `scripts/lib/glyph.mjs` or `public/icon.svg` changes; the two are the same
 * drawing and are kept in step by hand.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './lib/png.mjs';
import { encodeIco } from './lib/ico.mjs';
import { renderIcon, renderSocialCard } from './lib/glyph.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'public', 'icons');
mkdirSync(icons, { recursive: true });

/** What gets written, and why each one exists. */
const OUTPUTS = [
  {
    path: join(icons, 'icon-192.png'),
    render: () => encodePng(192, 192, renderIcon(192)),
    note: 'the manifest icon Android uses in the launcher',
  },
  {
    path: join(icons, 'icon-512.png'),
    render: () => encodePng(512, 512, renderIcon(512)),
    note: 'the manifest icon used for splash screens and desktop installs',
  },
  {
    path: join(icons, 'icon-maskable-512.png'),
    // Square, and padded to Android's safe zone: a maskable icon is cropped to
    // whatever shape the launcher likes, so the artwork stays inside the middle
    // 80% and the corners are filled rather than rounded.
    render: () => encodePng(512, 512, renderIcon(512, { padding: 0.16, cornerRadius: 0 })),
    note: 'the same icon, safe for any launcher mask',
  },
  {
    path: join(icons, 'apple-touch-icon.png'),
    // iOS applies its own rounding and refuses transparency, so this one is
    // drawn edge to edge with square corners.
    render: () => encodePng(180, 180, renderIcon(180, { padding: 0, cornerRadius: 0 })),
    note: 'the home-screen icon on iOS',
  },
  {
    path: join(root, 'public', 'favicon.ico'),
    // Two sizes, because Windows and old browsers pick different ones and a
    // 16px icon downscaled from 32 in the browser looks like mud.
    render: () =>
      encodeIco([
        { size: 16, png: encodePng(16, 16, renderIcon(16, { padding: 0, cornerRadius: 0.18 })) },
        { size: 32, png: encodePng(32, 32, renderIcon(32, { padding: 0, cornerRadius: 0.18 })) },
      ]),
    note: 'the fallback favicon everything asks for whether it is linked or not',
  },
  {
    path: join(root, 'public', 'og-image.png'),
    render: () => encodePng(1200, 630, renderSocialCard(1200, 630)),
    note: 'the 1200x630 link preview placeholder',
  },
];

for (const output of OUTPUTS) {
  const png = output.render();
  writeFileSync(output.path, png);
  const size = (png.length / 1024).toFixed(1).padStart(7);
  console.log(`${size} KB  ${output.path.slice(root.length + 1)}  — ${output.note}`);
}
