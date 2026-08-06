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

### 2026-08-06 — STEP 5: Clicking, crits and combo

Active play. The tree is now a click target, taps pay Sap, and the first three
upgrades are buyable.

- `src/engine/geometry.ts` — `Vec2` / `Segment`, `distanceToSegment` (projection
  parameter clamped to `[0,1]`, so it measures to the *segment*, not the
  infinite line), `nearestSegment`, and `hitTestSegments`. A segment's own
  half-width counts toward its hit area on top of the flat tolerance, so the
  trunk is fat and forgiving while twigs stay precise.
- `src/content/tree.ts` + `src/engine/tree.ts` — the first procedural tree. A
  `TreeBlueprint` (data) drives `generateTree()` into an ordered list of
  `TreeSegment`s in **canonical tree space**: trunk base at the origin, `+y` up,
  ~1 unit ≈ tree height. Deterministic via a seeded PRNG. `treeBounds()` +
  `projectTree()` map it into screen pixels. This is the clickable *skeleton*
  only — no leaves, no player-driven growth yet.
- `src/engine/rng.ts` — `RandomSource` type + mulberry32 `createSeededRandom`,
  so crit rolls and tree jitter are injectable in tests.
- `src/engine/combo.ts` — the combo meter as `{ stacks, lastClickAt }` with the
  effective value *derived* at read time rather than stepped per tick, so it is
  exact at any frame rate and trivially testable. Held for
  `COMBO_WINDOW_MS` (1500), then drains linearly to empty at `COMBO_DECAY_MS`
  (3000). `COMBO_BONUS_PER_STACK` = 2%, so 50 stacks = +100%; a raised cap keeps
  paying past 50 (that is what makes Rhythm of Growth worth buying).
- `src/engine/clicker.ts` — the four click stats (`clickPower` 1,
  `critChance` 2%, `critMult` ×10, `comboCap` 50) resolved from tag-targeted
  modifiers under `CLICK_STAT_TAG`, plus the pure `resolveClick()`:
  `gain = clickPower × comboMultiplier × (crit ? critMult : 1)`.
- `src/engine/modifiers.ts` — added `matchingTag(tag)`. Stats are not producers,
  so they must not pick up the resource-targeted modifiers `matching()` returns.
- `src/content/upgrades.ts` + `src/engine/upgrades.ts` — data-driven repeatable
  upgrades: cost `baseCost × growth^level`, effects re-granted wholesale under
  one `upgrade:<id>` source per level (so levels never double up). Stronger Taps
  (10 ×1.5ⁿ), Sharper Instincts (50 ×1.6ⁿ), Rhythm of Growth (250 ×2ⁿ). Only
  Stronger Taps' cost was specified; the other two base costs are chosen.
- `src/engine/simulation.ts` — `click(now, random)` resolves a tap **outside the
  tick loop**, synchronously, so a burst can never be coalesced by the frame
  loop. `buyUpgrade(id)`. `snapshot(now)` now also carries `clickStats`, the
  live `combo`, per-upgrade `UpgradeSnapshot`s, and the lifetime `clicks` count.
- `src/render/effects.ts` — object-pooled floating numbers (600 ms rise + fade,
  gold and larger on crit) and ripples (380 ms). Pools are allocated once and
  slots reused forever; when saturated the *oldest* slot is recycled rather than
  dropping the newest tap. Effects store absolute spawn times, not countdowns.
- `src/render/tree.ts` — `computeTreeLayout()` fits the tree to the canvas from
  its **measured** bounds (height or width, whichever binds) and centres the
  silhouette rather than the trunk. Tested against five aspect ratios.
- `src/render/comboMeter.ts` — small ring meter offset to the side of the
  pointer with the live multiplier in the middle; hidden when empty.
- `src/render/canvas.ts` — owns the screen-space projection (recomputed on
  resize, not per frame) and therefore `hitTest()`; draws tree → effects → meter.
- `src/ui/treeInput.ts` — `attachTreeInput()` on **`pointerdown`**, not `click`.
  Multi-touch falls out of the pointer model (one event per contact); active
  `pointerId`s are tracked so one finger lifting does not hide the meter. The
  surface is typed structurally so the dispatch path is testable in node.
- `src/ui/UpgradePanel.tsx` — **temporary** side panel, driven entirely by the
  `UPGRADES` list.
- `src/ui/App.tsx` — wires input → `sim.click()` → effect spawn, all outside
  React state; one `Date.now()` per frame shared by snapshot and renderer.
- Tests: 148 pass (up from 42). New: `combo.test.ts` (16 — accumulation, the
  window/drain boundaries, mid-drain top-up, cap, multiplier), `clicker.test.ts`
  (13 — stat resolution incl. tag isolation and clamping, crit boundary at
  `roll < critChance`, combo × crit stacking), `geometry.test.ts` (13),
  `tree.test.ts` (11), `upgrades.test.ts` (18), `render/tree.test.ts` (8),
  `render/effects.test.ts` (6 — pooling, capacity, recycling), and
  `ui/treeInput.test.ts` (12 — including **100 taps at 10 Hz with zero drops**
  and multi-touch). `simulation.test.ts` gained 8 click/combo cases.
- Verified in a real browser (Chromium/Playwright against the production build):
  30 taps at 10 Hz credited exactly 39.3 Sap, misses credited nothing, the
  upgrade purchase took effect, the combo returned to ×1.00 after 3 s idle, and
  no page errors.

**Design decisions worth knowing**

- A tap banks its combo stack *before* it pays out, so the meter and the number
  that flies up always agree. A lone first tap therefore pays ×1.02, not ×1.00.
- The combo drains smoothly between 1.5 s and 3 s instead of hard-resetting at
  the window edge. A click during the drain adds to whatever is left, which
  makes the drain mechanically meaningful rather than decorative.
- Everything on the click path uses `Date.now()` — mixing it with
  `performance.now()` would corrupt combo timing.

**Open TODOs**

- [ ] Replace the temporary `UpgradePanel` with in-tree purchasing (the spec's
      real UI: you buy growth by clicking limbs).
- [ ] Remove `debugProducers.ts` + the HUD toggle once real production systems
      (canopy Light, root Water/Minerals) exist. Sap-from-clicks now exists.
- [ ] The tree is a fixed skeleton; it should grow from game state (branch count
      driven by purchases) and gain leaves. `generateTree` already takes a
      blueprint, so this is a matter of deriving the blueprint from state.
- [ ] `snapshot()` allocates a full set of `Decimal`s + upgrade rows every frame.
      Fine at this size; revisit if the HUD starts costing frames.
- [ ] Click stats are recomputed on every tap and every snapshot. Cache them on
      the modifier set if the modifier list gets long.
- [ ] Audio: no sound on tap or crit yet (Howler is a dependency but unused).
- [ ] No jsdom in the test setup, so `attachTreeInput` is exercised through a
      structural fake rather than a real `HTMLCanvasElement`. The DOM binding
      itself (listener registration on the actual canvas) is covered only by the
      Playwright smoke run, not by CI.
- [ ] `clicks` is tracked but nothing reads it yet — intended for later
      achievements/statistics.

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
