# Credits

Old Growth is built on other people's work. This file names it, and records what
is still owed.

## Libraries

Shipped in the bundle:

| Library                                                           | Version | Licence | What it does here                                          |
| ----------------------------------------------------------------- | ------- | ------- | ---------------------------------------------------------- |
| [React](https://react.dev)                                        | 18.3    | MIT     | The HUD, the panels, every piece of UI over the canvas     |
| [React DOM](https://react.dev)                                    | 18.3    | MIT     | Rendering that UI into the page                            |
| [Zustand](https://github.com/pmndrs/zustand)                      | 4.5     | MIT     | The vanilla store the engine writes snapshots into         |
| [break_infinity.js](https://github.com/Patashu/break_infinity.js) | 2.2     | MIT     | `Decimal`, so resources can pass what a double cannot hold |
| [Howler](https://howlerjs.com)                                    | 2.2     | MIT     | The audio bus, its master gain and the unlock handling     |

Build and development only:

| Tool                                                                  | Version | Licence    |
| --------------------------------------------------------------------- | ------- | ---------- |
| [Vite](https://vitejs.dev)                                            | 5.4     | MIT        |
| [`@vitejs/plugin-react`](https://github.com/vitejs/vite-plugin-react) | 4.7     | MIT        |
| [TypeScript](https://www.typescriptlang.org)                          | 5.9     | Apache-2.0 |
| [Vitest](https://vitest.dev)                                          | 2.1     | MIT        |
| [ESLint](https://eslint.org) + typescript-eslint                      | 9.x     | MIT        |
| [Prettier](https://prettier.io)                                       | 3.x     | MIT        |

Full licence texts ship inside each package under `node_modules/`.

## Art

Everything drawn on screen is drawn by the game. There are no image assets in
the canopy, the soil, the creatures or the weather — `src/render/` puts all of
it on a canvas at runtime, from the palette in `src/render/palette.ts`.

The icons, the favicon and the social card are the one exception, and they are
generated too: `public/icon.svg` is the tree glyph as a vector, and
`scripts/lib/glyph.mjs` is the same drawing as code, rasterised into
`public/icons/` and `public/og-image.png` by `npm run assets:icons`. No third
party art is used, and the social card is a placeholder.

## Audio

**Every sound in the game is synthesised at runtime.** `src/ui/audio/synth.ts`
builds each cue from oscillators and noise against the specs in
`src/content/audio.ts`; nothing is loaded from a file, and `public/audio/` is
empty apart from its brief.

**TODO — licensing.** Recorded audio has not been sourced, and no licence has
been chosen for it. `public/audio/ASSETS_TODO.md` specifies every cue that
should eventually be recorded, in what format and at what loudness. Before any
of it ships:

- Every file needs its source and licence recorded in this file — creator, where
  it came from, which licence, and whether attribution is required in-game as
  well as here.
- CC-BY material needs its attribution line written into the game's Settings
  panel, not only into this file.
- Anything commissioned needs its terms recorded here too, including whether the
  itch.io build and any future store build are both covered.

Until then, the synthesised bank is the shipping audio, and it is original.

## Fonts

System fonts only (`Segoe UI`, `system-ui`, `-apple-system`, and the rest of the
stack in `src/index.css`). Nothing is downloaded, and no font is redistributed.
