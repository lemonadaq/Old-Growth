# Old Growth — plan budowy w 20 promptach (wersja self-contained, z auto-push)

Kazdy STEP ponizej jest kompletny — ma wbudowany naglowek CONTEXT, wiec do agenta
(Claude Code / Gemini / GPT) wklejasz JEDEN blok i tyle. Na koncu kazdego kroku
agent sam odpala lint/testy/build, dopisuje changelog do AGENT_NOTES.md i robi
commit + push na origin/main.

Zasady pracy:

- 1 krok = 1 swieza sesja agenta (w Claude Code: `/clear` przed nastepnym krokiem).
- Poprawki w ramach kroku rob w TEJ SAMEJ sesji — wklejaj bledy, az przejda
  kryteria akceptacji. Dopiero potem nowa sesja i kolejny STEP.
- Kroki wykonuj po kolei; te juz zrobione pomin.
- Pro tip: trzymaj ten plik w repo jako PROMPTS.md i zamiast kopiowac pisz:
  "Read PROMPTS.md and execute STEP 7. Follow its CONTEXT block exactly."

## STEP 1 — Project scaffold & design spec

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 1 — Project scaffold & design spec

Create a new repo for "Old Growth", a 2D incremental/clicker game. Initialize
Vite + React 18 + TypeScript (strict), ESLint + Prettier, Vitest, Zustand,
break_infinity.js, howler. Create folders: /src/engine (pure TS logic, NO React
imports), /src/render (canvas), /src/ui (React), /src/content (data definitions).

Create PROJECT_SPEC.md at root containing this design summary verbatim:
"Old Growth is a clicker where the upgrade tree is a literal, procedurally drawn
tree. The player clicks the trunk for Sap and spends it to grow branches/leaves
(canopy = active play, produces Light) and roots (underground = idle play,
produces Water/Minerals, works offline). Placement matters: leaves shade each
other, deep roots find minerals. Key mechanics: pruning (cut limbs for a partial
refund + Deadwood resource, triggers 'apical dominance' buffs), grafting (combine
two species into discoverable hybrids), symbiont creatures (bees, ants, fungi,
songbird, squirrel), seasons + weather events, and prestige ('Go to Seed'): the
old tree joins a permanent Old Growth forest in the background while Seeds buy
Heirloom meta-upgrades. Resources: Sap, Light, Water, Minerals, Leaf Litter,
Deadwood, Seeds. Tone: cozy, warm, botanical."

Create AGENT_NOTES.md with an empty changelog section. Implement the app shell:
full-screen canvas + React HUD overlay, and an engine skeleton with a fixed
timestep loop (10 ticks/sec via accumulator) decoupled from a requestAnimationFrame
render loop. A Zustand store holds a state snapshot the UI reads.

If this folder is not a git repository yet, initialize one and make sure the
GitHub remote 'origin' is configured before the final push.

Acceptance: `npm run dev` shows a sky-to-soil gradient page with an FPS/TPS debug
counter; `npm test` and `npm run build` pass.
```

## STEP 2 — Economy core (resources, big numbers, modifiers)

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 2 — Economy core (resources, big numbers, modifiers)

In /src/engine build the economy foundation. Create a Resource registry for: sap,
light, water, minerals, leafLitter, deadwood, seeds — each with amount (Decimal
from break_infinity.js), lifetime total and a perSecond cache. Build a production
pipeline evaluated every tick: producers register {resource, baseRate, tags}.
Implement a Modifier system: modifiers target tags or resources, types 'add' and
'mul' ('pow' reserved for late game); stacking order = (base + adds) x
product(muls); every modifier has a source id so it can be removed cleanly. Add
formatNumber(): plain to 999, then K/M/B/T, scientific from 1e15, max 2 decimals.
Push engine snapshots to the Zustand store once per render frame, not per tick.

Acceptance: Vitest covers modifier stacking order, add/remove by source id, and
10 formatNumber cases. The debug HUD shows all 7 resources ticking when a
temporary test producer is enabled.
```

## STEP 3 — Tree graph data model

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 3 — Tree graph data model

In /src/engine/tree create the TreeGraph model. Node types: 'trunk', 'branch',
'twig', 'leafCluster', 'blossom', 'rootSegment', 'rootTip'. Each node: id, type,
parentId, childIds, speciesId, level, angle (radians, relative to parent),
length, thickness, createdAtTick. World positions are derived by a pure function
walking from the graph root. Growth rules as data: which child types each type
allows, max children per node, allowed angle ranges (canopy nodes grow upward
within +-70 degrees of the parent direction; root nodes grow downward). API:
getValidGrowthOptions(nodeId); grow(nodeId, childType, speciesId) returning the
new node; prune(nodeId) removing the whole subtree and returning removed nodes.
Deterministic: same action log yields identical geometry (seedable RNG for small
angle jitter). Full serialize/deserialize to plain JSON.

Acceptance: tests for growth constraints, subtree pruning, determinism, and a
serialization round-trip.
```

## STEP 4 — Canvas tree renderer + camera

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 4 — Canvas tree renderer + camera

In /src/render implement the renderer reading TreeGraph each frame. Branches:
tapered quadratic curves (thickness shrinks toward tips), bark color per species.
Leaf clusters: 3-5 overlapping soft circles in the species hue with slight
animated sway. Roots: same technique below the soil line in a desaturated earth
palette. Draw order: sky gradient (color lerps with engine time-of-day), distant
background hills (reserved for the future Old Growth forest), soil cross-section
below y=0, then the tree. Camera: vertical drag/wheel pan clamped from cloud
level to bedrock, zoom 0.5x-2.0x centered on the cursor, devicePixelRatio-aware,
resize-safe. Performance: skip nodes outside the viewport; target 60fps at 500
nodes.

Acceptance: a hardcoded demo tree (12 branches, 20 leaf clusters, 8 roots)
renders and sways; panning between canopy and roots is smooth with a trackpad
and with touch drag.
```

## STEP 5 — Clicking, crits and combo

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 5 — Clicking, crits and combo

Implement active play. Pointer hit-testing against trunk/branch segments
(distance-to-segment, generous 16px tolerance). Clicking the tree grants Sap =
clickPower (engine stat, default 1, affected by Modifiers). Feedback: floating
"+N" numbers (object-pooled, rise and fade over 600ms) and a quick ripple at the
hit point. Use pointerdown (not click) so rapid tapping works; support
multi-touch. Crits: critChance (base 2%) and critMult (base x10), gold number on
crit. Combo: consecutive clicks within a 1.5s window build a meter granting up
to +100% click power at 50 stacks; fully decays after 3s idle; render a small
meter near the cursor. Add the first purchasable upgrades in a temporary side
panel: Stronger Taps (+1 clickPower, cost 10 x 1.5^n Sap), Sharper Instincts
(+1% crit, x1.6^n), Rhythm of Growth (+10 combo cap, x2^n).

Acceptance: tests for combo accumulation/decay and crit math; zero missed inputs
at 10 taps per second.
```

## STEP 6 — Growing interaction (the tree IS the skill tree)

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 6 — Growing interaction (the tree IS the skill tree)

Build the signature interaction. Clicking any existing node opens a compact
radial menu on the canvas listing valid options from getValidGrowthOptions
(Branch, Twig, Leaf Cluster, Blossom above ground; Root Segment, Root Tip
below). Hovering an option shows a translucent ghost preview of the new part at
its actual future position and angle. Costs: each part type has a baseCost
growing x1.15 per part of that type already owned; unaffordable options are
grayed out with the missing amount shown. Build a shared Tooltip component
(React portal, follows cursor, 200ms delay) and use it to show cost plus the
production delta the part will add (e.g. "+0.4 Light/s"). Escape or clicking
elsewhere closes the menu. Purchases feel tactile: 120ms ease-out scale-in on
the new part.

Acceptance: the full loop works — click trunk for Sap, grow a branch on the
tree, grow a leaf cluster on it, watch Light/s appear in the HUD.
```

## STEP 7 — Roots, soil strata and the idle economy

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 7 — Roots, soil strata and the idle economy

Flesh out the underground. Render soil strata bands: Topsoil (0 to -300), Clay
(-300 to -800), Rock (-800 to -1600), Bedrock below. Generate seeded mineral
vein pockets, mostly in Clay/Rock. Root segments produce Water passively; a
rootTip positioned inside a vein also produces Minerals. Depth multiplier:
production x(1 + depth/500). Hydration link: canopy output (Light and click Sap)
is multiplied by hydration = clamp(waterIncome / waterNeed, 0.25, 1.5), where
waterNeed scales with leaf count — neglecting roots throttles the canopy, strong
roots overcharge it. Show hydration as a droplet gauge in the HUD with a tooltip
explaining the math. Tag all root production with an 'offline' tag (used in the
offline-progress step later).

Acceptance: tests for hydration clamping and the depth multiplier; growing 3
roots visibly raises Light/s via hydration.
```

## STEP 8 — Sunlight, day/night and leaf shading

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 8 — Sunlight, day/night and leaf shading

Engine day lasts 8 real minutes with dawn/day/dusk/night phases; render a sun
arcing across the sky and a moon at night. Each leafCluster computes
lightExposure once per second: baseline 1.0, reduced 15% per leaf cluster above
it within a 60-degree occlusion cone and 250px range (O(n^2) with early-exit is
fine under 300 leaves). Light production = sum(exposure) x modifiers, daytime
only; at night leaves produce a 10% "moonlight" trickle. Blossoms boost adjacent
leaves +25%. Show per-leaf exposure in its tooltip and tint over-shaded leaves
slightly darker so players learn to spread the canopy. Dawn bonus: the first
click of each new day grants a "Dew" burst worth 60s of current Sap/s.

Acceptance: tests for exposure math with mocked positions; visually, stacking
leaves in one spot yields clearly less Light than spreading them out.
```

## STEP 9 — Pruning, Deadwood and apical dominance

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 9 — Pruning, Deadwood and apical dominance

Add a Prune mode (scissors button in the HUD, hotkey P). In this mode, hovering
any branch highlights its whole subtree in red with a tooltip: refund preview
(40% of the Sap invested in that subtree) plus Deadwood gain proportional to
total thickness x length. Clicking asks for an inline confirm; pruning plays a
snip, drops falling-leaf particles, removes the subtree and grants the
resources. Apical dominance: pruning the node that was the highest point of the
tree grants "Lateral Surge" — a 120s refreshable buff, growth costs -25% and
Sap/s +25%, implemented via the Modifier system. Deadwood sink: a small Workshop
panel to craft up to 3 Totems planted at the tree base, each a permanent aura
chosen from Totem of Rain (+20% Water), Totem of Sun (+20% Light), Totem of
Vigor (+20% click power). Crafted totems render as carved stumps.

Acceptance: tests for refund/Deadwood math and buff expiry; pruning a large limb
and rebuilding differently feels strategic, not punishing.
```

## STEP 10 — Species and grafting discovery

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 10 — Species and grafting discovery

Create /src/content/species.ts with 6 base species as data (palette, trait
modifiers, one flavor line): Oak (+Sap, storm-resistant), Willow (+Water,
drought-resistant), Pine (reduced winter penalty), Cherry (grows blossoms often,
+crit), Birch (parts 30% cheaper but 15% weaker), Maple (+Leaf Litter in
autumn). New branches take the species chosen at purchase; a species picker
appears in the radial grow menu once 2+ species are unlocked (Oak is the
starter; define unlock milestones in content). Grafting: select two adjacent
mature branches of different species, pay Sap + Water, they merge into a hybrid
from a deterministic 15-entry combo table (e.g. Oak + Cherry = Ironblossom: crit
damage x1.5 on that limb). First-time hybrids trigger a discovery toast plus
confetti. Add a Journal screen: a grid of all species and hybrids, undiscovered
ones shown as silhouettes with a hint line.

Acceptance: all 15 hybrids defined with distinct effects; discovery state lives
in engine state; the Journal renders both discovered and silhouette states.
```

## STEP 11 — Symbiont creatures

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 11 — Symbiont creatures

Implement 5 symbionts as data plus light canvas animation. Bees: need 3+
blossoms; +3% global crit per hive level; animate 2-3 dots flying bezier paths
between blossoms. Ants: need 5+ lifetime Deadwood; a moving dotted line up the
trunk; +5% Sap (pest defense reserved for later). Mycorrhiza: need a rootTip in
the Clay layer; glowing web over roots; mineral vein detection radius +50%.
Songbird: needs tree height above a threshold; perches and every 3 minutes drops
a Seed Fragment (100 fragments = +1 Seed at prestige). Squirrel: needs an Oak
branch; buries a nut daily — next session grants one free random root segment.
Each symbiont: attraction conditions with live progress shown in a Symbionts
panel, an arrival animation and toast, and one upgrade track (levels 1-5, mixed
resource costs). Creatures must feel alive with small idle animations.

Acceptance: conditions are evaluated by the engine (tests for at least two);
the panel shows locked/progress/active states; bees visibly animate.
```

## STEP 12 — Seasons and weather events

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 12 — Seasons and weather events

Season cycle in engine time: Spring, Summer, Autumn, Winter — 20 engine-days
each (configurable in /src/content/balance). Spring: growth costs -20%. Summer:
Light +30%. Autumn: leaves recolor and Leaf Litter piles spawn at the base —
click piles to collect, or auto-collect via a Rake upgrade. Winter: Light and
growth -60%, BUT surviving a full winter adds one Ring: a permanent x1.05 to all
production, shown as a concentric-rings badge. Weather scheduler (random,
telegraphed 10s ahead via sky and audio cues): Rain (90s, Water x3, cozy
droplets), Storm (online only: a 15s brace minigame — click the flashing anchor
rapidly; each wide unbraced limb may snap into Deadwood; never destroys more
than 2 limbs), Drought (Water income -70% for 2 min; roots in the Rock layer are
immune). Seasonal palette shifts for sky, leaves and soil.

Acceptance: a full year cycles correctly in an accelerated test mode; the Ring
multiplier stacks and persists; storms can never occur during offline
simulation.
```

## STEP 13 — Prestige: Go to Seed, Heirlooms, Old Growth forest

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 13 — Prestige: Go to Seed, Heirlooms, Old Growth forest

Prestige unlocks at maturity (height + lifetime Light thresholds). "Go to Seed"
plays a 6s ceremony (leaves detach and drift upward as glowing seeds) and awards
Seeds = floor((lifetimeLight / 1e6)^0.5) + seedFragments/100. Reset the tree
graph, run resources and run upgrades; keep Seeds, Heirlooms, Rings, Journal
discoveries, Totem recipes, achievements and settings. Heirloom screen ("Seed
Vault", styled like a trunk cross-section): about 20 nodes in 4 short branches —
Start (begin with 200 Sap / one root / one branch), Memory (start with your
previous root layout), Bond (one chosen symbiont arrives instantly), Tempo
(seasons 10% shorter, offline cap +4h) — with sensible Seed cost curves. Old
Growth: each prestiged tree is saved as a compact species-tinted silhouette
rendered on the background hills, each granting +1% base production; render up
to 30 silhouettes, then show a counter.

Acceptance: the full prestige loop works twice in a row; the second run is
noticeably faster; the forest visibly accumulates in the background.
```

## STEP 14 — Offline progress

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 14 — Offline progress

On load compute elapsed = now - lastSeenTimestamp. If over 60s, simulate in 60s
coarse chunks, capped at 12h (an Heirloom raises the cap). Rules: 'offline'-
tagged production (roots) earns 100%, canopy production 25% (thematic: the tree
rests, the roots work), the day and season cycles advance, symbiont timers
advance, weather never triggers, and Rings are still awarded if a winter
completes. Then show a "While you were away" modal: duration, per-resource gains
with icons, notable events as friendly lines ("Your roots pushed into the Clay
layer", "The squirrel buried something..."), and one Collect button with a
satisfying 1.5s count-up into the HUD numbers. Offline gains must never be
negative and never cause losses.

Acceptance: tests simulating 30s (no modal), 2h, and 20h (capped) deltas; add a
manual test instruction to AGENT_NOTES.md (edit lastSeen in the save to verify).
```

## STEP 15 — Save system and migrations

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 15 — Save system and migrations

Robust persistence. Autosave to localStorage every 30s, on visibilitychange
(hidden) and before unload. Save envelope: {version: "1.0", timestamp, data}.
Create a migration registry — an ordered list of (fromVersion, migrateFn) run on
load — with unit tests using fixture saves. Corruption guard: keep the last
known-good save under a second key; if parsing fails, restore it and show a calm
toast. Settings panel additions: Export save (compressed base64 to clipboard),
Import save (textarea, validated before applying), Hard Reset (type "UPROOT" to
confirm; keeps nothing). The save must include: engine version, tree graph,
resources, lifetime stats, discoveries, heirlooms, rings, old-growth list,
symbionts, settings, playtime.

Acceptance: an integration test proves export -> hard reset -> import restores
the exact state; a deliberately corrupted save falls back gracefully.
```

## STEP 16 — Audio and game feel

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 16 — Audio and game feel

Audio via Howler with a small AudioManager (master/music/sfx volumes persisted,
default 70%, mute hotkey M). No licensed assets exist yet, so synthesize
placeholder SFX with WebAudio short envelopes: soft pop (click, pitch +-10%),
deeper thock (crit), sprout swish (grow), snip (prune), chime arpeggio (graft
discovery), shimmer (prestige), rain/wind noise loops for weather. Create
/public/audio/ASSETS_TODO.md listing the final files wanted (name, length, mood)
for later replacement. Ambient music: one very quiet generative pentatonic pad
per season using WebAudio oscillators; seamless loop; must never be annoying.
Juice pass: eased scale-in on growth, wind-drift leaf particles, HUD numbers
tween instead of jumping, subtle hill parallax while panning, button hover and
press micro-states. Respect prefers-reduced-motion: disable sway, particles and
camera movement.

Acceptance: every core action has audible and visual feedback; mute works;
reduced-motion mode verified.
```

## STEP 17 — Onboarding and feature gating

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 17 — Onboarding and feature gating

Script the first session so a new player is never lost, with no modal walls.
Beat 1: a lone sapling with a pulsing "tap me" hint until 10 Sap. Beat 2: an
arrow points at the trunk, guiding the radial menu and the first branch
purchase. Beat 3: after the first leaf, a one-line card explains Light. Beat 4:
at 150 lifetime Sap the camera auto-pans down once with "Something stirs
below..." and roots unlock. Put the feature gating table in
/src/content/progression.ts as the single source of truth: Pruning unlocks at 8
grown parts, the species picker at a milestone you define, Grafting after owning
2 species, the Symbionts panel once any symbiont condition reaches 50%, Seasons
UI always visible, the Prestige button appears only at 75% maturity (grayed with
progress). Contextual hints: small dismissable bubbles, each shown at most once,
resettable in Settings. Add a Help tab to the Journal describing every mechanic
in-fiction.

Acceptance: a fresh-save playthrough reaches roots within ~4 minutes without
reading anything; no hint ever repeats after being dismissed.
```

## STEP 18 — Final UI, mobile and accessibility

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 18 — Final UI, mobile and accessibility

Replace all temporary panels with the final HUD. Top bar: resource chips (icon +
formatted amount, per-second in tooltip), hydration droplet, season/day
indicator with the Ring badge. Bottom dock: Grow (default), Prune, Journal,
Symbionts, Seed Vault, Settings — panels slide in from the right, one open at a
time, Esc closes. Mobile (down to 390px wide): touch targets 44px+, pinch zoom,
dock becomes bottom tabs, the radial menu becomes a bottom sheet; handle iOS
Safari quirks (no hover — tooltips on long-press). Accessibility: full keyboard
navigation with visible focus, aria labels on all controls, species palettes
verified for color-blindness plus a patterns-on-leaves toggle, font scaling
setting (90-130%). i18n scaffold: route every string through a t() helper backed
by /src/content/i18n/en.json (a Polish translation comes later — hardcode
nothing new). Performance: cull off-screen nodes, pause rendering when the tab
is hidden, memoize React panels.

Acceptance: Lighthouse accessibility score 90+; the game is playable end-to-end
with keyboard only; smooth on a mid-range Android phone in Chrome.
```

## STEP 19 — Balance pass, achievements and simulation harness

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 19 — Balance pass, achievements and simulation harness

Centralize every tunable number in /src/content/balance.ts (costs, curves,
thresholds, season lengths, offline caps) — no magic numbers left in engine code
(add a script that greps for numeric literals in /src/engine and fails CI on new
ones outside a whitelist). Build a headless simulation: `npm run sim` runs the
engine without a DOM using three bot strategies — clicker-focused, root-focused,
balanced — and prints time-to-milestone tables (first branch, roots unlocked,
first graft, first symbiont, first prestige, second prestige). Tune balance.ts
until: first branch under 30s, roots at ~3-4 min, first graft ~15 min, first
prestige 45-75 min, second prestige roughly half the first, and no strategy more
than 2x better than the others. Document the final curves and reasoning in
BALANCE.md. Add 30 data-driven achievements (toast + a Journal tab), about 10 of
them granting +1% bonuses, and a Stats panel (lifetime totals, clicks, prunes,
trees grown).

Acceptance: sim output committed into BALANCE.md; achievement triggers covered
by tests for 5 sample cases.
```

## STEP 20 — Release build and deployment

```
CONTEXT:
You are building "Old Growth", a 2D web incremental/clicker game where the upgrade
tree is a literal, procedurally drawn tree. Stack: Vite + React 18 + TypeScript
(strict), Zustand, HTML5 Canvas 2D, break_infinity.js, Howler, Vitest.
Architecture: /src/engine = pure TS game logic (no React imports), /src/render =
canvas, /src/ui = React, /src/content = data definitions.
Before doing anything, read PROJECT_SPEC.md and AGENT_NOTES.md in the repo root
(if they don't exist yet, they are created in STEP 1).
When finished: run `npm run lint`, `npm test` and `npm run build`, and fix all
errors. Then append a dated changelog entry with open TODOs to AGENT_NOTES.md,
commit everything with a descriptive message ("step N: short summary") and push
to origin main. Never force-push.
Do not refactor unrelated code. Keep everything data-driven and strictly typed.

STEP 20 — Release build and deployment

Ship it. Add a React error boundary that preserves the save and shows a friendly
recovery screen with an export button. Strip console logs in production; run
bundle analysis and keep total JS under 1.2MB gzipped. PWA: manifest (name "Old
Growth", theme colors from the palette), 192/512 icons generated from a simple
tree glyph SVG you create, and a service worker caching the app shell for
offline play. Meta: title, description ("A cozy clicker where the skill tree is
a real tree"), and an OG image placeholder (1200x630, tree glyph on a gradient).
Scripts: `npm run deploy:vercel` (static, vercel.json included) and `npm run
package:itch` producing a zip with index.html at its root for itch.io upload.
Write README.md (screenshot placeholder, feature list, dev setup) and CREDITS.md
(libraries plus an audio licensing TODO). Execute a QA checklist and record it
in AGENT_NOTES.md: fresh save flow, export/import, 8h offline, two prestiges in
a row, mobile Safari, keyboard-only run, reduced motion, hard reset. Tag v1.0.0.

Acceptance: the production build deploys and runs from a static host with no
console errors; the PWA installs on Android and desktop Chrome.
```
