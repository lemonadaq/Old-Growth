# Agent Notes

Working notes for agents building **Old Growth**. Read `PROJECT_SPEC.md` first
for the design and architecture. Keep everything data-driven and strictly typed.
Do not refactor unrelated code.

## Conventions

- `/src/engine` is pure TypeScript — **never** import React there.
- Resources are `Decimal` (break_infinity.js). Format for display via
  `src/engine/format.ts`.
- Content lives in `/src/content` as typed data, not hard-coded in logic.
- Before finishing any task: `npm run lint`, `npm test`, `npm run build` must all
  pass. Then append a dated changelog entry below with open TODOs.

## Changelog

### 2026-08-05 — STEP 4: Canvas tree renderer + camera

**World space.** `y` is **up**, origin at the trunk base on the soil line: `y > 0`
is canopy, `y < 0` is roots. One world unit = one CSS pixel at zoom 1. The camera
performs the y flip once, so nothing upstream of it deals with canvas y-down.

- `src/engine/geometry.ts` — `Vec2` / `Rect`, quadratic Bézier point + tangent,
  angle ↔ direction (`0` = up, `180` = down), rect union/intersect/expand.
- `src/engine/rng.ts` — seeded mulberry32 `Rng` + `hashString`, so procedural
  decoration is identical across reloads and machines.
- `src/engine/treeGraph.ts` — **`TreeGraph`**, the structure the renderer reads
  each frame. `buildTreeGraph(spec)` resolves authored relative angles/lengths
  into world curves: each limb gets `start` / `control` / `end`, `baseWidth` →
  `tipWidth` taper, `depth`, `attach` (parameter along the parent), sway params,
  and a per-node AABB. Children attach at the exact point on the parent curve and
  inherit width from the parent's _local_ width there. `collectVisibleNodes()`
  culls against a viewport rect into a caller-owned array (no per-frame garbage);
  `visibleNodes()` is the allocating convenience form. Nodes come out in draw
  order — roots, branches by depth, leaves — which also guarantees parents
  precede children for the sway pass.
- `src/engine/timeOfDay.ts` — `dayPhase()` (`0` midnight, `0.25` sunrise, `0.5`
  noon, `0.75` sunset) over a 240 s cycle starting mid-morning, plus `dayPeriod()`
  and `daylight()`. `GameSnapshot` now carries `dayPhase`.
- `src/content/species.ts` — `SpeciesDef` per species: bark, leaf, and a
  desaturated earth `root` palette. `src/content/treeSpec.ts` — the authored
  `TreeSpec` / `LimbSpec` / `LeafClusterSpec` format. `src/content/demoTree.ts` —
  the acceptance demo: **12 branches (trunk + 11 limbs), 20 leaf clusters, 8 roots**.
- `src/render/camera.ts` — `Camera` (pure math, no DOM): centre + zoom +
  CSS-pixel viewport, `worldToScreen` / `screenToWorld` / `visibleWorldRect` /
  `applyTransform`. Zoom clamps to 0.5×–2.0× and `zoomAt()` keeps the world point
  under the cursor anchored. Panning clamps the _visible rect_ between cloud
  level (`y = 900`) and bedrock (`y = -640`), centring instead of jittering when
  the viewport is taller than the world; horizontal travel is clamped to ±700.
- `src/render/cameraController.ts` — Pointer Events (one path for mouse, pen, and
  touch): drag to pan, wheel/two-finger scroll to pan, ctrl+wheel (trackpad
  pinch) and two-finger pinch to zoom on the cursor. `normaliseWheel()` converts
  line/page deltas to pixels.
- `src/render/color.ts` — memoised hex parsing, RGB mixing, and `sampleKeyframes()`
  over a **cyclic** track (wraps last → first, so midnight → dawn is seamless).
- `src/render/palette.ts` — 8-keyframe `SKY_TRACK` (top/bottom/haze/two hill
  tones/ambient) sampled by `dayPhase`, soil strata down to bedrock, world
  extents, zoom limits, hill bands.
- `src/render/scene.ts` — sky gradient anchored cloud-level → soil line, sun/moon
  arcing over the horizon, horizon haze, parallax hill bands (clipped to the sky
  and clamped so panning up cannot lift a ridge into a wall — reserved for the
  future Old Growth forest), and the world-space soil cross-section with strata,
  scattered grit, and a turf lip.
- `src/render/sway.ts` — `SwayField` accumulates sway down the graph: a node's
  base offset is its parent's offset at the attachment point, its tip adds its own
  oscillation, so twigs and leaf clusters never detach from their branch. Roots
  have `swayAmount === 0`, which makes the underground still for free.
- `src/render/tree.ts` — `TreePainter`. Limbs are sampled along the curve, offset
  by half the local width along the normal, and filled as one polygon (that is
  what tapers them); a lit and a shaded band are filled on top once a limb is ≥ 4
  px wide. Leaf clusters are 3–5 overlapping soft-circle sprites in the species
  hue. Species colors are tinted by the sky's ambient and memoised.
- `src/render/leafSprite.ts` — soft-circle sprite cache with a small mip chain
  (32/64/128/256) so blobs are not resampled from an oversized sprite every
  frame, plus a size cap with oldest-first eviction as the ambient drifts.
- `src/render/canvas.ts` — `Renderer` owns the canvas, camera, and controller.
  Draw order per frame: sky → sun/moon → hills → soil → tree. `devicePixelRatio`
  is applied once as the base transform; `resize()` is safe to call at any time
  and re-clamps the camera. Sway advances on `elapsedSeconds + alpha / TICK_RATE`,
  so motion is smooth between fixed ticks.
- `src/ui/App.tsx` — builds the demo graph, hands it to the renderer, disposes
  input listeners on unmount.
- Tests: `geometry` (9), `treeGraph` (14, incl. the 12/20/8 acceptance shape and
  culling), `timeOfDay` (5), `camera` (16, incl. cursor-anchored zoom and the
  cloud/bedrock clamp), `color` (13, incl. cyclic wrap), `sway` (7). 107 tests
  pass; lint + build clean.

**Verified in a real browser** (headless Chromium, dpr 2): the demo tree renders
and sways, drag/wheel/pinch pan and zoom between canopy and roots, and the sky
lerps through morning → noon → sunset → night with the moon rising. Measured
`draw()` cost on a synthetic **500-node** tree at 1000×700 CSS / dpr 2: median
**2.0–2.3 ms**, p95 3.8 ms (0.5 ms in the root view, where culling draws 117 of
500 nodes) — comfortably inside a 16.7 ms frame. Note the container rasterises in
software, so its end-to-end frame rate is fill-rate bound (background alone
~55 fps) and is not representative of GPU-composited hardware.

**Open TODOs**

- [ ] Move the `TreeGraph` into `GameState` and onto the snapshot; the demo spec
      in `content/demoTree.ts` is a placeholder until growth mechanics author
      limbs. Rebuild (or incrementally patch) the graph when the spec changes.
- [ ] Hit-testing: map a click back to a node (trunk clicks for Sap, selecting a
      limb to prune/graft). `Camera.screenToWorld` + node bounds are the hooks.
- [ ] Populate the hill bands with the real Old Growth forest silhouette at
      prestige; they are deliberately plain crests for now.
- [ ] Seasons/weather should drive the leaf palette and gust strength; `SwayField`
      already takes a per-frame gust envelope.
- [ ] Leaf clusters draw back-to-front by build order only. If canopies get dense,
      sort by depth or bake a cluster into a single sprite.
- [ ] An exception thrown inside `draw()` kills the rAF chain (the loop does not
      re-arm). Consider guarding the render callback in `GameLoop`.

### 2026-08-05 — STEP 2: Economy foundation (resources, producers, modifiers)

- `src/engine/resourceRegistry.ts` — `ResourceRegistry` holding, per resource,
  `amount` / lifetime `total` / cached `perSecond`. `add()` accrues the lifetime
  total on positive deltas only (spending never lowers it).
- `src/engine/modifiers.ts` — `Modifier` (`type: 'add' | 'mul' | 'pow'`, `'pow'`
  reserved & ignored for now; `targetKind: 'tag' | 'resource'`; `source` id for
  clean removal). `ModifierSet` (add / `removeBySource` / `matching`) and pure
  `applyModifiers()` with the fixed stacking order **(base + Σadds) × Πmuls**.
- `src/engine/economy.ts` — `Producer` `{ id, resource, baseRate, tags }` and
  pure `computeProduction()` that sums each producer's modified rate per
  resource. Modifiers apply when they target the producer's resource or a tag.
- `src/engine/simulation.ts` — `Simulation` now owns producers + modifiers.
  `tick()` recomputes the pipeline, caches `perSecond` on the registry, and
  advances amounts by `rate × dt`. `snapshot()` now also carries `totals` and
  `perSecond`. Added `addProducer` / `removeProducer` / `addModifier` /
  `removeModifiersBySource`.
- `src/engine/format.ts` — reworked to spec: plain to 999, `K/M/B/T`, scientific
  from `1e15`, max 2 decimals (trailing zeros trimmed).
- `src/engine/debugProducers.ts` — **temporary** `enable/disableTestProducers()`
  registering a `+1/s` producer per resource (source-tagged `debug`).
- `src/ui/App.tsx` — snapshots are now pushed to the store **once per render
  frame** (in `render`), not per tick; `update` only advances the sim. Added a
  ref + effect to toggle the debug producers live.
- `src/ui/Hud.tsx` / `Hud.css` — resource rows now show a live `/s` rate, plus a
  "Start/Stop test producer" toggle button.
- Tests: `format.test.ts` (13 incl. the 10 canonical cases), `modifiers.test.ts`
  (stacking order, insertion-order independence, add/remove by source, tag vs
  resource matching, pow ignored), `economy.test.ts` (summation + tag/resource
  modifiers), extended `simulation.test.ts` (production, rate cache, producer
  removal, all-seven-resources debug tick). 42 tests pass; lint + build clean.

**Open TODOs**

- [ ] Remove `debugProducers.ts` + the HUD toggle once real production systems
      (Sap clicks, canopy Light, root Water/Minerals) exist.
- [ ] Wire the `'pow'` modifier type into `applyModifiers` when late-game
      content needs it.
- [ ] Modifier ordering across producers is currently commutative; revisit if
      order-dependent stacking (e.g. additive-after-multiplicative) is needed.

### 2026-08-05 — STEP 1: Project scaffold & design spec

- Initialized Vite + React 18 + TypeScript (strict) project.
- Tooling: ESLint (flat config) + Prettier, Vitest.
- Dependencies: Zustand, break_infinity.js, Howler.
- Created folder layers: `/src/engine`, `/src/render`, `/src/ui`, `/src/content`.
- `PROJECT_SPEC.md` with the verbatim design summary + architecture notes.
- App shell: full-screen canvas with React HUD overlay.
- Engine skeleton:
  - `loop.ts` — accumulator-based fixed timestep (10 TPS) decoupled from a
    `requestAnimationFrame` render loop, with frame-gap clamping and FPS/TPS
    stat sampling.
  - `simulation.ts` — mutable `GameState` advanced by `tick(dt)`, produces
    immutable snapshots.
  - `store.ts` — Zustand vanilla store holding the latest snapshot + debug stats;
    read by the UI, written by the engine (no React dependency).
  - `types.ts`, `format.ts` — resource state + number formatting helpers.
- `/src/content/resources.ts` — data-driven resource definitions (the seven
  resources from the spec).
- `/src/render/canvas.ts` — sky-to-soil gradient renderer sized to the viewport
  with devicePixelRatio handling.
- HUD shows an FPS/TPS debug counter and a resource readout.
- Tests: `loop.test.ts` (fixed-timestep accumulator + clamping), `simulation.test.ts`
  (initial state + tick advancement).

**Open TODOs**

- [ ] Trunk click interaction → produce Sap (core clicker loop).
- [ ] Procedural tree rendering (trunk, branches, leaves) driven by game state.
- [ ] Root system + underground view; idle/offline production.
- [ ] Resource production systems (Light from leaves, Water/Minerals from roots).
- [ ] Content: species, upgrades, symbionts as `/src/content` data.
- [ ] Prune / graft mechanics; prestige ("Go to Seed") + Heirloom meta-upgrades.
- [ ] Seasons + weather events.
- [ ] Save/load persistence + offline progress calculation.
- [ ] Audio via Howler; wire `/src/render` interpolation `alpha` for smooth motion.
