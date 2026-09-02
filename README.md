# Old Growth

**A cozy clicker where the skill tree is a real tree.**

You tap a trunk for Sap and spend it on branches, leaves and roots. There is no
menu of upgrades: the upgrades _are_ the tree, drawn on a canvas, and where you
put them matters. Leaves shade each other. Deep roots find minerals. Cutting a
limb pays you back in Deadwood and wakes the buds below it. Eventually you give
the whole tree up to the forest behind you and start again with better seeds.

![Old Growth, in the opening minutes: a young trunk with three branches under a
spring sky, the soil strata visible below.](docs/screenshot.png)

_Early game, with the trunk keyboard-focused. A late-game canopy shot goes here
once v1.0 is out in the world._

## What is in it

- **The tree is the skill tree.** A procedurally drawn canvas tree that grows
  where you grow it — branches, twigs, leaf clusters, roots, all placed by you.
- **Clicking with teeth.** Crits, a combo meter, and Dew on the first tap of a
  new day.
- **Two economies.** The canopy makes Light while you watch; the roots make
  Water and Minerals whether you are there or not.
- **Sunlight and shade.** A day/night cycle, and leaves that steal each other's
  sky if you crowd them.
- **Pruning.** Cut a limb for a partial refund plus Deadwood, and the buds below
  it surge.
- **Species and grafting.** Six species, and hybrids you discover by joining two
  limbs that should not go together.
- **Symbionts.** Bees, ants, fungi, a songbird and a squirrel, each earned and
  each with something to say about how you have been playing.
- **Seasons and weather.** Four seasons on a rolling calendar, plus rain,
  storms, drought and the odd perfect day.
- **Prestige.** Go to Seed: the tree joins a permanent Old Growth forest on the
  ridge behind you, and Seeds buy Heirlooms in the Vault.
- **Offline progress.** The roots keep working while the tab is shut, and the
  game tells you exactly what happened while you were gone.
- **Thirty achievements**, a Journal, lifetime Stats, and a save you own —
  export it to a string, import it anywhere.
- **Plays offline, installs like an app.** A service worker caches the shell, so
  the game opens with no network at all.

## Running it

Node 20 or newer.

```bash
npm ci
npm run dev      # http://localhost:5173
```

| Script                  | What it does                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| `npm run dev`           | Vite dev server, with the FPS counter and debug producers visible |
| `npm test`              | Vitest, once                                                      |
| `npm run test:watch`    | Vitest, watching                                                  |
| `npm run lint`          | ESLint                                                            |
| `npm run format`        | Prettier, writing                                                 |
| `npm run build`         | Type-check, production build, and the generated service worker    |
| `npm run preview`       | Serve `dist/` exactly as a static host would                      |
| `npm run analyze`       | Bundle report; fails if gzipped JS passes 1.2 MB                  |
| `npm run sim`           | Headless balance simulation — three bots, time-to-milestone table |
| `npm run sim:trace`     | The same, narrated one event at a time                            |
| `npm run check:magic`   | Fails on magic numbers in `/src/engine`                           |
| `npm run assets:icons`  | Redraw the icons, favicon and social card from the tree glyph     |
| `npm run package:itch`  | Build with relative paths and zip it for itch.io                  |
| `npm run deploy:vercel` | Deploy to Vercel (needs `vercel login` and a linked project)      |

## Where things live

```
src/engine    pure TypeScript game logic — no React, no DOM
src/render    canvas 2D drawing; reads snapshots, never mutates the game
src/ui        React HUD, panels, input, audio
src/content   data: resources, species, upgrades, balance, the string table
scripts       release tooling and the headless simulation
```

The dependency rule runs one way — `content → engine → render → ui` — and the
engine never imports React. See **PROJECT_SPEC.md** for the architecture,
**BALANCE.md** for every curve and the simulation output behind it, and
**AGENT_NOTES.md** for the build log, step by step.

## Your save

One `localStorage` key, `old-growth:save`, plus a backup key holding the last
file that parsed. Settings → Export copies a compressed string you can paste
anywhere; Import takes it back. If the game ever crashes, the recovery screen
hands you the same string before you reload.

Hard Reset is in Settings, behind typing `UPROOT`, and it is the only thing in
the game that playing on cannot undo.

## Deploying

**Vercel.** `vercel.json` is committed: it builds with `npm run build`, serves
`dist/`, caches hashed assets for a year and refuses to cache `sw.js` or
`index.html`. Run `npm run deploy:vercel` from a machine that has run
`vercel login` and `vercel link` once.

**itch.io.** `npm run package:itch` produces `release/old-growth-<version>-itch.zip`
with `index.html` at its root and relative asset paths. Upload it as an HTML
game and tick "This file will be played in the browser".

**Anywhere else.** `npm run build` and serve `dist/` as static files. The only
requirement is that `sw.js` is served from the site root with a short cache life.

## Credits and licensing

Libraries and asset provenance are in **CREDITS.md**. Every sound is currently
synthesised at runtime; `public/audio/ASSETS_TODO.md` is the brief for the
recordings that should replace it, and no licensing decision has been made for
them yet. The code itself has no licence chosen.
