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

### 2026-08-07 — STEP 7: Roots, soil strata and the idle economy

The underground stops being empty brown. There is a *column* down there — four
layers with mineral pockets buried in the clay and rock — and a root is now worth
what the ground it reached is worth. The two halves of the tree are wired
together: the canopy runs at whatever rate the roots can water it.

- `src/content/soil.ts` — **new**. The strata table as data: Topsoil `0…300`,
  Clay `300…800`, Rock `800…1600`, Bedrock below, each with its own fill colours
  and a `veinWeight`. Plus the vein-generation tunables and
  `DEPTH_PRODUCTION_SCALE` (500). **Units:** depth is quoted in *soil units*
  where the surface is 0 and depth grows downward, related to the graph's
  canonical units by `SOIL_UNITS_PER_CANONICAL` = 1000. That is what lets the
  table read exactly as the design does while the geometry stays
  resolution-independent.
- `src/content/hydration.ts` — **new**. `WATER_NEED_PER_LEAF` (0.35) and the
  clamp bounds (0.25 / 1.5).
- `src/engine/soil.ts` — **new**. `depthAt` / `canonicalYAt` / `stratumAt`
  (half-open bands, so exactly 300 is Clay) / `depthMultiplier` (`1 + depth/500`,
  never a penalty above ground) / `createSoilMap` / `veinAt` /
  `soilConditionsAt`. A `SoilMap` is 24 seeded pockets and nothing else, so the
  whole underground serialises to one number.
- **Veins pick their layer before their depth**, weighted by `veinWeight`
  (clay and rock carry 8 of 9.5), which is what makes the scatter read as
  geology rather than as uniform noise. Overlapping pockets award the *richest*,
  so a tip is never punished for landing in two.
- `src/engine/growth.ts` — production is now sited. `partProducer` and
  `partProductionDelta` take a `PartSoilContext` (`{ soil, placement }`) and
  resolve the rate at the part's **far end** — the tip that is actually in the
  ore, not the joint it grew from. Roots earn `×(1 + depth/500)`; a part whose
  catalogue entry says `requiresVein` (only `rootTip`, for Minerals) earns
  `× richness` inside a pocket and **nothing at all** outside one.
  `priceGrowthOptions` places every option where growing it would put it, so the
  ghost preview's tooltip quotes the real number — "+0.43 Water/s, Depth 224
  Topsoil ×1.45" — before a single Sap is spent.
- A root tip with no vein registers **no producer**, rather than a zero one. A
  zero producer would start earning the moment some later global `+add` landed
  on Minerals; barren ground should stay barren.
- `src/engine/hydration.ts` — **new**. `waterNeed(leaves)` is purely
  proportional (no floor), `computeHydration` is
  `clamp(income / need, 0.25, 1.5)`, and `hydrationModifiers` publishes it as two
  ordinary `mul` modifiers — one on the `canopy` tag, one on `click.power` — under
  a single revocable source. Nothing bespoke: hydration stacks in the normal
  `(base + Σadds) × Πmuls` order like everything else.
- `src/engine/simulation.ts` — `updateHydration()` runs at the top of every tick
  and again immediately after any grow or prune, so the HUD and the *next tap*
  agree with the purchase that was just made instead of lagging up to 100 ms.
  It revokes the old hydration modifiers **before** measuring Water income, which
  makes the absence of a feedback loop structural rather than a coincidence of
  tagging.
- `src/engine/economy.ts` — `computeResourceRate(producers, modifiers, resource)`,
  a single-resource pass so the mid-tick hydration read does not cost a full
  pipeline evaluation.
- `src/content/growth.ts` — root producers now carry an `'offline'` tag
  (`OFFLINE_TAG`) alongside their domain and type, ready for STEP 14. `rootTip`'s
  production gained `requiresVein: true`.
- `src/render/soil.ts` — **new**. `soilBands()` is pure (clip to the visible
  soil, keep the *unclipped* edges as gradient stops so a half-visible band still
  shades across its whole depth) and therefore tested without a canvas.
  `drawSoil()` fills the bands, draws the bedding planes and the layer names, and
  glows every on-screen pocket. Positioned through the same `TreeLayout` the tree
  is projected with, so a root you can *see* entering the clay really is earning
  the clay's bonus.
- Ore grains are clamped to 0.9–2.6 px whatever the zoom. The first pass scaled
  them with the pocket radius and the clay came out looking like a bubble bath;
  grains that stay grain-sized read as mineral in the ground.
- `src/ui/HydrationGauge.tsx` + `.css` — **new**. A droplet that fills toward the
  ceiling with a dashed tick at break-even, coloured by mood
  (parched/thirsty/watered/overcharged), and a tooltip writing out the whole sum:
  what the roots draw, what the canopy wants, the ratio, and the applied
  multiplier with a line saying which clamp bit. Hydration is the one HUD number
  that is a *multiplier* rather than a resource, so it gets a shape.
- `src/ui/GrowOptionTooltip.tsx` — root options now show depth, layer and the
  depth bonus; a mineral part shows its vein's richness, or a plain warning that
  there is no vein there and the tip would find nothing.
- Tests: 303 pass (up from 224). New: `soil.test.ts` (25 — conversions,
  band boundaries, the multiplier, determinism, generation bounds, the
  clay/rock bias, vein hit-testing incl. edges and overlaps),
  `hydration.test.ts` (16 — the need curve, both clamps, the neutral
  no-leaves case, and the modifiers driving Light and click power without
  touching Water), `render/soil.test.ts` (10 — band clipping, the bottomless
  band, no gaps, gradient spans). `growth.test.ts` gained 10 soil cases and
  `simulation.test.ts` 15, including **the acceptance case**: one leaf with no
  roots produces `0.4 × 0.25`, and three roots take it to `0.4 × 1.5` — a 6×
  lift, asserted as exactly `HYDRATION_MAX / HYDRATION_MIN`.
- Verified in a real browser (Chromium/Playwright against the production build,
  1280×800): strata bands and vein pockets render at 60 fps; 90 taps → 173.5 Sap;
  a branch and a leaf with no roots put **Light 0.1/s** in the HUD with the gauge
  amber at **×0.25** and "Per tap 0.25"; hovering the Root Segment dial quoted
  "+0.43 Water/s / Depth 224 Topsoil ×1.45"; three roots took it to **Water
  1.3/s, Light 0.6/s** and the gauge to **×1.50**, with the droplet's tooltip
  showing `1.3 ÷ 0.35 = 3.70 → ×1.50, capped`. No page errors beyond the
  pre-existing favicon 404.

**Design decisions worth knowing**

- `waterNeed` has **no base term**. With one, a seedling with no leaves would sit
  at the 0.25 floor and the opening of the game (before any canopy exists) would
  be four times slower for no reason the player could see. Proportional need
  means hydration is exactly 1.0 until the first leaf is bought, and the throttle
  arrives at the moment it can be understood — and one root segment (~0.44/s
  after its depth bonus) already over-supplies that first leaf, so the lesson
  costs 12 Sap to learn.
- Hydration multiplies **click Sap as well as Light**, per the spec. That is a
  sharp edge: buy a leaf with no roots and your taps drop to a quarter. The gauge
  going amber and the tooltip naming the fix are the whole mitigation for now;
  STEP 17's onboarding and STEP 19's balance pass own the rest.
- The depth a part is judged at is its **end**, not its midpoint. A long root is
  worth what it reached, which is the reading that makes chaining segments
  downward feel like digging.
- Bands are half-open (`top ≤ depth < bottom`). Without a rule the boundary
  depths are ambiguous, and "300 is where the clay starts" is the intuitive one.

**Open TODOs**

- [ ] **STEP 4 is still owed** and it now bites harder: with no camera, the deep
      strata are only visible once the layout has zoomed out far enough, so Rock
      and Bedrock are effectively unseen in the early game. Pan/zoom is what makes
      the column explorable.
- [ ] Blossoms produce Light but are not counted in `waterNeed`. Either they
      should drink too or the fiction should explain why not.
- [ ] Vein *discovery* is free: every pocket is drawn from the first frame. The
      Mycorrhiza symbiont (STEP 11) is supposed to extend "detection radius",
      which implies undetected veins should be hidden until then.
- [ ] A root tip cannot be aimed — its angle is fixed by its slot — so hitting a
      vein is a matter of which segment you extend, not a placement decision.
      Once pruning has UI (STEP 9) that becomes retry-able; a steerable tip may
      still be worth it.
- [ ] `soilConditionsAt` is evaluated per part at grow time only. Correct today
      (placements never change once grown), but a future mechanic that *moves*
      geometry would silently stale every root's rate.
- [ ] Root production is tagged `'offline'` but nothing consumes the tag yet
      (STEP 14).
- [ ] Mineral base rate (0.12), vein richness (1–2.2) and the depth scale (500)
      are first-pass guesses; STEP 19 owns real balance.
- [ ] `src/content/resources.ts` and `src/index.css` fail `prettier --check`.
      Pre-existing, left alone rather than sweeping unrelated files into this diff.
- [ ] Everything STEP 6 left open below still stands.

### 2026-08-06 — STEP 6: Growing interaction (the tree IS the skill tree)

The signature interaction. Tap a limb, a radial menu fans out of it, hover an
option to see a ghost of the part and what it will cost and produce, click to
buy. The tree is no longer a fixed drawing — it is the player's build.

**Scope note — STEPs 3 and 4 were only partly done.** STEP 5's commit produced a
procedural tree *silhouette* (`generateTree` from a blueprint) and a renderer for
it, but not STEP 3's actual deliverables: the node-typed `TreeGraph`, its
`getValidGrowthOptions` / `grow` / `prune` API, or serialisation. STEP 6 names
`getValidGrowthOptions` directly and cannot exist without it, so the graph model
is backfilled here. STEP 5's own changelog already listed this as the open TODO
("the tree is a fixed skeleton; it should grow from game state").

- `src/content/growth.ts` — **new**, the part catalogue as data. Seven node types
  with allowed children, `maxChildren`, angular spread + jitter, where children
  attach, base dimensions, per-generation falloff, cost and production. Adding a
  part type is now a data edit, not an engine edit. `PART_COST_GROWTH` = 1.15.
- `src/engine/treeGraph.ts` — **new**, the `TreeGraph` (STEP 3 backfill). Nodes
  store only what cannot be derived: type, parentage, `angle` *relative to the
  parent's heading*, `attachT` along the parent, `length`, `thickness`, `slot`,
  `speciesId`, `level`, `createdAtTick`. World positions come from
  `computePlacements()`, a pure walk from the trunk. Full API:
  `getValidGrowthOptions` / `grow` / `prune` / `subtree` / `toSegments` /
  `toJSON` / `fromJSON`, plus a `revision` counter and `countOfType` (which is
  what drives pricing).
- **Determinism** is the load-bearing property here. The per-fork angle wobble is
  a seeded hash of `(seed, parentId, childType, slot)` rather than a running RNG,
  so `getValidGrowthOptions` can promise the *exact* geometry a part will have
  before it is bought. That is what makes the ghost preview honest rather than
  decorative — there is a test asserting preview position equals grown position.
- `src/engine/growth.ts` — **new**, where shape meets economy. `partCost`
  (`baseCost × 1.15^owned`, counted per type), `partProducer`,
  `partProductionDelta` (evaluates the *prospective* producer against live
  modifiers, so the tooltip quotes the real `/s` the HUD will show, not a base
  rate), and `priceGrowthOptions`.
- `src/engine/simulation.ts` — `growthOptions(nodeId)`, `growPart()` (checks the
  rules, checks affordability, spends, grows, registers the producer — nothing is
  spent on a rejected call), `prunePart()`, and `syncPartProducers()` for the
  from-scratch path. Snapshots gained `treeRevision` and `treeSize`.
- `src/engine/tree.ts` — reduced to the canonical-space ↔ screen projection.
  `TreeSegment.kind` widened from `'trunk' | 'branch'` to the full node type.
- `src/render/radialMenu.ts` — **new**. `layoutRadialMenu` fans options on a 150°
  arc, centred *upward* for canopy parts and *downward* for roots, so the menu
  opens into the space the part would grow into. Pure layout + hit-test, tested
  without a canvas.
- `src/render/tree.ts` — leaf clusters (deterministic overlapping blobs),
  blossoms, roots below the soil line, and tapered limbs. Limbs are now a filled
  path narrowing to `TAPER` of their base rather than a constant-width stroke —
  that taper is most of what makes a drawn tree read as a tree. `growProgress()`
  drives the 120 ms ease-out scale-in; `drawGhostPart()` draws the preview.
- `src/ui/Tooltip.tsx` — **new** shared tooltip: React portal onto `document.body`
  (never clipped by HUD stacking), `position: fixed` at the cursor with edge
  flipping, 200 ms reveal delay. Controlled by props rather than DOM events,
  because the thing being hovered lives on the canvas and has no DOM node.
- `src/ui/GrowOptionTooltip.tsx` — **new**, the tooltip body: name, flavour, cost,
  production delta, and the shortfall when unaffordable.
- `src/ui/treeInput.ts` — added `onPress` (first refusal, so a tap on a menu dial
  is never *also* a tap on the tree) and `onMiss` (closes the menu). Both
  optional, so every STEP 5 behaviour and test is untouched.
- `src/ui/App.tsx` — wires press → menu → purchase → re-open, Escape to close,
  and pushes hover state into the tooltip. The renderer's projected tree is
  refreshed only when `tree.revision` changes, never per frame.
- Removed: `src/content/tree.ts` and `generateTree` (+ its tests). The blueprint
  silhouette is fully superseded by the graph; a run now starts as a lone
  seedling and everything above and below it is bought.
- Tests: 224 pass (up from 148). New: `treeGraph.test.ts` (34 — growth
  constraints, slot reuse after pruning, direction clamping, derived placements,
  subtree pruning, determinism, JSON round-trip, revision), `growth.test.ts` (19
  — the 1.15 curve, per-type counting, production deltas under modifiers,
  affordability and shortfall), `radialMenu.test.ts` (16 — arc placement, canopy
  vs root direction, hit-testing, arming delay). `simulation.test.ts` gained 13
  growth cases including the full STEP 6 loop end to end.
- Verified in a real browser (Chromium/Playwright against the production build):
  30 taps → 39.3 Sap; hovering the Branch dial showed nothing at 120 ms and the
  full tooltip at 320 ms (the 200 ms delay); buying took Sap 39.3 → 24.3; growing
  a leaf on that branch put **0.4 Light/s** in the HUD and it accumulated; a root
  put 0.3 Water/s in and rendered underground; the Blossom dial stayed visible
  and greyed with "Short by 42.02 Sap"; Escape closed the menu. No page errors.

**Design decisions worth knowing**

- Tapping a limb **both** pays Sap and opens its menu. STEP 5 made the tree the
  Sap button and STEP 6 makes it the upgrade button; the acceptance criteria
  ("click trunk for Sap, grow a branch on the tree") require both on the same
  target, so the tap does both rather than one mode stealing the other.
- Dials are dead for `MENU_ARM_MS` (180 ms) after opening. Without it, a player
  drumming on the trunk at 10 Hz opens the menu mid-burst and the next tap buys
  something they never chose. The dials scale in over exactly that window, so the
  animation *is* the "not live yet" signal.
- Re-opening the menu on the same node preserves its arming clock, so a menu the
  player is already using does not go dead again under a stray second tap.
- After a purchase the menu re-opens on the same node with fresh prices, so you
  can build a limb out without re-tapping it.
- The layout scales against a `REFERENCE_HEIGHT` of 1 canonical unit rather than
  the tree's own height. Fitting a seedling to its own height blew it up to fill
  the sky and then visibly shrank it with every branch bought.
- Direction clamping snaps an out-of-arc heading to the **angularly nearer** end
  of the allowed arc. A plain numeric clamp (the first implementation, caught by
  a test) normalised a limb leaning just past straight-up-and-left into a large
  negative angle and flung it to the opposite horizon.

**Open TODOs**

- [ ] **STEP 4 is still owed**: no camera (pan/zoom/clamping to cloud level and
      bedrock), no leaf sway animation, no background hills. The renderer draws
      the whole tree every frame with no viewport culling — fine at this size,
      but the "60fps at 500 nodes" target is unverified.
- [ ] Root growth options currently fan *upward* with the canopy ones when a
      menu mixes both (the trunk's does). Only an all-root menu arcs downward.
- [ ] Part costs and production rates are first-pass guesses (branch 15, leaf 10,
      root 12; leaf 0.4 Light/s, root 0.3 Water/s). STEP 19 owns real balance.
- [ ] `speciesId` is threaded through the graph but always `'oak'`; the species
      picker in the radial menu is STEP 10.
- [ ] `prunePart()` exists and is tested, but there is no Prune UI, no refund and
      no Deadwood yet — STEP 9.
- [ ] Roots produce Minerals from `rootTip` at a flat rate; veins, soil strata,
      depth multipliers and hydration are STEP 7. Root producers are tagged
      `'root'`, not yet `'offline'`.
- [ ] The tooltip can cover the dial it describes on a small canvas; it flips at
      viewport edges but does not avoid the menu itself.
- [ ] Radial menu has no keyboard path and no touch-friendly variant (STEP 18
      turns it into a bottom sheet on mobile).
- [ ] Replace the temporary `UpgradePanel` — still the only home for the click
      upgrades.
- [ ] Remove `debugProducers.ts` + the HUD toggle; real production now exists.
- [ ] `index.html` requests a favicon that is not in the repo (a 404 on every
      load). Pre-existing; PWA icons land in STEP 20.

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
