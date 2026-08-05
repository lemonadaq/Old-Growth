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

### 2026-08-05 — STEP 3: Tree graph data model

New `src/engine/tree/` module (pure TS, no React), re-exported from
`src/engine/index.ts`:

- `treeTypes.ts` — `NodeType` (`trunk`/`branch`/`twig`/`leafCluster`/`blossom`/
  `rootSegment`/`rootTip`), the `TreeNode` shape (all JSON-primitive fields:
  `id`, `type`, `parentId`, `childIds`, `speciesId`, `level`, `angle` [radians,
  relative to parent], `length`, `thickness`, `createdAtTick`), and the
  **data-driven** `NODE_RULES` table (`domain`, `direction`, `allowedChildren`,
  `maxChildren`, `maxAngleFromParent`, base length/thickness). Canopy nodes splay
  ±70° of the parent; roots ±55°. `baseDirection()` + `UP_ANGLE`/`DOWN_ANGLE`
  fix the world convention (screen coords, +y **down**: canopy → -y, roots → +y).
- `rng.ts` — `SeededRng` (mulberry32) with serializable single-integer state, so
  replaying an action log yields byte-identical geometry and growth resumes
  deterministically after load.
- `treeGraph.ts` — `TreeGraph`: `create(seed, speciesId, tick?)` seeds a lone
  trunk; `getValidGrowthOptions(id)` (allowed children, or `[]` at the child
  cap); `grow(id, childType, speciesId)` returns the new node, placing its angle
  as an even fan across the allowed range + small seeded jitter (clamped);
  `prune(id)` removes the whole subtree (subtree-root first) and detaches it,
  refusing the trunk; `serialize()`/`static deserialize()` for full JSON
  round-trips (versioned, carries `rngState`/`nextId`/`currentTick`).
  `computeWorldPositions(graph, origin?)` is a **pure** walk deriving per-node
  `NodeGeometry` (start/end/worldAngle); positions are never stored on the graph.
  Domain switches (a root off the trunk) reset direction to the domain base.
- Tests: `tree/treeGraph.test.ts` (18) — growth constraints (allowed types, child
  caps, terminals, unknown-id throws, parent/level/tick recording), angle bounds
  + hemisphere/spread geometry, subtree pruning (+ trunk refusal), determinism
  (same seed identical, different seeds diverge, continuity across a
  serialize/deserialize boundary), and serialization round-trips. 60 tests pass;
  lint + build clean.

**Open TODOs**

- [ ] Wire `TreeGraph` into `Simulation`/`GameState` (own the player's tree,
      stamp real `createdAtTick` via `setTick`, include it in snapshots/saves).
- [ ] Render the graph on the canvas via `computeWorldPositions` (thickness →
      stroke width, node type → color/shape); anchor `origin` at the trunk base.
- [ ] Gate `grow`/`prune` behind resource costs + refunds (Sap to grow, Deadwood
      + partial refund on prune) once the economy is connected.
- [ ] Species-driven geometry (per-species length/thickness/angle overrides,
      hybrids from grafting) rather than the single shared `NODE_RULES` table.

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
